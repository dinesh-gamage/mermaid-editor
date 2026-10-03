import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Showcase dev app (not part of the published package)
export default defineConfig({
  plugins: [react()],
  root: '.',
  server: { port: 5198 },
  preview: { port: 5198 },
  build: { outDir: 'dist-showcase' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
  },
} as any);
