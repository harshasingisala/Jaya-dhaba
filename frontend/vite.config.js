import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_URL

  return {
    root: path.resolve(__dirname, '.'),
    base: '/',
    plugins: [react()],
    build: {
      outDir: 'dist',
      target: 'es2020',
      cssCodeSplit: true,
      assetsInlineLimit: 2048,
      modulePreload: {
        polyfill: false,
      },
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['react-router-dom'],
            motion: ['framer-motion'],
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
        'socket.io-client'
      ]
    },
    server: {
      host: true,
      port: 5174,
      strictPort: true,
      hmr: {
        overlay: false
      },
      proxy: apiProxyTarget ? {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        }
      } : undefined
    }
  }
})
