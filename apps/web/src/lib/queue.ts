// apps/web/src/lib/queue.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Use a fallback so local development never crashes if the env var is missing
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
});

export const researchQueue = new Queue('research-pipeline', { connection });