import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = h?.get?.('x-forwarded-host') ?? h?.get?.('host') ?? 'localhost:3000';
  return { rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }], sitemap: `https://${host}/sitemap.xml` };
}
