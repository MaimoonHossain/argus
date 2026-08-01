// apps/worker/src/pipeline/researcher.ts
import { StateGraph, START, END, Annotation, MemorySaver } from '@langchain/langgraph';
import { db, researchJobs, knowledgeChunks, semanticCache } from '@argus/db';
import { eq, or, sql } from 'drizzle-orm';
import { embedQuestion } from '../llm/gemini';
import { GoogleGenAI } from '@google/genai';
import { tavily } from '@tavily/core';
import { Job } from 'bullmq';
import { io } from '../socket';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY! });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// 1. Add routeDecision to States
const AgentState = Annotation.Root({
    jobId: Annotation<string>(),
    sessionId: Annotation<string>(),
    question: Annotation<string>(),

    messages: Annotation<BaseMessage[]>({
        reducer: (state, update) => {
            // Append the new messages
            const newMessages = state.concat(update);
            // Slice it to keep only the last 4 messages (2 User, 2 AI)
            return newMessages.slice(-4);
        },
        default: () => []
    }),

    isCacheHit: Annotation<boolean>({ reducer: (state, update) => update ?? state, default: () => false }),
    localContext: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    webContext: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    finalAnswer: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    sources: Annotation<{ title: string; url: string }[]>({
        reducer: (state, update) => state.concat(update),
        default: () => []
    }),
    routeDecision: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "both" }),
    searchCount: Annotation<number>({
        reducer: (x: number, y: number) => y ?? x ?? 0,
        default: () => 0
    }),
    isContextSufficient: Annotation<boolean>({
        reducer: (x: boolean, y: boolean) => y ?? x ?? false,
        default: () => false
    })
});

function routeAfterCache(state: typeof AgentState.State) {
    if (state.isCacheHit) {
        console.log("[Graph] Cache hit! Skipping research workflow.");
        return 'end'; // Jumps to END
    }
    console.log("[Graph] Cache miss. Proceeding to router.");
    return 'router'; // Continues standard workflow
}

