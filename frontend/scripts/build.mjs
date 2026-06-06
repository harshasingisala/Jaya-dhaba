import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createBrotliCompress, createGzip } from 'node:zlib';
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
    target: 'es2020',
    cssCodeSplit: true,
    assetsInlineLimit: 2048,
    modulePreload: {
      polyfill: false,
      resolveDependencies: (_url, deps) => deps.filter((dep) => !/(motion|charts|supabaseClient|ScrollTrigger)/.test(dep)),
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

const siteUrl = 'https://www.jayadhaba.online';
const publicPages = [
  {
    path: '/',
    title: 'Jaya Dhaba | Authentic Indian Restaurant in Secunderabad',
    description: 'Jaya Dhaba - Heritage Restored. Flavor Perfected. Authentic Indian dining in East Marredpally, Secunderabad. Open 11 AM - 11 PM daily.',
  },
  {
    path: '/menu',
    title: 'Menu | Jaya Dhaba',
    description: 'Explore the full menu at Jaya Dhaba, Secunderabad. Fresh Indian cuisine and traditional recipes for dine-in and takeaway.',
  },
  {
    path: '/reservations',
    title: 'Reserve a Table | Jaya Dhaba',
    description: 'Book a table at Jaya Dhaba, East Marredpally, Secunderabad. Easy online reservations, open 11 AM - 11 PM.',
  },
  {
    path: '/contact',
    title: 'Contact and Location | Jaya Dhaba',
    description: 'Find Jaya Dhaba at East Marredpally, Secunderabad. Call +91 73861 85821. Open daily 11 AM - 11 PM.',
  },
  {
    path: '/terms',
    title: 'Terms of Service | Jaya Dhaba',
    description: 'Terms of service for Jaya Dhaba restaurant, Secunderabad.',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy | Jaya Dhaba',
    description: 'Privacy policy for Jaya Dhaba restaurant, Secunderabad. How we collect and use your data.',
  },
];

function withPageMetadata(html, page) {
  const canonical = `${siteUrl}${page.path === '/' ? '/' : page.path}`;
  const meta = `    <meta name="robots" content="index, follow" />\n    <link rel="canonical" href="${canonical}" />\n`;
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${page.title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${page.description}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${page.title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${page.description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/    <meta name="theme-color"/, `${meta}    <meta name="theme-color"`);
}

const outputRoot = path.join(root, 'dist');
const baseHtml = await fs.readFile(path.join(outputRoot, 'index.html'), 'utf8');
for (const page of publicPages) {
  const destination = page.path === '/'
    ? path.join(outputRoot, 'index.html')
    : path.join(outputRoot, page.path.slice(1), 'index.html');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, withPageMetadata(baseHtml, page), 'utf8');
}

const compressibleExtensions = new Set(['.js', '.css', '.html', '.json', '.svg']);

async function compressAssets(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await compressAssets(fullPath);
      continue;
    }
    if (!compressibleExtensions.has(path.extname(entry.name))) continue;
    const stat = await fs.stat(fullPath);
    if (stat.size < 1024) continue;
    await pipeline(createReadStream(fullPath), createGzip({ level: 9 }), createWriteStream(`${fullPath}.gz`));
    await pipeline(createReadStream(fullPath), createBrotliCompress(), createWriteStream(`${fullPath}.br`));
  }
}

await compressAssets(outputRoot);
