import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler';
import { AppFrame } from '@/components/shell/app-frame';

export const dynamic = 'force-dynamic';

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });
const display = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

const TITLE = 'Deutschland-Dashboard';
const DESCRIPTION = 'Live command center for Germany: power grid, weather, mobility, rivers, air quality, markets, society and politics.';

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h?.get?.('x-forwarded-host') ?? h?.get?.('host') ?? 'localhost:3000';
  const proto = h?.get?.('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return {
    metadataBase: new URL(`${proto}://${host}`),
    title: { default: TITLE, template: `%s · ${TITLE}` },
    description: DESCRIPTION,
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: TITLE },
    icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/icon-192.png' },
    openGraph: { title: TITLE, description: DESCRIPTION, images: ['/og-image.png'] },
  };
}

export const viewport = { themeColor: '#0a0f17' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} ${mono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false} disableTransitionOnChange>
          <AppFrame>{children}</AppFrame>
          <Toaster />
          <ChunkLoadErrorHandler />
        </ThemeProvider>
      </body>
    </html>
  );
}
