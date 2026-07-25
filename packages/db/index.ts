// packages/db/index.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// This will throw an error if the URL is missing at runtime
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Initialize the Neon HTTP client
const sql = neon(process.env.DATABASE_URL);

// Export the initialized Drizzle client
export const db = drizzle(sql, { schema });

// Export everything from the schema so other apps can use the types
export * from "./schema";
