import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { codeFromPostgres, fail, ok } from '@/lib/api';
import { createServerSupabase } from '@/lib/supabase/server';
import type { PaymentKind } from '@/lib/types';
import {
  demoAddPayment,
  demoAmountFor,
  demoHasReference,
  demoViewer,
  readDemoState,
  writeDemoState,
} from '@/server/demo-store';
import { isDemoMode, listPaymentMethods } from '@/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * Submit a manual payment for review.
 *
 * The row lands as `pending`. Nothing is credited here — `approve_payment`
 * does that, inside a transaction, after a human looks at the receipt.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return fail('INVALID_INPUT');

  const kind = form.get('kind') as PaymentKind | null;
  const itemId = form.get('itemId');
  const methodId = form.get('methodId');
  const reference = form.get('reference');
  const receipt = form.get('receipt');

  if (
    (kind !== 'coins' && kind !== 'vip') ||
    typeof itemId !== 'string' ||
    typeof methodId !== 'string' ||
    typeof reference !== 'string' ||
    reference.trim().length < 4
  ) {
    return fail('INVALID_INPUT');
  }

  if (receipt instanceof File) {
    if (receipt.size > MAX_RECEIPT_BYTES) return fail('INVALID_INPUT', 'Receipt is larger than 5 MB.');
    if (receipt.type && !ALLOWED_TYPES.includes(receipt.type)) {
      return fail('INVALID_INPUT', 'Upload a JPG, PNG or WebP screenshot.');
    }
  }

  const methods = await listPaymentMethods();
  if (!methods.some((m) => m.id === methodId)) return fail('INVALID_INPUT');

  // -------------------------------------------------------------- demo mode
  if (isDemoMode()) {
    const amount = demoAmountFor(kind, itemId);
    if (amount === null) return fail('NOT_FOUND');

    const state = await readDemoState();
    if (!demoViewer(state)) return fail('UNAUTHENTICATED');
    if (demoHasReference(state, methodId, reference)) return fail('DUPLICATE_REFERENCE');

    demoAddPayment(state, {
      id: `p_${randomBytes(4).toString('hex')}`,
      kind,
      itemId,
      methodId,
      reference: reference.trim(),
      status: 'pending',
      createdAt: Date.now(),
      reviewedAt: null,
      receiptName: receipt instanceof File && receipt.name ? receipt.name.slice(0, 40) : null,
      note: null,
    });
    await writeDemoState(state);

    return ok({ submitted: true });
  }

  // -------------------------------------------------------------- live mode
  const supabase = await createServerSupabase();
  if (!supabase) return fail('INTERNAL');

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('UNAUTHENTICATED');
  const userId = auth.user.id;

  const table = kind === 'coins' ? 'coin_packages' : 'vip_plans';
  const { data: item } = await supabase.from(table).select('id, price_php').eq('id', itemId).maybeSingle();
  if (!item) return fail('NOT_FOUND');

  let receiptPath: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    const ext = receipt.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    // Viewers may only write under receipts/{auth.uid()}/ — see 0001_init.sql.
    receiptPath = `${userId}/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(receiptPath, receipt, { contentType: receipt.type || 'image/jpeg', upsert: false });

    if (uploadError) return fail('INTERNAL', 'We could not save that receipt. Try again.');
  }

  const { error } = await supabase.from('payments').insert({
    user_id: userId,
    kind,
    coin_package_id: kind === 'coins' ? itemId : null,
    vip_plan_id: kind === 'vip' ? itemId : null,
    payment_method_id: methodId,
    amount_php: item.price_php,
    reference_number: reference.trim(),
    receipt_path: receiptPath,
    status: 'pending',
  });

  if (error) return fail(codeFromPostgres(error.message));

  return ok({ submitted: true });
}
