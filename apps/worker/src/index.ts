// apps/worker/src/index.ts
import express from 'express';
import { researchWorker } from './queues';

const app = express();

// The throwaway route that keeps Render's free Web Service tier happy
app.get('/health', (_req, res) => res.sendStatus(200));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Argus Worker is alive on port ${PORT}`);
    console.log(`Listening for jobs on 'research-pipeline' queue...`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    await researchWorker.close();
    process.exit(0);
});