import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // `examples/demo-app` is a deliberately bad CommonJS fixture for the sample
    // report, not source. Linting it would mean "fixing" the findings we planted.
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'examples/demo-app/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      // CQ-013: complexity is measured (report-only at first per USAT remediation).
      complexity: ['warn', 10],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // Node scripts (scripts/*.mjs) run under plain node, which js.configs
    // .recommended does not know about — without this, `process` and `console`
    // are reported as undefined.
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly' },
    },
  },
);
