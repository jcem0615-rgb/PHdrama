-- =============================================================================
-- PH-Drama — preview publishing
--
-- Lets a Story Studio story go live before its video exists, so the reels loop
-- can be walked end to end. The honesty rules are enforced here, not in the UI:
--
--   * A preview series is flagged `is_preview` and labelled in the app.
--   * Every episode of a preview series is FREE. What plays behind them is a
--     placeholder clip, not the story, and charging coins for that is a lie.
--   * The moment every scene has a rendered video, publishing again clears the
--     flag and restores the real free-episode window.
-- =============================================================================

alter table public.series
  add column if not exists is_preview boolean not null default false;

comment on column public.series.is_preview is
  'Published from the Story Studio before its episodes had rendered video. All episodes are free while this is true.';

-- The signature changes, so drop the old one rather than leave an ambiguous overload.
drop function if exists public.publish_story(uuid);

create or replace function public.publish_story(
  p_story uuid,
  p_force boolean default false
)
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
  v_complete boolean;
  v_preview  boolean;
  v_free     integer;
  v_status   series_status;
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

  v_complete := v_rendered = v_total;

  -- Fully rendered: a normal series on the story's own free-episode window.
  -- Forced without video: a preview — visible, but free all the way through.
  -- Neither: stays a draft, as before.
  v_preview := (not v_complete) and p_force;
  v_free    := case when v_preview then v_total else v_story.free_episodes end;
  v_status  := case
                 when v_complete or p_force then 'published'::series_status
                 else 'draft'::series_status
               end;

  v_series := v_story.series_id;

  if v_series is null then
    v_slug := regexp_replace(lower(v_story.title), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if v_slug = '' then v_slug := 'story'; end if;
    if exists (select 1 from public.series where slug = v_slug) then
      v_slug := v_slug || '-' || substr(p_story::text, 1, 6);
    end if;

    insert into public.series (slug, title, synopsis, tags, free_episode_count, status, is_preview)
    values (v_slug, v_story.title, v_story.logline, v_story.tags, v_free, v_status, v_preview)
    returning id into v_series;

    update public.stories set series_id = v_series where id = p_story;
  else
    update public.series
       set title = v_story.title,
           synopsis = v_story.logline,
           tags = v_story.tags,
           free_episode_count = v_free,
           is_preview = v_preview,
           status = case when v_complete or p_force then 'published'::series_status else status end
     where id = v_series;
  end if;

  insert into public.episodes (series_id, episode_number, title, synopsis, duration_seconds, coin_price, hls_path, published_at)
  select
    v_series,
    s.scene_number,
    s.title,
    s.hook,
    s.duration_seconds,
    case when v_preview then 0 else 30 end,
    j.output_path,
    now()
  from public.story_scenes s
  left join public.render_jobs j on j.scene_id = s.id and j.status = 'succeeded'
  where s.story_id = p_story
  on conflict (series_id, episode_number) do update
    set title = excluded.title,
        synopsis = excluded.synopsis,
        duration_seconds = excluded.duration_seconds,
        coin_price = excluded.coin_price,
        hls_path = coalesce(excluded.hls_path, public.episodes.hls_path);

  update public.stories
     set status = case when v_complete then 'published'::story_status else 'ready'::story_status end
   where id = p_story;

  return json_build_object(
    'ok', true,
    'series_id', v_series,
    'scenes', v_total,
    'rendered', v_rendered,
    'published', v_complete or p_force,
    'preview', v_preview
  );
end;
$$;

revoke all on function public.publish_story(uuid, boolean) from public, anon;
grant execute on function public.publish_story(uuid, boolean) to authenticated;
