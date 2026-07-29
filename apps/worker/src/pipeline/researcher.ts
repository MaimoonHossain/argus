// apps/worker/src/pipeline/researcher.ts
import { StateGraph, START, END, Annotation, MemorySaver } from '@langchain/langgraph';
import { db, researchJobs, knowledgeChunks } from '@argus/db';
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

    localContext: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    webContext: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    finalAnswer: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    sources: Annotation<{ title: string; url: string }[]>({
        reducer: (state, update) => state.concat(update),
        default: () => []
    }),
    routeDecision: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "both" }),
});

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

    const prompt = `You are an expert research assistant. Answer the user's current question using the context below.

    PAST CONVERSATION (for context):
    ${historyText || "No previous conversation."}

    LOCAL CONTEXT: ${state.localContext}
    WEB CONTEXT: ${state.webContext}
    
    CURRENT QUESTION: ${state.question}`;

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

    // Append the AI's response to the messages array
    return {
        finalAnswer,
        messages: [new AIMessage(finalAnswer)]
    };
}

// Initialize the checkpointer
const checkpointer = new MemorySaver();

// 6. Compile the Agentic Graph
const workflow = new StateGraph(AgentState)
    .addNode("router", router)
    .addNode("retrieveLocal", retrieveLocal)
    .addNode("searchLiveWeb", searchLiveWeb)
    .addNode("synthesize", synthesize)

    // Start at the router
    .addEdge(START, "router")

    // Conditional Edge: Where does the router send us?
    .addConditionalEdges("router", (state) => {
        if (state.routeDecision === "local" || state.routeDecision === "both") return "retrieveLocal";
        if (state.routeDecision === "web") return "searchLiveWeb";
        return "synthesize"; // "direct" route
    })

    // Conditional Edge: If we went local, do we also need web?
    .addConditionalEdges("retrieveLocal", (state) => {
        if (state.routeDecision === "both") return "searchLiveWeb";
        return "synthesize";
    })

    // If we hit the web, always synthesize next
    .addEdge("searchLiveWeb", "synthesize")
    .addEdge("synthesize", END);

const app = workflow.compile({ checkpointer });

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