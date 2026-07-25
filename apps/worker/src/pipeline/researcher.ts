// apps/worker/src/pipeline/researcher.ts
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { db, researchJobs, knowledgeChunks } from '@argus/db';
import { eq, sql } from 'drizzle-orm';
import { embedQuestion } from '../llm/gemini';
import { GoogleGenAI } from '@google/genai';
import { tavily } from '@tavily/core';
import { Job } from 'bullmq';
import { io } from '../socket';

// Initialize external clients
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY! });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// 1. Define the Global State (Our AI's memory)
const AgentState = Annotation.Root({
    jobId: Annotation<string>(),
    question: Annotation<string>(),
    localContext: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    webContext: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
    finalAnswer: Annotation<string>({ reducer: (state, update) => update ?? state, default: () => "" }),
});

// 2. Node: Search Neon pgvector
async function retrieveLocal(state: typeof AgentState.State) {
    console.log(`[Node] Searching Postgres for: "${state.question}"`);

    // Update Database
    await db.update(researchJobs)
        .set({ status: 'researching' })
        .where(eq(researchJobs.id, state.jobId));

    // Broadcast real-time event to connected UI clients
    io.emit('job-update', {
        id: state.jobId,
        status: 'researching'
    });

    const embedding = await embedQuestion(state.question);

    // Use pgvector distance operator directly in orderBy for index acceleration
    const results = await db.select()
        .from(knowledgeChunks)
        .orderBy(sql`${knowledgeChunks.embedding} <=> ${JSON.stringify(embedding)}`)
        .limit(3);

    const context = results.map(r => r.content).join('\n\n');
    return { localContext: context };
}

// 3. Node: Search Tavily (Live Web)
async function searchLiveWeb(state: typeof AgentState.State) {
    console.log(`[Node] Hitting Tavily Web Search...`);

    try {
        const response = await tvly.search(state.question, {
            searchDepth: "basic",
            maxResults: 3,
        });

        const webInfo = response.results.map((r: any) => `Source: ${r.title}\n${r.content}`).join('\n\n');
        return { webContext: webInfo };
    } catch (error) {
        console.error("Tavily error:", error);
        return { webContext: "Web search failed or unavailable." };
    }
}

// 4. Node: Gemini Synthesis
async function synthesize(state: typeof AgentState.State) {
    console.log(`[Node] Synthesizing final answer...`);

    // Update Database
    await db.update(researchJobs)
        .set({ status: 'synthesizing' })
        .where(eq(researchJobs.id, state.jobId));

    // Broadcast real-time event
    io.emit('job-update', {
        id: state.jobId,
        status: 'synthesizing'
    });

    const prompt = `You are an expert research assistant. Answer the user's question using the provided context. 
  
  LOCAL DATABASE CONTEXT:
  ${state.localContext}
  
  LIVE WEB CONTEXT:
  ${state.webContext}
  
  QUESTION: ${state.question}`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
    });

    const finalAnswer = response.text || "Failed to generate an answer.";

    // Update Database with complete status and final payload
    await db.update(researchJobs)
        .set({ status: 'complete', finalAnswer })
        .where(eq(researchJobs.id, state.jobId));

    // Broadcast completion event with the generated answer
    io.emit('job-update', {
        id: state.jobId,
        status: 'complete',
        finalAnswer
    });

    return { finalAnswer };
}

// 5. Compile the Graph
const workflow = new StateGraph(AgentState)
    .addNode("retrieveLocal", retrieveLocal)
    .addNode("searchLiveWeb", searchLiveWeb)
    .addNode("synthesize", synthesize)
    .addEdge(START, "retrieveLocal")
    .addEdge("retrieveLocal", "searchLiveWeb")
    .addEdge("searchLiveWeb", "synthesize")
    .addEdge("synthesize", END);

const app = workflow.compile();

// 6. The BullMQ Entrypoint
export async function processResearchJob(job: Job) {
    const { jobId } = job.data;

    const jobRecord = await db.query.researchJobs.findFirst({
        where: eq(researchJobs.id, jobId)
    });

    if (!jobRecord) throw new Error("Job not found");

    try {
        // Kick off the LangGraph execution
        await app.invoke({
            jobId: jobRecord.id,
            question: jobRecord.question,
        });
    } catch (error: any) {
        const errorMessage = error?.message || "An unexpected error occurred during research.";
        console.error(`[Worker Error] Job ${jobId} failed:`, error);

        // Persist failure state to Database
        await db.update(researchJobs)
            .set({ status: 'failed', errorMessage })
            .where(eq(researchJobs.id, jobId));

        // Broadcast failure event
        io.emit('job-update', {
            id: jobId,
            status: 'failed',
            errorMessage
        });

        throw error;
    }
}