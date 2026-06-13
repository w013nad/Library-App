import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'import.meta.env.VITE_GEMINI_API_KEY_BACKUP': JSON.stringify(env.GEMINI_API_KEY_BACKUP || ''),
      'import.meta.env.VITE_VERTEX_AI_PROJECT': JSON.stringify(env.VERTEX_AI_PROJECT || ''),
      'import.meta.env.VITE_VERTEX_AI_LOCATION': JSON.stringify(env.VERTEX_AI_LOCATION || ''),
      'import.meta.env.VITE_VERTEX_AI_API_KEY': JSON.stringify(env.VERTEX_AI_API_KEY || ''),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
