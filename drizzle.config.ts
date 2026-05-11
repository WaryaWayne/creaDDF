import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
const isOfflineGenerate = process.env.npm_lifecycle_event === "db:generate";

if (databaseUrl === undefined && !isOfflineGenerate) {
  throw new Error(
    "DATABASE_URL is required for Drizzle commands that connect to Postgres. " +
      "Set DATABASE_URL before running db:migrate, db:push, or drizzle-kit directly.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "postgres://unused:unused@localhost:5432/unused",
  },
  breakpoints: true,
  strict: true,
});
