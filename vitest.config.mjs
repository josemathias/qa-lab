import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules/**', 'dist/**', '_deprecated/**'],
  },
});
