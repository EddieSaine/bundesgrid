import { Suspense } from 'react';
import { StatesView } from '@/components/states/states-view';
import { DashSkeleton } from '@/components/dash/dash-view';

export const metadata = { title: 'States' };

export default function Page() {
  return (
    <Suspense fallback={<DashSkeleton />}>
      <StatesView />
    </Suspense>
  );
}
