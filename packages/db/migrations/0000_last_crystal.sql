DO $$ BEGIN
 CREATE TYPE "public"."job_status" AS ENUM('pending', 'planning', 'researching', 'synthesizing', 'complete', 'partial', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."source_type" AS ENUM('seed_document', 'web_search', 'synthesis_cache');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sub_question_status" AS ENUM('pending', 'researching', 'complete', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768),
	"source_url" text,
	"source_type" "source_type" DEFAULT 'seed_document' NOT NULL,
	"research_job_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"final_answer" text,
	"error_message" text,
	"session_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sub_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_job_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"status" "sub_question_status" DEFAULT 'pending' NOT NULL,
	"summary" text,
	"sources" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_research_job_id_research_jobs_id_fk" FOREIGN KEY ("research_job_id") REFERENCES "public"."research_jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sub_questions" ADD CONSTRAINT "sub_questions_research_job_id_research_jobs_id_fk" FOREIGN KEY ("research_job_id") REFERENCES "public"."research_jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sub_questions_job_idx" ON "sub_questions" USING btree ("research_job_id");