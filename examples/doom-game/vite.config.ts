import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 3011,
    fs: { strict: false },
  },
  resolve: {
    alias: {
      '@cathode/sdk': resolve(__dirname, '../../packages/sdk/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@cathode/sdk', 'cathode-platform-web'],
  },
});
