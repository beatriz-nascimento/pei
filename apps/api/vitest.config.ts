import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// unplugin-swc: compila os testes com SWC, que (ao contrário do esbuild) emite os
// metadados de decorators que a injeção de dependência do NestJS precisa.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globalSetup: ['./test/global-setup.ts'],
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
