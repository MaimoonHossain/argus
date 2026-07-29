// apps/worker/src/index.ts
import { httpServer, io } from './socket';
import { ingestWorker, researchWorker } from './queues';

io.on('connection', (socket) => {
    console.log(`[Socket] Frontend UI connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`[Socket] Frontend UI disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`Argus Worker is alive on port ${PORT}`);
    console.log(`Listening for WebSockets, HTTP /health, and BullMQ jobs...`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Cleaning up worker and sockets...');
    await researchWorker.close();
    await ingestWorker.close();
    httpServer.close();
    process.exit(0);
});