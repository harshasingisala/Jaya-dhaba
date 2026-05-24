import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build, loadEnv } from 'vite';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const mode = process.env.NODE_ENV === 'development' ? 'development' : 'production';
const env = loadEnv(mode, root, '');
const apiProxyTarget = env.VITE_API_URL;

await build({
  configFile: false,
  root,
  base: '/',
  mode,
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          charts: ['recharts'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'lucide-react',
      'framer-motion',
      'recharts',
      'socket.io-client',
    ],
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    hmr: {
      overlay: false,
    },
    proxy: apiProxyTarget
      ? {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
          },
        }
      : undefined,
  },
});
