import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // Each test file gets its own throwaway copy of the demo vault (see setup.ts).
    setupFiles: ['tests/unit/setup.ts'],
    environment: 'node',
    pool: 'forks',
  },
});
