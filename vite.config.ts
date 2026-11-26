import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode demo` builds one self-contained HTML file that runs on browser storage (for previews).
export default defineConfig(({ mode }) => ({
  plugins: mode === 'demo' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'demo' ? { outDir: 'dist-demo', copyPublicDir: false } : {},
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
