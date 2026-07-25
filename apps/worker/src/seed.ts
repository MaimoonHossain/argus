// apps/worker/src/seed.ts
import { db, knowledgeChunks } from '@argus/db';
import { embedQuestion } from './llm/gemini';

const seedData = [
    "Winston Churchill served as the Prime Minister of the United Kingdom during the Second World War, from 1940 to 1945, and again from 1951 to 1955.",
    "Franklin D. Roosevelt, commonly known as FDR, was the 32nd President of the United States, serving from 1933 until his death in 1945.",
    "Churchill's inspiring speeches, such as 'We shall fight on the beaches,' were instrumental in boosting British morale during the dark early days of WWII.",
    "FDR's New Deal was a series of programs, public work projects, and financial reforms enacted in the US between 1933 and 1939 to recover from the Great Depression.",
    "Before becoming Prime Minister, Churchill served as the First Lord of the Admiralty during the early months of WWII and previously during WWI.",
    "Roosevelt contracted polio in 1921 at age 39, which left his legs paralyzed, though he successfully hid the full extent of his disability from the public.",
    "The Atlantic Charter was a pivotal policy statement issued in August 1941 by Churchill and Roosevelt that defined the Allied goals for the post-war world.",
    "Churchill was an accomplished writer and historian, eventually winning the Nobel Prize in Literature in 1953 for his historical writings and speeches.",
    "FDR is the only U.S. president to have served more than two terms; he was elected to four terms in office, leading to the 22nd Amendment after his death.",
    "During the Yalta Conference in 1945, Churchill, Roosevelt, and Joseph Stalin met to discuss the post-war reorganization of Germany and Europe.",
    "Churchill famously warned the West about the Soviet Union's expansion with his 1946 'Iron Curtain' speech in Fulton, Missouri.",
    "Roosevelt's 'Fireside Chats' were a series of evening radio addresses given between 1933 and 1944 to directly communicate his policies to the American public.",
    "Churchill and Roosevelt maintained a deeply personal correspondence, exchanging over 1,700 messages and letters throughout the course of WWII.",
    "On December 8, 1941, the day after the Pearl Harbor attack, FDR delivered his famous 'Day of Infamy' speech, bringing the US into WWII.",
    "Churchill's political career saw him change parties twice: he joined the Liberals in 1904, then returned to the Conservative Party in 1924.",
    "In 1943, FDR and Churchill met at the Casablanca Conference, where they agreed on the strategy of demanding 'unconditional surrender' from the Axis powers.",
    "Before his presidency, Roosevelt served as the Governor of New York from 1929 to 1932, where he pioneered relief programs that foreshadowed the New Deal.",
    "Churchill's mother, Jennie Jerome, was an American socialite, making him half-American by birth.",
    "The Lend-Lease policy, championed by FDR in 1941, allowed the US to supply the UK and other Allies with materiel without immediate payment.",
    "FDR died of a massive cerebral hemorrhage on April 12, 1945, just weeks before the final surrender of Nazi Germany, deeply saddening Churchill."
];

async function runSeed() {
    console.log('🌱 Starting database seed...');

    if (!process.env.GEMINI_API_KEY || !process.env.DATABASE_URL) {
        throw new Error("Missing GEMINI_API_KEY or DATABASE_URL in .env");
    }

    for (let i = 0; i < seedData.length; i++) {
        const text = seedData[i];
        console.log(`Embedding chunk ${i + 1}/${seedData.length}...`);

        // 1. Get the 768-dimensional vector from Gemini
        const embedding = await embedQuestion(text);

        // 2. Insert the text and the vector into Neon
        await db.insert(knowledgeChunks).values({
            content: text,
            embedding: embedding,
            sourceType: 'seed_document',
        });

        // Small delay to respect free-tier API rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('✅ Seeding complete! The vector database is primed.');
    process.exit(0);
}

runSeed().catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
});