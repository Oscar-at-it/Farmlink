import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const api = { '/api': 'http://localhost:5000' };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'FarmLink',
        short_name: 'FarmLink',
        description: 'Sales, stock, credit and profit for agrovets',
        start_url: '/',
        display: 'standalone',
        background_color: '#0E3B2C',
        theme_color: '#0E3B2C',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache the app itself. API data is handled in the app (offline.js), never by the service worker.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, handler: 'StaleWhileRevalidate', options: { cacheName: 'fonts' } },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: api },
  preview: { port: 4173, proxy: api },   // npm run preview serves the built app with the service worker active
});
