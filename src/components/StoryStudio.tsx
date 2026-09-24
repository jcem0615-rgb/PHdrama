'use client';

import {
  AlertTriangle,
  Clapperboard,
  Film,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import Field from '@/components/form/Field';
import { copy } from '@/lib/copy';
import { formatDuration } from '@/lib/format';
import type { ApiResponse, Story } from '@/lib/types';

interface Breakdown {
  title: string;
  logline: string;
  tags: string[];
  scenes: {
    scene_number: number;
    title: string;
    beat: string;
    script: string;
    hook: string;
    duration_seconds: number;
  }[];
}

interface Result {
  breakdown: Breakdown;
  model: string | null;
  persisted: boolean;
  storyId: string | null;
}

export interface PostedSummary {
  slug: string;
  title: string;
  episodes: number;
}

export default function StoryStudio({
  stories,
  posted,
  demo,
}: {
  stories: Story[];
  posted: PostedSummary[];
  demo: boolean;
}) {
  const router = useRouter();
  const [premise, setPremise] = useState('');
  const [title, setTitle] = useState('');
  const [episodes, setEpisodes] = useState('12');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/admin/stories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ premise, title: title || undefined, episodes: Number(episodes) }),
      });
      const body = (await res.json()) as ApiResponse<Result>;

      if (!body.ok) {
        setError(body.error.message);
        return;
      }

      setResult(body.data);
      router.refresh();
    } catch {
      setError(copy.errors.INTERNAL);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Clapperboard className="h-5 w-5 text-sky-400" />
          {copy.admin.studioTitle}
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{copy.admin.studioSubtitle}</p>
      </header>

      <Notice icon={<Film className="h-3.5 w-3.5" />}>{copy.admin.videoPending}</Notice>

      {demo && <PostedList posted={posted} />}

      <form onSubmit={generate} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <label className="block text-xs font-medium text-slate-300">
          {copy.admin.premise}
          <textarea
            value={premise}
            onChange={(event) => setPremise(event.target.value)}
            placeholder={copy.admin.premisePlaceholder}
            rows={5}
            className="mt-1.5 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-sky-500"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={copy.admin.seriesTitleOptional}
            value={title}
            onChange={setTitle}
            tone="staff"
          />
          <Field label={copy.admin.episodeCount} value={episodes} onChange={setEpisodes} tone="staff" />
        </div>

        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300">{error}</p>}

        <button
          type="submit"
          disabled={busy || premise.trim().length < 20}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? copy.admin.generating : copy.admin.generate}
        </button>
      </form>

      {result && <BreakdownView result={result} demo={demo} />}

      {!demo && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{copy.admin.savedStories}</h2>
          {stories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-500">
              {copy.admin.noStories}
            </p>
          ) : (
            <ul className="space-y-2">
              {stories.map((story) => (
                <StoryRow key={story.id} story={story} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function PostedList({ posted }: { posted: PostedSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function takeDown(slug: string) {
    setBusy(slug);
    await fetch(`/api/admin/stories/post?slug=${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    }).catch(() => null);
    setBusy(null);
    router.refresh();
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">{copy.admin.liveNow}</h2>

      {posted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 px-4 py-6 text-center text-xs leading-relaxed text-slate-500">
          {copy.admin.liveNowEmpty}
        </p>
      ) : (
        <ul className="space-y-2">
          {posted.map((story) => (
            <li
              key={story.slug}
              className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{story.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {copy.admin.liveEpisodes(story.episodes)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/series/${story.slug}`}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200"
                >
                  {copy.admin.openInApp}
                </Link>
                <button
                  type="button"
                  onClick={() => takeDown(story.slug)}
                  disabled={busy === story.slug}
                  aria-label={copy.admin.takeDown}
                  className="grid h-[34px] w-9 place-items-center rounded-lg bg-rose-500/15 text-rose-300 disabled:opacity-50"
                >
                  {busy === story.slug ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BreakdownView({ result, demo }: { result: Result; demo: boolean }) {
  const router = useRouter();
  const { breakdown, model } = result;

  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState<{ slug: string; episodes: number } | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  async function post() {
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch(
        demo ? '/api/admin/stories/post' : `/api/admin/stories/${result.storyId}/publish`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            demo
              ? {
                  title: breakdown.title,
                  logline: breakdown.logline,
                  tags: breakdown.tags,
                  scenes: breakdown.scenes,
                }
              : { force: true },
          ),
        },
      );
      const body = (await res.json()) as ApiResponse<{ slug?: string; episodes?: number }>;

      if (!body.ok) {
        setPostError(body.error.message);
        return;
      }

      setPosted({
        slug: body.data.slug ?? '',
        episodes: body.data.episodes ?? breakdown.scenes.length,
      });
      router.refresh();
    } catch {
      setPostError(copy.errors.INTERNAL);
    } finally {
      setPosting(false);
    }
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{breakdown.title}</h2>
        <p className="mt-1 text-xs text-slate-400">{breakdown.logline}</p>
        <p className="mt-2 text-[10px] text-slate-500">
          {model ? copy.admin.generatedBy(model) : null}
        </p>
      </div>

      {!model && <Notice icon={<AlertTriangle className="h-3.5 w-3.5" />}>{copy.admin.generatedLocally}</Notice>}

      <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/[0.07] p-4">
        {posted ? (
          <>
            <p className="text-xs font-semibold text-sky-300">
              {copy.admin.postedTo(posted.episodes)}
            </p>
            <Link
              href={posted.slug ? `/series/${posted.slug}` : '/reels'}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-[11px] font-semibold text-slate-950"
            >
              {copy.admin.viewInApp}
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={post}
              disabled={posting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {posting ? copy.admin.posting : copy.admin.post}
            </button>
            <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">{copy.admin.postHint}</p>
            {demo && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                {copy.admin.demoOneStory}
              </p>
            )}
            {postError && <p className="mt-2 text-[11px] text-rose-300">{postError}</p>}
          </>
        )}
      </div>

      <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {copy.admin.scenesHeading} ({breakdown.scenes.length})
      </h3>

      <ul className="space-y-2">
        {breakdown.scenes.map((scene) => (
          <li key={scene.scene_number} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold">
                <span className="text-slate-500">{scene.scene_number}.</span> {scene.title}
              </p>
              <span className="shrink-0 text-[10px] text-slate-500">
                {formatDuration(scene.duration_seconds)}
              </span>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-300">{scene.beat}</p>

            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-sky-400">Script</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">
                {scene.script}
              </pre>
            </details>

            <p className="mt-2 border-t border-slate-800 pt-2 text-[11px] italic text-amber-300/90">
              {copy.admin.hook}: {scene.hook}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StoryRow({ story }: { story: Story }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/stories/${story.id}/publish`, { method: 'POST' });
      const body = (await res.json()) as ApiResponse<{ published: boolean }>;
      setMessage(
        body.ok
          ? body.data.published
            ? copy.admin.published
            : copy.admin.publishDraftNote
          : body.error.message,
      );
      if (body.ok) router.refresh();
    } catch {
      setMessage(copy.errors.INTERNAL);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{story.title}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {story.sceneCount} episodes · {story.renderedCount} rendered · {story.status}
          </p>
          {story.renderedCount < story.sceneCount && (
            <p className="mt-0.5 text-[10px] text-slate-500">{copy.admin.renderPending}</p>
          )}
        </div>

        <button
          type="button"
          onClick={publish}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {busy ? copy.admin.publishing : copy.admin.publish}
        </button>
      </div>

      {message && <p className="mt-2 text-[11px] text-slate-400">{message}</p>}
    </li>
  );
}

function Notice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-[11px] leading-relaxed text-slate-400">
      <span className="mt-0.5 shrink-0 text-amber-400">{icon}</span>
      <span>{children}</span>
    </p>
  );
}
