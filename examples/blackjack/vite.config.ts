import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3016,
    fs: { strict: false },
  },
  optimizeDeps: {
    exclude: ['@cathode/cards', '@cathode/sdk', 'cathode-platform-web'],
  },
});
