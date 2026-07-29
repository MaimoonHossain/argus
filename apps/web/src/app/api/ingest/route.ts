// apps/web/src/app/api/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { ingestQueue } from '@/lib/queue';
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