-- =============================================================================
-- PH-Drama — Story Studio
--
-- The production side of the app: an admin writes a premise, a model breaks it
-- into per-episode scenes, each scene queues a render job, and a finished story
-- is published as a series whose episodes are the scenes.
--
-- Everything here is admin-only. No viewer policy is granted on any table.
-- =============================================================================

do $$ begin
  create type story_status  as enum ('draft', 'scripted', 'rendering', 'ready', 'published', 'failed');
  create type render_status as enum ('queued', 'running', 'succeeded', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists public.stories (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  logline         text not null default '',
  premise         text not null,
  tags            text[] not null default '{}',
  target_episodes integer not null default 12 check (target_episodes between 1 and 80),
  free_episodes   integer not null default 5 check (free_episodes >= 0),
  status          story_status not null default 'draft',
  model           text,
  series_id       uuid references public.series (id) on delete set null,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists stories_status_idx on public.stories (status, created_at desc);

create table if not exists public.story_scenes (
  id               uuid primary key default gen_random_uuid(),
  story_id         uuid not null references public.stories (id) on delete cascade,
  scene_number     integer not null check (scene_number > 0),
  title            text not null,
  beat             text not null default '',
  script           text not null default '',
  hook             text not null default '',
  duration_seconds integer not null default 90 check (duration_seconds > 0),
  created_at       timestamptz not null default now(),
  unique (story_id, scene_number)
);

comment on column public.story_scenes.hook is
  'The cliffhanger line the episode ends on. This is what sells the next unlock.';

create table if not exists public.render_jobs (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references public.stories (id) on delete cascade,
  scene_id    uuid not null references public.story_scenes (id) on delete cascade,
  provider    text not null,
  status      render_status not null default 'queued',
  attempts    integer not null default 0,
  external_id text,
  output_path text,
  error       text,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz,
  unique (scene_id)
);

comment on column public.render_jobs.output_path is
  'Path in the private `videos` bucket. Becomes episodes.hls_path on publish.';

create index if not exists render_jobs_queue_idx on public.render_jobs (status, created_at)
  where status in ('queued', 'running');

drop trigger if exists stories_touch on public.stories;
create trigger stories_touch before update on public.stories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Publishing: a story becomes a series, its scenes become episodes.
-- ---------------------------------------------------------------------------
create or replace function public.publish_story(p_story uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin    uuid := auth.uid();
  v_story    public.stories;
  v_series   uuid;
  v_slug     citext;
  v_rendered integer;
  v_total    integer;
begin
  if not public.is_admin(v_admin) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_story from public.stories where id = p_story for update;
  if v_story.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*) into v_total from public.story_scenes where story_id = p_story;
  if v_total = 0 then
    raise exception 'NO_SCENES' using errcode = 'P0001';
  end if;

  select count(*) into v_rendered
  from public.story_scenes s
  join public.render_jobs j on j.scene_id = s.id
  where s.story_id = p_story and j.status = 'succeeded' and j.output_path is not null;

  -- Reuse the series on a re-publish so episode ids (and viewers' unlocks) survive.
  v_series := v_story.series_id;

  if v_series is null then
    v_slug := regexp_replace(lower(v_story.title), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if exists (select 1 from public.series where slug = v_slug) then
      v_slug := v_slug || '-' || substr(p_story::text, 1, 6);
    end if;

    insert into public.series (slug, title, synopsis, tags, free_episode_count, status)
    values (
      v_slug,
      v_story.title,
      v_story.logline,
      v_story.tags,
      v_story.free_episodes,
      -- Only a fully rendered story goes live. A partly rendered one stays a
      -- draft so viewers never meet an episode with no video behind it.
      case when v_rendered = v_total then 'published'::series_status else 'draft'::series_status end
    )
    returning id into v_series;

    update public.stories set series_id = v_series where id = p_story;
  else
    update public.series
       set title = v_story.title,
           synopsis = v_story.logline,
           tags = v_story.tags,
           free_episode_count = v_story.free_episodes,
           status = case when v_rendered = v_total then 'published'::series_status else status end
     where id = v_series;
  end if;

  insert into public.episodes (series_id, episode_number, title, synopsis, duration_seconds, hls_path, published_at)
  select
    v_series,
    s.scene_number,
    s.title,
    s.hook,
    s.duration_seconds,
    j.output_path,
    case when j.output_path is not null then now() else null end
  from public.story_scenes s
  left join public.render_jobs j on j.scene_id = s.id and j.status = 'succeeded'
  where s.story_id = p_story
  on conflict (series_id, episode_number) do update
    set title = excluded.title,
        synopsis = excluded.synopsis,
        duration_seconds = excluded.duration_seconds,
        hls_path = coalesce(excluded.hls_path, public.episodes.hls_path);

  update public.stories
     set status = case when v_rendered = v_total then 'published'::story_status else 'ready'::story_status end
   where id = p_story;

  return json_build_object(
    'ok', true,
    'series_id', v_series,
    'scenes', v_total,
    'rendered', v_rendered,
    'published', v_rendered = v_total
  );
end;
$$;

revoke all on function public.publish_story(uuid) from public, anon;
grant execute on function public.publish_story(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — admin only, all three tables
-- ---------------------------------------------------------------------------
alter table public.stories      enable row level security;
alter table public.story_scenes enable row level security;
alter table public.render_jobs  enable row level security;

drop policy if exists stories_admin on public.stories;
create policy stories_admin on public.stories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists story_scenes_admin on public.story_scenes;
create policy story_scenes_admin on public.story_scenes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists render_jobs_admin on public.render_jobs;
create policy render_jobs_admin on public.render_jobs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.stories, public.story_scenes, public.render_jobs from anon, authenticated;
grant select, insert, update, delete on public.stories, public.story_scenes, public.render_jobs
  to authenticated;
