import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3012,
    fs: { strict: false },
  },
  optimizeDeps: {
    exclude: ['@cathode/sdk', 'cathode-platform-web'],
  },
});