async function checkCache(state: typeof AgentState.State) {
    console.log(`[Node] Checking Semantic Cache for: "${state.question}"`);

    const embedding = await embedQuestion(state.question);

    // We fetch the absolute closest matching question in the DB, regardless of strict bounds
    const results = await db.select({
        question: semanticCache.question,
        answer: semanticCache.answer,
        distance: sql<number>`${semanticCache.questionEmbedding} <=> ${JSON.stringify(embedding)}`
    })
        .from(semanticCache)
        .where(
            or(
                eq(semanticCache.sessionId, state.sessionId),
                eq(semanticCache.sessionId, 'global')
            )
        )
        .orderBy(sql`${semanticCache.questionEmbedding} <=> ${JSON.stringify(embedding)}`)
        .limit(1);

    if (results.length > 0) {
        const distance = Number(results[0].distance);
        console.log(`[Cache] Closest past question: "${results[0].question}"`);
        console.log(`[Cache] Vector Distance: ${distance.toFixed(4)}`);

        // Relaxed threshold: 0.15 allows for semantic phrasing variations (~85% similarity)
        const similarityThreshold = 0.25;

        if (distance < similarityThreshold) {
            console.log(`[Cache] 🎯 HIT! Distance is below threshold. Skipping LLM.`);

            // Instantly update the UI status and provide the cached answer!
            await db.update(researchJobs)
                .set({ status: 'complete', finalAnswer: results[0].answer })
                .where(eq(researchJobs.id, state.jobId));

            io.emit('job-update', {
                id: state.jobId,
                status: 'complete',
                finalAnswer: results[0].answer
            });

            return {
                isCacheHit: true,
                finalAnswer: results[0].answer
            };
        } else {
            console.log(`[Cache] MISS. Match was not close enough (needed < ${similarityThreshold}).`);
        }
    } else {
        console.log(`[Cache] MISS. Cache is empty.`);
    }

    return { isCacheHit: false };
}
// 2. NEW NODE: The Router + Query Rewriter
async function router(state: typeof AgentState.State) {
    console.log(`[Node] Routing & Contextualizing question: "${state.question}"`);
    io.emit('job-update', { id: state.jobId, status: 'researching' });

    // 1. Format past conversation history
    const historyText = state.messages
        .slice(0, -1) // Exclude the current message that was just added
        .map(m => `${m instanceof HumanMessage ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

    // 2. Fetch Uploaded Document Context
    // We fetch distinct document names associated with this session to give the router hints.
    const uploadedDocs = await db
        .select({ source: sql<string>`split_part(content, '\n\n', 1)` }) // Grabs the [Source: filename] tag
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.sessionId, state.sessionId))
        .groupBy(sql`split_part(content, '\n\n', 1)`);

    const docNames = uploadedDocs.map(d => d.source.replace('[Source: ', '').replace(']', '')).join(', ');

    // --- NEW: THE HARD OVERRIDE ---
    // If the user asks about something that directly matches a document name, 
    // bypass the LLM's routing logic and force it to check local first.
    const questionLower = state.question.toLowerCase();
    const isDirectMatch = uploadedDocs.some(doc => {
        const cleanName = doc.source.replace('[Source: ', '').replace('.pdf', '').replace('.txt', '').replace(']', '').toLowerCase();
        // Check if any significant word from the filename is in the question
        return cleanName.split(' ').some(word => word.length > 3 && questionLower.includes(word));
    });

    let forcedRoute = null;
    if (isDirectMatch) {
        console.log(`[Router] ⚠️ Direct match found with uploaded document. Forcing local route.`);
        forcedRoute = "local";
    }

    // 3. The Optimized Prompt
    const prompt = `You are an intelligent routing and query-rewriting agent.

    PAST CONVERSATION HISTORY:
    ${historyText || "No previous conversation."}

    UPLOADED LOCAL DOCUMENTS FOR THIS USER: 
    ${docNames || "None"}

    CURRENT USER QUESTION: "${state.question}"

    TASK 1 (Query Rewriting): If the CURRENT USER QUESTION uses pronouns or implicit references, rewrite it into a clear, standalone search query using context from PAST CONVERSATION HISTORY. If it is already standalone, leave it unchanged.

    TASK 2 (Routing): Decide the best data retrieval path.
    Options:
    - "local": USE THIS FIRST if the question relates in any way to the subjects covered in the UPLOADED LOCAL DOCUMENTS. 
    - "web": Use this ONLY for current events, news, or topics clearly NOT covered in the local documents.
    - "both": Use this ONLY if the question explicitly demands comparing local documents against live internet data.
    - "direct": General greetings (e.g. "hi") that require NO search.

    Respond strictly in JSON format like this:
    {
        "rewrittenQuestion": "the standalone question here",
        "routeDecision": "both" | "local" | "web" | "direct"
    }`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            temperature: 0,
            responseMimeType: "application/json" // Force strict JSON output
        }
    });

    try {
        const result = JSON.parse(response.text || "{}");
        const decision = forcedRoute || result.routeDecision || "local";
        const rewrittenQuestion = result.rewrittenQuestion || state.question;

        console.log(`[Router] Rewritten Question: "${rewrittenQuestion}"`);
        console.log(`[Router] Decision made: ${decision}`);

        // Returning both updates state.question AND state.routeDecision!
        return {
            question: rewrittenQuestion,
            routeDecision: decision
        };
    } catch (err) {
        console.error("[Router] JSON Parse failed, falling back", err);
        return {
            question: state.question,
            routeDecision: forcedRoute || "local"
        };
    }
}
// 3. Node: Search Neon pgvector
async function retrieveLocal(state: typeof AgentState.State) {
    console.log(`[Node] Executing Local Vector Search...`);
    const embedding = await embedQuestion(state.question);

    const results = await db.select()
        .from(knowledgeChunks)
        .where(
            or(
                eq(knowledgeChunks.sessionId, state.sessionId),
                eq(knowledgeChunks.sessionId, 'global') // Fallback for pre-seeded data
            )
        )
        .orderBy(sql`${knowledgeChunks.embedding} <=> ${JSON.stringify(embedding)}`)
        .limit(3);

    const context = results.map(r => r.content).join('\n\n');
    return { localContext: context };
}

// 4. Node: Search Tavily
async function searchLiveWeb(state: typeof AgentState.State) {
    console.log(`[Node] Executing Live Web Search...`);
    try {
        const response = await tvly.search(state.question, { searchDepth: "basic", maxResults: 3 });
        const webInfo = response.results.map((r: any) => `Source: ${r.title}\n${r.content}`).join('\n\n');

        const webSources = response.results.map((r: any) => ({
            title: r.title,
            url: r.url
        }));

        io.emit('job-sources', { id: state.jobId, sources: webSources });
        return { webContext: webInfo, sources: webSources };
    } catch (error) {
        console.error("Tavily error:", error);
        return { webContext: "Web search failed.", sources: [] };
    }
}

// 5. Node: Gemini Synthesis
async function synthesize(state: typeof AgentState.State) {
    console.log(`[Node] Synthesizing final answer...`);

    await db.update(researchJobs).set({ status: 'synthesizing' }).where(eq(researchJobs.id, state.jobId));
    io.emit('job-update', { id: state.jobId, status: 'synthesizing' });

    // Format history for context
    const historyText = state.messages
        .map(m => `${m instanceof HumanMessage ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

    const prompt = `You are Argus, an expert AI research agent.

CRITICAL RULE FOR COMPARISONS:
Whenever the user asks to compare two or more items, technologies, or concepts, DO NOT use standard Markdown tables. 
Instead, wrap the comparison inside a custom <compare_matrix> XML tag containing a valid JSON array of objects.

Example Output Format:
<compare_matrix>
[
  { "Feature": "Routing Model", "App Router": "File-system based (app/)", "Pages Router": "File-system based (pages/)" },
  { "Feature": "Default Rendering", "App Router": "Server Components", "Pages Router": "Client Components" }
]
</compare_matrix>

USER QUESTION: ${state.question}
CONTEXT:
${state.webContext || state.localContext || 'No additional context needed.'}

Synthesize a helpful answer. Write regular text before or after the <compare_matrix> block.`;

    const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: prompt,
    });

    let fullAnswer = "";
    for await (const chunk of responseStream) {
        if (chunk.text) {
            fullAnswer += chunk.text;
            io.emit('job-stream', { id: state.jobId, chunk: chunk.text });
        }
    }

    const finalAnswer = fullAnswer || "Failed to generate an answer.";

    await db.update(researchJobs).set({ status: 'complete', finalAnswer }).where(eq(researchJobs.id, state.jobId));
    io.emit('job-update', { id: state.jobId, status: 'complete', finalAnswer });

    // --- NEW: WRITE TO SEMANTIC CACHE ---
    try {
        console.log(`[Cache] Saving new answer to Semantic Cache...`);
        // We embed the original question to save alongside the answer
        const questionEmbedding = await embedQuestion(state.question);

        await db.insert(semanticCache).values({
            sessionId: state.sessionId,
            question: state.question,
            questionEmbedding: questionEmbedding,
            answer: finalAnswer,
        });
        console.log(`[Cache] ✅ Successfully saved to cache.`);
    } catch (err) {
        console.error(`[Cache] ❌ Failed to save to cache`, err);
    }
    // ------------------------------------

    // Append the AI's response to the messages array
    return {
        finalAnswer,
        messages: [new AIMessage(finalAnswer)]
    };
}

