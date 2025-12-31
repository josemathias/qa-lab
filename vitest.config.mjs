import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/L1/**/*.{test,spec}.{js,ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', '_deprecated/**', '__tests__/L0/**'],
  },
});
