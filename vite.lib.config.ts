import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { libInjectCss } from 'vite-plugin-lib-inject-css';
import { resolve } from 'path';

// Two entries: the editor, and the text operations on their own for a host with no React.
export default defineConfig({
  plugins: [
    react(),
    libInjectCss(),
    dts({ include: ['src'], exclude: ['src/**/*.test.*'], tsconfigPath: './tsconfig.json' }),
  ],
  build: {
    lib: {
      entry: { index: resolve(__dirname, 'src/index.ts'), 'core/index': resolve(__dirname, 'src/core/index.ts') },
      formats: ['es'],
    },
    rollupOptions: {
      // The host supplies React and Mermaid, so there is one copy of each.
      external: (id) => id === 'mermaid' || id === 'react' || id === 'react-dom' || id.startsWith('react/') || id.startsWith('react-dom/'),
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
        banner: "'use client';",
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
