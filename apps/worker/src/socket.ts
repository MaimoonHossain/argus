// apps/worker/src/socket.ts
import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';

export const app = express();

// Render / Cloud deployment health check route
app.get('/health', (_req, res) => {
    res.sendStatus(200);
});

export const httpServer = createServer(app);

export const io = new Server(httpServer, {
    cors: {
        origin: '*', // Allows local Next.js frontend to connect
        methods: ['GET', 'POST']
    }
});