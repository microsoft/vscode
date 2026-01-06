import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite Preview Configuration (VSCode Extension内包版)
 *
 * 新しいアーキテクチャ: 実際のdev serverを直接表示
 * - virtual:design-entryプラグインは削除
 * - 実際のdev server URLを直接iframeで表示
 */
export default defineConfig({
  root: __dirname,
  plugins: [
    // virtual:design-entryプラグインは削除（実際のdev serverを直接表示）
  ],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  server: {
    port: 0, // 自動割当
    strictPort: false,
    host: true,
    cors: true,
    hmr: false, // ✅ HMRを無効化（AI Preview Runtimeには不要）
  },
  optimizeDeps: {
    force: true,
    esbuildOptions: {
      jsx: 'automatic',
      jsxImportSource: 'react',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      // next/link と next/image をスタブに alias
      'next/link': path.resolve(__dirname, './stubs/next-link.tsx'),
      'next/image': path.resolve(__dirname, './stubs/next-image.tsx'),
    },
  },
});

