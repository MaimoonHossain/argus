// packages/db/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./packages/db/schema.ts", // <-- Updated path
  out: "./packages/db/migrations", // <-- Updated path
  dialect: "postgresql",
  dbCredentials: {
    // We use a fallback here just so 'generate' doesn't complain about a missing URL.
    // When we actually migrate, it will use the real URL from your .env file.
    url:
      process.env.DATABASE_URL ||
      "postgres://user:password@localhost:5432/argus",
  },
});
