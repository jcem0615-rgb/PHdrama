import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import StaffShell from '@/components/StaffShell';
import StoryStudio from '@/components/StoryStudio';
import { copy } from '@/lib/copy';
import { isDemoMode, listPostedDemoStories, listStories } from '@/server/repository';
import { getStaff } from '@/server/staff';

export const metadata: Metadata = { title: copy.admin.studio };
export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  const staff = await getStaff();
  if (!staff) redirect('/admin/login');

  const [stories, posted] = await Promise.all([listStories(), listPostedDemoStories()]);

  return (
    <StaffShell staff={staff}>
      <StoryStudio stories={stories} posted={posted} demo={isDemoMode()} />
    </StaffShell>
  );
}
