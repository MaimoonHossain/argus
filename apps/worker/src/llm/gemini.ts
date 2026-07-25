// apps/worker/src/llm/gemini.ts
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function embedQuestion(text: string): Promise<number[]> {
    const response = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: text,
        config: { outputDimensionality: 768 } // Required by our pgvector schema
    });

    // Note: Depending on your exact @google/genai version, it might be 
    // response.embeddings[0].values OR response.embedding.values
    // If this throws a type error, try changing it to response.embedding.values
    return response?.embeddings?.[0]?.values || [];
}

export async function generateAnswer(context: string, question: string): Promise<string> {
    const prompt = `Use the following context to answer the question. If the context doesn't contain the answer, say so.\n\nContext:\n${context}\n\nQuestion: ${question}`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
    });
    return response.text || '';
}