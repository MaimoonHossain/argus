// apps/worker/src/pipeline/researcher.ts
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { db, researchJobs, knowledgeChunks } from '@argus/db';
import { eq, sql } from 'drizzle-orm';
import { embedQuestion } from '../llm/gemini';
import { GoogleGenAI } from '@google/genai';
import { tavily } from '@tavily/core';
import { Job } from 'bullmq';
import { io } from '../socket';

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY! });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// 1. Add routeDecision to State
const AgentState = Annotation.Root({
    jobId: Annotation<string>(),
    question: Annotation<string>(),
    localContext: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    webContext: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    finalAnswer: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    sources: Annotation<{ title: string; url: string }[]>({
        reducer: (state, update) => state.concat(update),
        default: () => []
    }),
    routeDecision: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "both" }),
});

// 2. NEW NODE: The Router
async function router(state: typeof AgentState.State) {
    console.log(`[Node] Routing question: "${state.question}"`);

    // Set initial status so the UI knows we are active
    io.emit('job-update', { id: state.jobId, status: 'researching' });

    const prompt = `You are a routing agent. Analyze this question: "${state.question}"
  Decide the best data retrieval path.
  Options:
  - "both": Needs internal/local knowledge AND recent live web data.
  - "local": ONLY needs internal/local knowledge base.
  - "web": ONLY needs current events, real-time data, or live internet searches.
  - "direct": General greetings (e.g. "hi") or basic knowledge that requires NO search.
  Respond with exactly ONE of those four words and nothing else.`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { temperature: 0 } // Keep it deterministic
    });

    const decision = response.text?.trim().toLowerCase() || "both";
    console.log(`[Router] Decision made: ${decision}`);

    return { routeDecision: decision };
}

// 3. Node: Search Neon pgvector
async function retrieveLocal(state: typeof AgentState.State) {
    console.log(`[Node] Executing Local Vector Search...`);
    const embedding = await embedQuestion(state.question);

    const results = await db.select()
        .from(knowledgeChunks)
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

    const prompt = `You are an expert research assistant. Answer the user's question.
  LOCAL CONTEXT: ${state.localContext}
  WEB CONTEXT: ${state.webContext}
  QUESTION: ${state.question}`;

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

    return { finalAnswer };
}

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

const app = workflow.compile();

// 7. BullMQ Entrypoint
export async function processResearchJob(job: Job) {
    const { jobId } = job.data;
    const jobRecord = await db.query.researchJobs.findFirst({ where: eq(researchJobs.id, jobId) });
    if (!jobRecord) throw new Error("Job not found");

    try {
        await app.invoke({ jobId: jobRecord.id, question: jobRecord.question });
    } catch (error: any) {
        console.error(`[Worker Error] Job ${jobId} failed:`, error);
        await db.update(researchJobs).set({ status: 'failed', errorMessage: error.message }).where(eq(researchJobs.id, jobId));
        io.emit('job-update', { id: jobId, status: 'failed', errorMessage: error.message });
        throw error;
    }
}