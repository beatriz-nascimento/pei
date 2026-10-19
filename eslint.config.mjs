// Configuração ESLint (flat config) compartilhada pelo monorepo.
// O app Angular estende esta base em apps/web/eslint.config.mjs.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/.angular/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // NestJS lê os tipos dos construtores em tempo de execução (emitDecoratorMetadata).
    // Trocar por `import type` apagaria essa informação e quebraria a injeção de dependência.
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
);
