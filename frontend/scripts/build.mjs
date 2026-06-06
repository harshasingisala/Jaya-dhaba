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
const criticalCss = `
<style data-critical>
:root{--font-serif:Georgia,'Times New Roman',serif;--font-sans:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--bg-primary:#FAF9F6;--text-main:#1A1A1A;--heritage-gold:#8A5A00;--heritage-espresso:#1A1A1A;--gold-brand:#8A5A00;--brown-brand:#8B4513;--ease-out-expo:cubic-bezier(.19,1,.22,1)}
*{box-sizing:border-box}body{margin:0;font-family:var(--font-sans);color:var(--text-main);background:var(--bg-primary);-webkit-font-smoothing:antialiased}button{font:inherit}#root,.app-container,.heritage-stone-bg{min-height:100vh;background:var(--bg-primary)}
nav{position:fixed;top:0;left:0;width:100%;z-index:100;background:var(--bg-primary)}nav>div{max-width:80rem;margin-inline:auto;padding-inline:1rem;display:flex;align-items:center;justify-content:space-between}nav button{min-height:44px;background:transparent;border:0;color:var(--brown-brand)}
#hero{padding:4.75rem .75rem 1.75rem;max-width:80rem;margin-inline:auto}.mobile-hero-card{position:relative;width:100%;overflow:hidden;border-radius:32px;min-height:clamp(300px,52vw,520px);background:#1C1008}.hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.hero-readable-overlay{position:absolute;inset:0}.mobile-hero-copy{position:relative;z-index:10;width:100%;max-width:32rem;padding:2.5rem 1.5rem;text-align:left;margin-left:auto}.mobile-hero-kicker{display:block;color:#F6C453;text-transform:uppercase;font-size:11px;font-weight:700;margin:0 0 1.25rem}.premium-hero-title{font-family:var(--font-serif);font-size:clamp(2rem,4.5vw,3.4rem);line-height:1.1;color:#fff;margin:0 0 1.25rem}.mobile-hero-subtitle{color:rgba(255,255,255,.7);font-size:1rem;line-height:1.6;margin:0 0 2rem}.mobile-hero-actions{display:flex;flex-wrap:wrap;gap:.75rem}.mobile-hero-actions button{border-radius:999px;padding:.875rem 2rem;font-size:.875rem;font-weight:600}.premium-button{position:relative;overflow:hidden;transform:translateZ(0)}
@media(max-width:640px){#hero{padding-top:4.75rem}.mobile-hero-card{min-height:calc(100svh - 96px);border-radius:0 0 28px 28px;margin-inline:-.75rem}.mobile-hero-copy{padding:44svh 1.25rem 1.5rem}.premium-hero-title{font-size:clamp(2.75rem,15vw,4.1rem);line-height:.98;max-width:9ch}.mobile-hero-actions{display:grid;grid-template-columns:1fr 1fr}.mobile-hero-actions button{min-height:48px;padding-left:.75rem;padding-right:.75rem}}
</style>`;

function deferStylesheet(html) {
  return html
    .replace(/(<link rel="stylesheet" crossorigin href="([^"]+\.css)">)/, `${criticalCss}\n    <link rel="preload" as="style" crossorigin href="$2" onload="this.onload=null;this.rel='stylesheet'">\n    <noscript>$1</noscript>`);
}

const baseHtml = deferStylesheet(await fs.readFile(path.join(outputRoot, 'index.html'), 'utf8'));
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
