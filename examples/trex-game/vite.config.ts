import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3002,
    fs: {
      strict: false,
    },
  },
  optimizeDeps: {
    exclude: ['@cathode/sdk', 'cathode-platform-web']
  }
});
