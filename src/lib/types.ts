/** Domain types shared by both repository backends. */

export type Role = 'user' | 'admin' | 'superadmin';
export type UnlockSource = 'coins' | 'ad' | 'vip' | 'admin';
export type PaymentKind = 'coins' | 'vip';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';
export type PaymentChannel = 'gcash' | 'maya' | 'qrph' | 'bank';

export interface Series {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  tags: string[];
  freeEpisodeCount: number;
  isFeatured: boolean;
  episodeCount: number;
  viewCount: number;
  /** 0–360. Drives the generated poster gradient until real artwork is uploaded. */
  posterHue: number;
  /**
   * A series published from the Story Studio before its episodes have real
   * rendered video. Preview episodes are free and labelled, because what plays
   * behind them is a placeholder clip, not the story.
   */
  isPreview?: boolean;
}

export interface Episode {
  id: string;
  seriesId: string;
  seriesSlug: string;
  seriesTitle: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  durationSeconds: number;
  coinPrice: number;
  isFree: boolean;
  posterHue: number;
  isPreview?: boolean;
}

export interface Viewer {
  id: string;
  displayName: string;
  role: Role;
  coinBalance: number;
  vipExpiresAt: string | null;
  isVip: boolean;
  unlockedEpisodeIds: string[];
}

/**
 * A staff identity for the admin portal. Deliberately NOT a Viewer: it carries
 * no balance, no VIP, no unlocks — there is nothing for the customer app to
 * read off it, and nothing for the portal to spend.
 */
export interface Staff {
  id: string;
  displayName: string;
  role: 'admin' | 'superadmin';
}

/** A customer as the staff portal sees them. */
export interface Customer {
  id: string;
  displayName: string;
  role: Role;
  coinBalance: number;
  vipExpiresAt: string | null;
  isVip: boolean;
  createdAt: string;
}

export interface CoinPackage {
  id: string;
  code: string;
  name: string;
  coins: number;
  bonusCoins: number;
  pricePhp: number;
  isPopular: boolean;
}

export interface VipPlan {
  id: string;
  code: string;
  name: string;
  days: number;
  pricePhp: number;
}

export interface PaymentMethod {
  id: string;
  code: string;
  label: string;
  channel: PaymentChannel;
  accountName: string;
  accountNumber: string;
  instructions: string;
}

export interface Payment {
  id: string;
  userId: string;
  userName: string;
  kind: PaymentKind;
  itemName: string;
  amountPhp: number;
  methodLabel: string;
  referenceNumber: string;
  receiptName: string | null;
  status: PaymentStatus;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface CoinLedgerEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

export type StoryStatus = 'draft' | 'scripted' | 'rendering' | 'ready' | 'published' | 'failed';
export type RenderStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface StoryScene {
  id: string;
  sceneNumber: number;
  title: string;
  beat: string;
  script: string;
  hook: string;
  durationSeconds: number;
  renderStatus: RenderStatus | null;
}

export interface Story {
  id: string;
  title: string;
  logline: string;
  tags: string[];
  targetEpisodes: number;
  status: StoryStatus;
  model: string | null;
  seriesId: string | null;
  sceneCount: number;
  renderedCount: number;
  createdAt: string;
}

export interface PlaybackTicket {
  src: string;
  /**
   * Demo mode only: a bundled clip the player switches to if the public test
   * stream cannot be reached, so the preview never shows a dead player.
   * Always null in live mode.
   */
  fallbackSrc: string | null;
  watermarkCode: string;
  expiresAt: string;
  /**
   * Set when the episode has no rendered video yet. The player draws this over
   * the placeholder clip so the reel carries the episode's own words instead of
   * looking like every other one.
   */
  previewCard: { title: string; hook: string; episodeNumber: number } | null;
}

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'LOCKED'
  | 'NOT_FOUND'
  | 'INSUFFICIENT_COINS'
  | 'DUPLICATE_REFERENCE'
  | 'RATE_LIMITED'
  | 'FEATURE_DISABLED'
  | 'INVALID_INPUT'
  | 'ALREADY_REVIEWED'
  | 'INTERNAL';

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ApiErrorCode; message: string } };
