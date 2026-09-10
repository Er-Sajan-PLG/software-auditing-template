import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'lcov'],
      // Ratcheted at the measured numbers (76/65/85/78) minus headroom, per
      // USA's own TEST guidance: thresholds sit at today's number and rise.
      // Raise these whenever they go green by a margin — never lower them.
      thresholds: {
        lines: 75,
        functions: 82,
        branches: 63,
        statements: 74,
      },
    },
  },
});
