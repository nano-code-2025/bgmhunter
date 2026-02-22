import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Deezer search API does not return CORS headers; proxy in dev.
          '/api/deezer': {
            target: 'https://api.deezer.com',
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/api\/deezer/, ''),
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY || env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.DEEPSEEK_API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
        }
      }
    };
});
