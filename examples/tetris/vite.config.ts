import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3005,
    fs: {
      strict: false,
    },
  },
  optimizeDeps: {
    exclude: ['@retro-engine/sdk', 'retro-platform-web']
  }
});
