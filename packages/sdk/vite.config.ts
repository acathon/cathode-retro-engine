import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'CathodeSDK',
      fileName: 'index'
    },
    rollupOptions: {
      external: ['cathode-platform-web']
    }
  },
  plugins: [dts()]
});
