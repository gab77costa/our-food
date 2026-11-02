import { defineConfig } from 'vitest/config'

// Security rules tests: run through `npm run test:rules` from the repo root (starts the emulator).
export default defineConfig({
  test: {
    include: ['test/**/*.rules.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    fileParallelism: false,
  },
})