async function evaluateContext(state: typeof AgentState.State) {
    console.log(`[Node] Evaluating retrieved context...`);

    // Fail-safe to prevent infinite loops (Max 2 searches)
    if (state.searchCount >= 1) {
        console.log(`[Evaluate] Max retries reached. Forcing synthesis.`);
        return { isContextSufficient: true, searchCount: state.searchCount + 1 };
    }

    const prompt = `You are a strict grading assistant. Your job is to check if the provided context contains the answer to the user's question.
    
    USER QUESTION: ${state.question}
    LOCAL CONTEXT: ${state.localContext || 'None'}
    WEB CONTEXT: ${state.webContext || 'None'}

    If the context contains enough factual information to write a complete answer, output EXACTLY the word: YES
    If the context is irrelevant, empty, or missing key facts, output EXACTLY the word: NO`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
    });

    const answer = (response.text || '').trim().toUpperCase();
    const isSufficient = answer.includes('YES');

    console.log(`[Evaluate] Context sufficient? ${isSufficient ? '✅ YES' : '❌ NO'}`);

    return {
        isContextSufficient: isSufficient,
        searchCount: (state.searchCount || 0) + 1
    };
}

async function rewriteQuery(state: typeof AgentState.State) {
    console.log(`[Node] Context failed. Rewriting search query...`);

    const prompt = `The previous search results did not contain the answer. 
    ORIGINAL QUESTION: ${state.question}
    
    Generate a new, broader, or alternative search query to find the correct information.
    Output ONLY the new search query string, nothing else.`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
    });

    const newQuery = (response.text || '').trim();
    console.log(`[Rewrite] Old Query: ${state.question}`);
    console.log(`[Rewrite] New Query: ${newQuery}`);

    // Update the UI so the user knows Argus is trying harder
    io.emit('job-update', {
        id: state.jobId,
        status: 'researching',
        chunk: `\n\n*Initial search failed. Expanding search to: "${newQuery}"...*\n\n`
    });

    return {
        question: newQuery, // Overwrite the state question so the router uses the new one
    };
}

