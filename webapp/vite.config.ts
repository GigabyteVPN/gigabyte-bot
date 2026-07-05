import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    // Статика раздаётся ботом по адресу /app/
    base: '/app/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // В dev-режиме API проксируется на локально запущенный bot.py
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  };
});
