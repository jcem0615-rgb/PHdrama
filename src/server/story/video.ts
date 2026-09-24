import 'server-only';

/**
 * Video rendering — the provider seam.
 *
 * There are two ways to fill the render queue.
 *
 * **local-canvas (built, free).** The Studio renders each scene in the admin's
 * browser — canvas to WebM via MediaRecorder — and uploads it through
 * `/api/admin/stories/[id]/render`. No API key, no GPU, no per-second charge,
 * no rate limit. It produces motion graphics composed from the script, not
 * generated footage. That is the honest trade for free, and for a lot of
 * short-drama teasers it is what actually ships.
 *
 * **An AI provider (not chosen).** Every text-to-video API is metered, because
 * every one of them is renting you a GPU. They differ enormously in price per
 * second, clip length, aspect-ratio support and commercial-use terms, and most
 * are submit-then-poll rather than synchronous — which changes what the worker
 * has to do. Implement `VideoProvider` here and a worker that drains
 * `render_jobs` when one is picked.
 *
 * Until then a story with unrendered scenes publishes as a preview, so no
 * viewer ever meets an episode with nothing behind it.
 *
 * See docs/BUILD_ORDER.md, Phase 10.
 */

export interface RenderRequest {
  sceneId: string;
  script: string;
  beat: string;
  durationSeconds: number;
}

export interface RenderResult {
  externalId: string;
  /** Path inside the private `videos` bucket. */
  outputPath: string;
}

export interface VideoProvider {
  readonly name: string;
  /** Submit a render. Providers that are async should return once accepted. */
  submit(request: RenderRequest): Promise<{ externalId: string }>;
  /** Poll a submitted render. Returns null while it is still running. */
  poll(externalId: string): Promise<RenderResult | null>;
}

/** The name recorded on queued jobs until a provider is chosen. */
export const PENDING_PROVIDER = 'unassigned';

/** What the browser renderer records against a completed job. */
export const LOCAL_PROVIDER = 'local-canvas';

export function activeVideoProvider(): VideoProvider | null {
  // Wire the chosen provider here once it is picked, keyed off its own env var.
  return null;
}
