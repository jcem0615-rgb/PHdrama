# Content protection — what is actually possible

Honest summary, because this is the area where product expectations and browser
reality diverge the most.

## What we do today

| Measure | Effect |
| --- | --- |
| Access decided by `can_watch_episode()` in Postgres | A locked episode has no playable URL to steal. |
| Short-lived signed URLs (90 s) from `/api/episodes/[id]/play` | A shared link dies before it is useful. |
| Storage paths never in the client bundle | Nothing to guess or enumerate. |
| Service worker refuses to cache signed URLs and `/api/*` | No signed URL survives on disk. |
| Per-session `watermark_code` overlaid on the video | A leaked recording is traceable to a session. |
| `viewer_sessions` rows | Unusual fan-out per account is visible. |

## What we cannot do in a PWA

- **Block screen recording.** Android's `FLAG_SECURE` and iOS's screen-capture APIs
  are native-only. A website cannot set them. Installed PWAs are still websites.
- **Guarantee a black screen on recording.** That behaviour comes from a DRM stack
  (Widevine L1 / FairPlay) enforcing an output path, not from any JS.
- **Stop devtools.** Disabling right-click or the F12 key is theatre and annoys
  honest viewers. We do not ship it.
- **Stop a camera pointed at the screen.** Nothing does. Watermarking is the answer.

## Phase: DRM (not yet chosen)

Encrypted HLS/DASH plus a license provider (BuyDRM, EZDRM, PallyCon, Axinom) and
Shaka Player in place of hls.js. This is what makes a screen recorder capture black.
It costs money per license request and adds a packaging step to the content pipeline,
so it is deliberately deferred until there is content worth stealing.

Until then `SecureVideoPlayer` speaks plain HLS and the watermark is the deterrent.

## Phase: Android wrapper

Wrapping the PWA as a TWA or a Capacitor build is the only route to `FLAG_SECURE`,
and it is also the only route to AdMob rewarded ads with server-side verification.
These two gaps share one solution; sequence them together.

## Privacy

The watermark shows `viewer_sessions.watermark_code`, a random per-session string —
never an IP address, never an email, never a phone number. Under the Data Privacy Act
of 2012 (RA 10173) burning a viewer's identifiers into a frame they can screenshot and
share is a disclosure we do not want to be responsible for. The code resolves to a
session row that only an admin can read.
