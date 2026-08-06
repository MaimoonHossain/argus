// apps/worker/src/llm/gemini.ts
import { GoogleGenAI } from '@google/genai';
import { traceable } from 'langsmith/traceable';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const embedQuestion = traceable(
    async (text: string): Promise<number[]> => {
        const response = await ai.models.embedContent({
            model: 'gemini-embedding-001',
            contents: text,
            config: { outputDimensionality: 768 } // Required by our pgvector schema
        });

        return response?.embeddings?.[0]?.values || [];
    },
    { name: "Gemini Embeddings", run_type: "embedding" }
);

export const generateAnswer = traceable(
    async (context: string, question: string): Promise<string> => {
        const prompt = `Use the following context to answer the question. If the context doesn't contain the answer, say so.\n\nContext:\n${context}\n\nQuestion: ${question}`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        return response.text || '';
    },
    { name: "Gemini Generate Answer", run_type: "llm" }
);