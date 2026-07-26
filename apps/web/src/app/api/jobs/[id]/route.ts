// apps/web/src/app/api/jobs/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db, researchJobs } from '@argus/db';
import { eq } from 'drizzle-orm';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const jobRecord = await db.query.researchJobs.findFirst({
        where: eq(researchJobs.id, id)
    });

    if (!jobRecord) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(jobRecord);
}