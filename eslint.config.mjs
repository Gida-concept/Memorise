import pluginTs from '@typescript-eslint/eslint-plugin';
import parserTs from '@typescript-eslint/parser';

const flatRecommended = pluginTs.configs['flat/recommended'];
const flatEslintRec = pluginTs.configs['flat/eslint-recommended'];

export default [
  // Ignore patterns
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.d.ts', '**/fixtures/**'],
  },

  // Spread eslint:recommended equivalent
  ...(Array.isArray(flatEslintRec) ? flatEslintRec : [flatEslintRec]),

  // Spread @typescript-eslint/recommended
  ...flatRecommended,

  // Override/add custom rules
  {
    files: ['packages/*/src/**/*.ts', 'packages/*/tests/**/*.ts'],
    plugins: {
      '@typescript-eslint': pluginTs,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
