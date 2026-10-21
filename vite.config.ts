/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: false },
  // 模擬器模式使用獨立的依賴快取，避免與同時執行的一般 dev server 互相覆蓋（會造成 vue-router 載入兩份）
  cacheDir: process.env.VITE_FIREBASE_EMULATOR === 'true' ? 'node_modules/.vite-emulator' : 'node_modules/.vite',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
