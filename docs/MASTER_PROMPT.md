# PH-Drama — Master Product Spec

## One-liner
A vertical short-drama reels PWA for the Philippine market. Episodes are 60–120 second
vertical videos grouped into series of 40–80 episodes. Episodes 1–5 of every series are
free. After that a viewer either unlocks a single episode with coins, watches a rewarded
ad, or subscribes to VIP (₱69 / week, every episode, no ads).

## Audience
Filipino mobile viewers on mid-range Android and iPhone, mostly on mobile data.
Design target is 390 × 844. Copy is English with Filipino-friendly phrasing (Taglish
variants are a later switch — all strings live in `src/lib/copy.ts`).

## Monetisation

### Coins
- Coins are bought in packages (see `coin_packages`). Prices are PHP, stored `numeric(10,2)`.
- Unlocking one episode costs `episodes.coin_price` (default 30 coins).
- An unlock is permanent: a row in `episode_unlocks` with `source = 'coins'`.

### Rewarded ads
- A viewer may unlock one episode by watching a rewarded video.
- `grant_ad_unlock` is **service_role only** and expects a server-side verification id
  (SSV). A client POST saying "I watched the ad" is not proof.
- Gated behind `NEXT_PUBLIC_FLAG_REWARDED_ADS` until an ad network is chosen
  (see "Known gaps" in `CLAUDE.md`).

### VIP
- ₱69 / week. While `profiles.vip_expires_at > now()` every episode is watchable and
  no ads are shown.
- Approving VIP while VIP is still active **extends from the current expiry**, never
  from `now()`.

### Manual payments
There is no card processor. The flow is:

1. Viewer picks a coin package or the VIP plan.
2. App shows the payment instructions for the chosen method — GCash, Maya, QR Ph,
   BDO, BPI or UnionBank — with the account name/number and the exact amount in PHP.
3. Viewer pays in their own banking app, then uploads a receipt screenshot and types
   the reference number.
4. A `payments` row is created with `status = 'pending'`. The receipt lands in the
   private `receipts` bucket under `receipts/{auth.uid()}/...`.
5. SuperAdmin reviews the queue, opens the receipt through a short-lived signed URL,
   and calls `approve_payment` or `reject_payment`.
6. `approve_payment` credits coins (or extends VIP) **inside one transaction** and
   writes the matching ledger row.

Duplicate reference numbers are rejected by a unique index on
`(payment_method_id, reference_number)`.

## Content access rules
`can_watch_episode(user, episode)` is true when any of these hold:

1. The episode is free (`episode_number <= series.free_episode_count`).
2. The viewer's VIP is active.
3. A row exists in `episode_unlocks` for (viewer, episode).

Everything else is locked. The rule lives in Postgres; the client only renders what
the database already decided.

## Playback
- `/api/episodes/[id]/play` checks `can_watch_episode()` and only then issues a
  short-lived signed URL for the HLS playlist, plus a `viewer_sessions` row carrying a
  random `watermark_code`.
- The player overlays that code at low opacity, drifting, so a screen recording can be
  traced back to a session. **Never** display a raw IP address (RA 10173).
- Signed URLs are never cached by the service worker.

## Surfaces
| Route | What it is |
| --- | --- |
| `/` | Home — continue watching, trending series, new releases |
| `/reels` | Full-screen vertical snap feed, the default entry point |
| `/series/[slug]` | Series detail, synopsis, full episode grid with lock badges |
| `/watch/[episodeId]` | Single-episode player with the unlock sheet |
| `/coins` | Coin packages + the VIP plan |
| `/pay/[kind]/[id]` | Payment instructions + receipt upload |
| `/me` | Balance, VIP status, unlocked episodes, payment history |
| `/admin` | SuperAdmin: payment queue, users, coin/VIP adjustments |

## Admin
- `role` is one of `user`, `admin`, `superadmin`, stored on `profiles`, never settable
  by the account itself.
- Admins see the payment queue and approve/reject. Only `superadmin` may call
  `admin_adjust_coins` and `admin_set_vip`.
- Every admin action is written to `coin_ledger` / `vip_ledger` with the acting admin id.

## AI content pipeline (admin only, later phase)
Scripts via Anthropic/OpenAI, narration via ElevenLabs, video via a video-gen API,
all behind a job queue so a failed render never blocks a request. Check each
provider's commercial-use terms before monetising generated dramas.

## Out of scope for v1
Native apps, real-time chat, comments moderation at scale, automated refunds,
card/e-wallet APIs, DRM licensing (see `CONTENT_PROTECTION.md`).
