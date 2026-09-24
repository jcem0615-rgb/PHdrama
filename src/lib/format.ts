/** Currency is PHP everywhere. One formatter, no ad-hoc peso signs. */
const php = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
});

export function formatPhp(amount: number): string {
  return php.format(amount);
}

const compact = new Intl.NumberFormat('en-PH', { notation: 'compact' });

export function formatCount(n: number): string {
  return compact.format(n);
}

export function formatCoins(n: number): string {
  return new Intl.NumberFormat('en-PH').format(n);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

/** "3 days left", "5 hours left", "expired". */
export function formatRemaining(iso: string | null): string {
  if (!iso) return 'not active';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'} left`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
}
