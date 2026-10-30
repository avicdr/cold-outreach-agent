import type { Metadata } from 'next';
import { constructMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = constructMetadata({
  title: 'Unsubscribe Confirmation',
  description: 'Cryptographically verified email suppression for Outreacher outbound campaigns.',
  path: '/unsubscribe',
  noIndex: true,
});

export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

