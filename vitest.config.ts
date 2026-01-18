import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib2/**/*.ts"],
      exclude: [
        "src/lib2/**/*.test.ts",
        "src/lib2/README.md",
        "src/lib2/protocol.txt",
      ],
    },
  },
});
