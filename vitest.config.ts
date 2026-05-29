import { defineConfig } from "vitest/config";
import path from "path";

// Path aliases mirror tsconfig.json / vite.config.ts so tests can import
// @shared/* (and @/*) the same way application code does.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    // server/db.ts throws at import unless DATABASE_URL is set. The node-postgres
    // Pool is lazy (no connection until a query), and the pure-logic tests never
    // query, so a dummy URL lets the module graph import without a real DB.
    env: {
      DATABASE_URL: "postgres://vitest:vitest@localhost:5432/vitest",
    },
  },
});
