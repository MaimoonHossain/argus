// apps/web/src/app/api/jobs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db, researchJobs } from '@argus/db';
import { researchQueue } from '@/lib/queue';
import { eq, and } from 'drizzle-orm';
import { threadId } from 'worker_threads';

export async function POST(req: NextRequest) {
    try {
        const { question, sessionId } = await req.json();

        if (!question || question.length < 10 || question.length > 500) {
            return NextResponse.json({ error: 'Question must be between 10 and 500 characters.' }, { status: 400 });
        }

        // 1. Check the Cache
        const existingJob = await db.query.researchJobs.findFirst({
            where: and(
                eq(researchJobs.question, question),
                eq(researchJobs.status, 'complete')
            )
        });

        if (existingJob) {
            console.log(`Cache hit for question: "${question}"`);
            // Return the cached job object directly
            return NextResponse.json({
                jobId: existingJob.id,
                cached: true,
                job: existingJob
            }, { status: 200 });
        }

        // 2. Queue a new job if no cache hit
        const [newJob] = await db.insert(researchJobs).values({
            question,
            status: 'pending'
        }).returning({ id: researchJobs.id });

        await researchQueue.add('research', { jobId: newJob.id, threadId: sessionId || 'default-session' });

        return NextResponse.json({ jobId: newJob.id, cached: false }, { status: 201 });
    } catch (error) {
        console.error('Failed to create job:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}