function routeDecision(state: typeof AgentState.State) {
    if (state.routeDecision === 'local') return 'local';
    if (state.routeDecision === 'web') return 'web';
    if (state.routeDecision === 'both') return 'both'; // if you have a parallel both route
    return 'synthesize'; // direct route fallback
}

// Initialize the checkpointer
const checkpointer = new MemorySaver();

// 6. Compile the Agentic Graph
const workflow = new StateGraph(AgentState)
    .addNode('checkCache', checkCache)
    .addNode("router", router)
    .addNode("retrieveLocal", retrieveLocal)
    .addNode("searchLiveWeb", searchLiveWeb)
    .addNode("evaluateContext", evaluateContext)
    .addNode("rewriteQuery", rewriteQuery)
    .addNode("synthesize", synthesize)

    // 1. Graph execution now starts at the Cache Check
    .addEdge(START, "checkCache")

    // 2. If Cache Hits -> END. If Miss -> router.
    .addConditionalEdges("checkCache", routeAfterCache)

    // 3. Conditional Edge: Where does the router send us?
    // Map the string returns from your function to the actual Node names!
    .addConditionalEdges("router", routeDecision, {
        local: "retrieveLocal",
        web: "searchLiveWeb",
        both: "retrieveLocal",
        synthesize: "synthesize"
    })

    // 4. Conditional Edge: If we went local, do we also need web?
    .addConditionalEdges("retrieveLocal", (state) => {
        if (state.routeDecision === "both") return "searchLiveWeb";
        return "evaluateContext";
    })

    // 5. If we hit the web, always synthesize next
    .addEdge("searchLiveWeb", "evaluateContext")

    // NEW: The Evaluation Logic Edge
    .addConditionalEdges("evaluateContext", (state) => {
        if (state.isContextSufficient) {
            console.log("[Graph] Context is good. Proceeding to Synthesize.");
            return "synthesize";
        }
        console.log("[Graph] Context is bad. Proceeding to Rewrite.");
        return "rewriteQuery";
    })

    // NEW: The Loop
    .addEdge("rewriteQuery", "router") // Jump back to the router with the new query!

    .addEdge("synthesize", END);

export const app = workflow.compile({ checkpointer });

// 7. BullMQ Entrypoint
export async function processResearchJob(job: Job) {
    const { jobId, threadId } = job.data;
    const jobRecord = await db.query.researchJobs.findFirst({ where: eq(researchJobs.id, jobId) });
    if (!jobRecord) throw new Error("Job not found");

    // We use a hardcoded thread string if one isn't provided yet
    const config = { configurable: { thread_id: threadId || "default-session" } };

    try {
        await app.invoke({
            jobId: jobRecord.id,
            sessionId: threadId || "default-session",
            question: jobRecord.question,
            messages: [new HumanMessage(jobRecord.question)]
        }, config);
    } catch (error: any) {
        console.error(`[Worker Error] Job ${jobId} failed:`, error);
        await db.update(researchJobs).set({ status: 'failed', errorMessage: error.message }).where(eq(researchJobs.id, jobId));
        io.emit('job-update', { id: jobId, status: 'failed', errorMessage: error.message });
        throw error;
    }
}

