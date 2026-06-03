import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // The production `expertloop` database is SHARED and carries tables this app
  // does not own — `session` (connect-pg-simple / the Google-OAuth rollback
  // anchor), `kraken_*` (the KRAKEN app), and `alembic_version`. Without a
  // filter, `drizzle-kit push` reconciles the WHOLE database against this schema
  // and would propose dropping/renaming those tables. Scope push to ONLY this
  // app's tables so it can never touch the others. (Dev's `expertloop_dev` lacks
  // these tables, which is why dev pushes looked clean.)
  tablesFilter: [
    "users",
    "campaigns",
    "pairs",
    "votes",
    "allowed_domains",
    "skipped_pairs",
    "import_templates",
    "campaign_memberships",
  ],
});
