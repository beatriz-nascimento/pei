// ESLint do app Angular: base do monorepo + regras do angular-eslint
// (angular-eslint: regras de lint específicas para componentes e templates Angular).
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';
import base from '../../eslint.config.mjs';

export default tseslint.config(
  ...base,
  {
    files: ['**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
