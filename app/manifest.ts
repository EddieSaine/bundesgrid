import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Deutschland-Dashboard',
    short_name: 'DE Dashboard',
    description: 'Live command center for Germany.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0f17',
    theme_color: '#0a0f17',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
