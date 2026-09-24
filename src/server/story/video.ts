import 'server-only';

/**
 * Video rendering — the provider seam.
 *
 * No provider is wired up. This is a decision, not an oversight: text-to-video
 * APIs differ enormously in price, length limits, aspect ratio support and
 * commercial-use terms, and picking one changes what the pipeline has to do
 * (some are synchronous, most are a submit-then-poll job).
 *
 * What exists today: `queueRenders` writes one `render_jobs` row per scene with
 * status 'queued'. A worker implementing `VideoProvider` picks them up, renders
 * the scene, uploads the result to the private `videos` bucket and writes
 * `output_path` back. Until that worker exists, `publish_story` sees zero
 * rendered scenes and publishes the series as a draft, so no viewer ever meets
 * an episode with nothing behind it.
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

export function activeVideoProvider(): VideoProvider | null {
  // Wire the chosen provider here once it is picked, keyed off its own env var.
  return null;
}
