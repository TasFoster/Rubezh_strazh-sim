import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    environment: "node",
    // ПК разработки — 2 ядра и мало памяти: не даём Vitest плодить воркеры.
    maxWorkers: 2,
  },
});
