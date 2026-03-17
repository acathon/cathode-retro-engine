import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3002,
    fs: {
      strict: false,
    },
  },
  optimizeDeps: {
    exclude: ['@retro-engine/sdk', 'retro-platform-web']
  }
});
