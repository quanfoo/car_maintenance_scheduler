import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { fileParallelism: false, testTimeout: 20000, hookTimeout: 120000, coverage: { include: ['src/**/*.ts'] } } });
