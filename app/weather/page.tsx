import { DashView } from '@/components/dash/dash-view';

export const metadata = { title: 'Weather' };

export default function Page() {
  return <DashView view="weather" />;
}
