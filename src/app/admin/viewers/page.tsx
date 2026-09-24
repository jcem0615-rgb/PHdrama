import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import StaffShell from '@/components/StaffShell';
import ViewerAdmin from '@/components/ViewerAdmin';
import { copy } from '@/lib/copy';
import { listCustomers } from '@/server/repository';
import { getStaff, isSuperAdmin } from '@/server/staff';

export const metadata: Metadata = { title: copy.admin.viewers };
export const dynamic = 'force-dynamic';

export default async function AdminViewersPage() {
  const staff = await getStaff();
  if (!staff) redirect('/admin/login');

  const customers = await listCustomers();

  return (
    <StaffShell staff={staff}>
      <ViewerAdmin customers={customers} canAdjust={isSuperAdmin(staff)} />
    </StaffShell>
  );
}
