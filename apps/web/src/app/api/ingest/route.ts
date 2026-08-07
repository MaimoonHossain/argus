// apps/web/src/app/api/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { ingestQueue } from '@/lib/queue';
import { db, knowledgeChunks } from '@argus/db';
import { eq, and, like, sql } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

// Configure the worker path for pdfjs-dist in Next.js/Node.js environment
let workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
if (!fs.existsSync(workerPath)) {
    workerPath = path.resolve(process.cwd(), '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
}
PDFParse.setWorker(pathToFileURL(workerPath).toString());

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const sessionId = formData.get('sessionId') as string;

        if (!file || !sessionId) {
            return NextResponse.json({ error: 'File and sessionId required' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let extractedText = '';

        if (file.type === 'application/pdf') {
            const parser = new PDFParse({ data: buffer });
            const pdfData = await parser.getText();
            extractedText = pdfData.text;
            await parser.destroy();
        } else {
            extractedText = buffer.toString('utf-8');
        }

        // Queue the job asynchronously!
        await ingestQueue.add('process-document', {
            filename: file.name,
            text: extractedText,
            sessionId
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error('Ingestion error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('sessionId');

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        // Query distinct documents associated with this session
        const rawDocs = await db
            .select({
                sourceTag: sql<string>`split_part(content, '\n\n', 1)`,
                count: sql<number>`count(*)::int`,
                createdAt: sql<string>`min(created_at)`
            })
            .from(knowledgeChunks)
            .where(eq(knowledgeChunks.sessionId, sessionId))
            .groupBy(sql`split_part(content, '\n\n', 1)`);

        const documents = rawDocs.map((d) => {
            const cleanName = d.sourceTag.replace('[Source: ', '').replace(']', '').trim();
            return {
                name: cleanName || 'Unnamed Document',
                type: cleanName.endsWith('.pdf') ? 'PDF' : 'TXT',
                chunkCount: d.count,
                uploadedAt: d.createdAt ? new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
            };
        });

        return NextResponse.json({ documents }, { status: 200 });
    } catch (error: any) {
        console.error('Failed to fetch documents:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const filename = searchParams.get('filename');
        const sessionId = searchParams.get('sessionId');

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        if (filename && filename !== 'all') {
            // Delete specific document chunks matching the filename
            const sourcePattern = `[Source: ${filename}]%`;
            await db
                .delete(knowledgeChunks)
                .where(
                    and(
                        eq(knowledgeChunks.sessionId, sessionId),
                        like(knowledgeChunks.content, sourcePattern)
                    )
                );

            console.log(`[DB] Deleted chunks for document "${filename}" in session "${sessionId}"`);
            return NextResponse.json({ success: true, message: `Document "${filename}" removed from knowledge base.` }, { status: 200 });
        } else {
            // Delete all documents for this session
            await db
                .delete(knowledgeChunks)
                .where(eq(knowledgeChunks.sessionId, sessionId));

            console.log(`[DB] Purged all chunks for session "${sessionId}"`);
            return NextResponse.json({ success: true, message: 'All documents removed from knowledge base.' }, { status: 200 });
        }
    } catch (error: any) {
        console.error('Failed to delete document:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}