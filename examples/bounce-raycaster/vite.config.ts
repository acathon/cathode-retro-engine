import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 3013,
    fs: { strict: false },
  },
  resolve: {
    alias: {
      'cathode-platform-web': resolve(__dirname, '../../packages/sdk/wasm/cathode_platform_web.js'),
    },
  },
  optimizeDeps: {
    exclude: ['@cathode/sdk', 'cathode-platform-web'],
  },
});
