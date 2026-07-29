// apps/worker/src/pipeline/ingester.ts
import { Job } from 'bullmq';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { db, knowledgeChunks } from '@argus/db';
import { embedQuestion } from '../llm/gemini'; // Your existing embedding function

export async function processIngestJob(job: Job) {
    const { filename, text, sessionId } = job.data;
    console.log(`[Ingester] Processing ${filename} for session ${sessionId}...`);

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    const chunks = await splitter.createDocuments([text]);
    console.log(`[Ingester] Created ${chunks.length} chunks. Embedding...`);

    for (const chunk of chunks) {
        try {
            const embedding = await embedQuestion(chunk.pageContent);

            await db.insert(knowledgeChunks).values({
                content: `[Source: ${filename}]\n\n${chunk.pageContent}`,
                embedding: embedding,
                sessionId: sessionId // Tagging the row with the user's ID!
            });
        } catch (err) {
            console.error(`[Ingester] Failed to embed chunk for ${filename}`, err);
        }
    }
    console.log(`[Ingester] ✅ Successfully ingested ${filename}`);
}