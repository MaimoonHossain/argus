// packages/db/schema.ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  vector,
  index,
  varchar,
} from "drizzle-orm/pg-core";

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "planning",
  "researching",
  "synthesizing",
  "complete",
  "partial",
  "failed",
]);

export const subQuestionStatusEnum = pgEnum("sub_question_status", [
  "pending",
  "researching",
  "complete",
  "failed",
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "seed_document",
  "web_search",
  "synthesis_cache",
]);

export const researchJobs = pgTable("research_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  status: jobStatusEnum("status").notNull().default("pending"),
  finalAnswer: text("final_answer"),
  errorMessage: text("error_message"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    sessionId: varchar('session_id', { length: 255 }).notNull().default('global'),
    sourceUrl: text("source_url"),
    sourceType: sourceTypeEnum("source_type")
      .notNull()
      .default("seed_document"),
    researchJobId: uuid("research_job_id").references(() => researchJobs.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    knowledgeChunksEmbeddingIdx: index("knowledge_chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  }),
);

export const semanticCache = pgTable(
  "semantic_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    question: text("question").notNull(),
    // Matches the 768 dimensions of Gemini embeddings
    questionEmbedding: vector("question_embedding", { dimensions: 768 }).notNull(),
    answer: text("answer").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // HNSW index for ultra-fast vector similarity search
    semanticCacheEmbeddingIdx: index("semantic_cache_embedding_idx").using(
      "hnsw",
      t.questionEmbedding.op("vector_cosine_ops"),
    ),
  })
);

export const subQuestions = pgTable(
  "sub_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    researchJobId: uuid("research_job_id")
      .notNull()
      .references(() => researchJobs.id),
    questionText: text("question_text").notNull(),
    status: subQuestionStatusEnum("status").notNull().default("pending"),
    summary: text("summary"),
    sources: jsonb("sources").$type<{ title: string; url: string }[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    subQuestionsJobIdx: index("sub_questions_job_idx").on(t.researchJobId),
  }),
);
