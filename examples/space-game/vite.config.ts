import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 3003,
    fs: {
      strict: false,
    },
  },
  resolve: {
    alias: {
      'retro-platform-web': resolve(__dirname, '../../packages/sdk/wasm/retro_platform_web.js'),
    },
  },
  optimizeDeps: {
    exclude: ['@retro-engine/sdk', 'retro-platform-web']
  }
});
