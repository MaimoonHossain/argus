// apps/worker/src/pipeline/researcher.ts
import { Job } from 'bullmq';
import { db, researchJobs, knowledgeChunks } from '@argus/db';
import { eq, sql } from 'drizzle-orm';
import { embedQuestion, generateAnswer } from '../llm/gemini';

export async function processResearchJob(job: Job) {
    const { jobId } = job.data;

    try {
        // a) Update status to processing ('researching')
        await db.update(researchJobs).set({ status: 'researching' }).where(eq(researchJobs.id, jobId));

        // Fetch the user's question from the database
        const jobRecord = await db.select().from(researchJobs).where(eq(researchJobs.id, jobId)).limit(1);
        if (!jobRecord.length) throw new Error('Job not found');
        const question = jobRecord[0].question;

        // b) Embed the question
        const embedding = await embedQuestion(question);
        const embeddingSql = `[${embedding.join(',')}]`;

        // c) Vector similarity search (Cosine distance using pgvector '<=>' operator)
        const similarChunks = await db.select({
            content: knowledgeChunks.content,
        })
            .from(knowledgeChunks)
            .orderBy(sql`${knowledgeChunks.embedding} <=> ${embeddingSql}`)
            .limit(5);

        // d) Call the LLM
        const contextText = similarChunks.map(c => c.content).join('\n\n');
        const finalAnswer = await generateAnswer(contextText, question);

        // e) Persist final answer
        await db.update(researchJobs).set({
            status: 'complete',
            finalAnswer,
            updatedAt: new Date()
        }).where(eq(researchJobs.id, jobId));

    } catch (error: any) {
        // Handle failures gracefully
        await db.update(researchJobs).set({
            status: 'failed',
            errorMessage: error.message,
            updatedAt: new Date()
        }).where(eq(researchJobs.id, jobId));
        throw error; // Re-throw to inform BullMQ of the failure
    }
}