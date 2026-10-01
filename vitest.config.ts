import { defineConfig } from "vitest/config";

// test/patreon.user.test.mjs uses node:test. `node --test` runs it.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
