import { defineConfig, type Plugin } from 'vite';
import { cpSync, existsSync } from 'fs';
import { resolve } from 'path';

const BLOCKLY_MEDIA = resolve(__dirname, '../../node_modules/blockly/media');

/**
 * Blockly defaults its media path to blockly-demo.appspot.com, so its icons
 * and sounds would be fetched from a Google demo server at run time. A local
 * game editor has no business phoning out for its own chrome, so the bundled
 * media is copied next to the build instead.
 */
function blocklyMedia(): Plugin {
  return {
    name: 'retro-blockly-media',
    closeBundle() {
      if (!existsSync(BLOCKLY_MEDIA)) return;
      cpSync(BLOCKLY_MEDIA, resolve(__dirname, 'dist/blockly-media'), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [blocklyMedia()],
  server: { port: 3010, fs: { strict: false, allow: ['../..'] } },
  resolve: {
    alias: {
      '@blockly-media': BLOCKLY_MEDIA,
    },
  },
  optimizeDeps: { exclude: ['@cathode/sdk', 'cathode-platform-web'] },
});
