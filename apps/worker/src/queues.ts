// apps/worker/src/queues.ts
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processResearchJob } from './pipeline/researcher';

if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');

// Upstash requires maxRetriesPerRequest: null
export const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

export const researchQueue = new Queue('research-pipeline', { connection });

// Initialize worker with mitigations to prevent Upstash idle command burn
export const researchWorker = new Worker('research-pipeline', processResearchJob, {
    connection,
    concurrency: 3,
    stalledInterval: 300000, // Check for stalled jobs every 5 mins (reduces idle polling)
    lockDuration: 60000,
});