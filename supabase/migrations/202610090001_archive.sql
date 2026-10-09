-- Versioned migration. Run once, as postgres, in Supabase SQL Editor.
begin;

create schema if not exists archive_private;
revoke all on schema archive_private from public, anon, authenticated;
create table archive_private.administrators (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
revoke all on archive_private.administrators from public, anon, authenticated;

create function public.is_archive_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from archive_private.administrators where user_id = (select auth.uid()));
$$;
revoke all on function public.is_archive_admin() from public;
grant execute on function public.is_archive_admin() to anon, authenticated;

create table public.media_assets (
  id uuid primary key,
  album_id uuid not null,
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('cover', 'audio')),
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 12582912),
  duration double precision,
  storage_path text not null unique,
  status text not null default 'staged' check (status in ('staged', 'active', 'deleting')),
  created_at timestamptz not null default now(),
  check (
    (kind = 'cover' and mime_type in ('image/jpeg','image/png','image/webp') and byte_size <= 5242880 and duration is null)
    or (kind = 'audio' and mime_type = 'audio/wav' and duration is not null and duration >= 20 and duration <= 60)
  ),
  check (storage_path = album_id::text || '/' || id::text || case mime_type
    when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' when 'audio/wav' then '.wav' end)
);

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  artist text not null check (length(btrim(artist)) between 1 and 200),
  release_year integer check (release_year between 1000 and 9999),
  cover_path text references public.media_assets(storage_path),
  description text not null default '' check (length(description) <= 5000),
  background_color text not null default '#141b18' check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  display_order integer not null default 0 check (display_order >= 0),
  published boolean not null default false,
  featured_track_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  track_number integer not null check (track_number between 1 and 100),
  audio_path text references public.media_assets(storage_path),
  duration double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (album_id, id),
  unique (album_id, track_number),
  check ((audio_path is null and duration is null) or (audio_path is not null and duration is not null and duration >= 20 and duration <= 60))
);
alter table public.albums add constraint album_featured_track_fk
  foreign key (id, featured_track_id) references public.tracks(album_id, id) deferrable initially deferred;
create index albums_published_order_idx on public.albums (display_order, id) where published;
create index albums_admin_order_idx on public.albums (display_order, id);
create index tracks_album_order_idx on public.tracks (album_id, track_number);
create index tracks_audio_path_idx on public.tracks (audio_path) where audio_path is not null;
create index albums_cover_path_idx on public.albums (cover_path) where cover_path is not null;
create index media_assets_staged_idx on public.media_assets (created_at) where status = 'staged';

create table public.archive_media_gc (
  storage_path text primary key references public.media_assets(storage_path) on delete cascade,
  queued_at timestamptz not null default now()
);

alter table public.albums enable row level security;
alter table public.tracks enable row level security;
alter table public.media_assets enable row level security;
alter table public.archive_media_gc enable row level security;
revoke all on public.albums, public.tracks, public.media_assets, public.archive_media_gc from public, anon, authenticated;
grant select on public.albums, public.tracks to anon, authenticated;
grant insert, update, delete on public.albums, public.tracks to authenticated;
grant select, insert, update, delete on public.media_assets, public.archive_media_gc to authenticated;
create policy archive_albums_read on public.albums for select to anon, authenticated
  using (published or (select public.is_archive_admin()));
create policy archive_albums_write on public.albums for all to authenticated
  using ((select public.is_archive_admin())) with check ((select public.is_archive_admin()));
create policy archive_tracks_read on public.tracks for select to anon, authenticated
  using ((select public.is_archive_admin()) or exists (select 1 from public.albums a where a.id = album_id and a.published));
create policy archive_tracks_write on public.tracks for all to authenticated
  using ((select public.is_archive_admin())) with check ((select public.is_archive_admin()));
create policy archive_assets_admin on public.media_assets for all to authenticated
  using ((select public.is_archive_admin())) with check ((select public.is_archive_admin()));
create policy archive_gc_admin on public.archive_media_gc for all to authenticated
  using ((select public.is_archive_admin())) with check ((select public.is_archive_admin()));

create function public.archive_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end;
$$;
create trigger archive_album_updated before update on public.albums for each row execute function public.archive_touch_updated_at();
create trigger archive_track_updated before update on public.tracks for each row execute function public.archive_touch_updated_at();
revoke all on function public.archive_touch_updated_at() from public;

create function public.archive_validate_media_reference() returns trigger
language plpgsql security definer set search_path = '' as $$
declare asset public.media_assets; media_path text; required_kind text; parent_id uuid;
begin
  if not public.is_archive_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  if tg_table_name = 'albums' then media_path := new.cover_path; required_kind := 'cover'; parent_id := new.id;
  else media_path := new.audio_path; required_kind := 'audio'; parent_id := new.album_id; end if;
  if media_path is null then return new; end if;
  select * into asset from public.media_assets where storage_path = media_path for update;
  if asset.id is null or asset.kind <> required_kind or asset.album_id <> parent_id or asset.status = 'deleting'
    or not exists (select 1 from storage.objects where bucket_id = 'archive-media' and name = media_path) then
    raise exception 'Invalid or missing uploaded media';
  end if;
  if required_kind = 'audio' then
    if new.duration is distinct from asset.duration then raise exception 'Clip duration does not match uploaded asset'; end if;
  end if;
  update public.media_assets set status = 'active' where id = asset.id;
  return new;
end;
$$;
create trigger archive_album_media before insert or update of cover_path on public.albums for each row execute function public.archive_validate_media_reference();
create trigger archive_track_media before insert or update of audio_path, duration on public.tracks for each row execute function public.archive_validate_media_reference();
revoke all on function public.archive_validate_media_reference() from public;

create function public.archive_queue_old_media() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_path text; new_path text;
begin
  if tg_table_name = 'albums' then
    old_path := old.cover_path;
    if tg_op = 'UPDATE' then new_path := new.cover_path; end if;
  else
    old_path := old.audio_path;
    if tg_op = 'UPDATE' then new_path := new.audio_path; end if;
  end if;
  if old_path is not null and old_path is distinct from new_path then
    insert into public.archive_media_gc(storage_path) values(old_path) on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger archive_album_gc after delete or update of cover_path on public.albums for each row execute function public.archive_queue_old_media();
create trigger archive_track_gc after delete or update of audio_path on public.tracks for each row execute function public.archive_queue_old_media();
revoke all on function public.archive_queue_old_media() from public;

create function public.archive_stage_media(p_id uuid, p_album_id uuid, p_kind text, p_mime_type text, p_byte_size bigint, p_duration double precision default null)
returns text language plpgsql security invoker set search_path = '' as $$
declare media_path text;
begin
  if not public.is_archive_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  media_path := p_album_id::text || '/' || p_id::text || case p_mime_type
    when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' when 'audio/wav' then '.wav' end;
  insert into public.media_assets(id, album_id, owner_id, kind, mime_type, byte_size, duration, storage_path)
    values (p_id, p_album_id, auth.uid(), p_kind, p_mime_type, p_byte_size, p_duration, media_path);
  return media_path;
end;
$$;

create function public.archive_save_album(p_album jsonb, p_expected_updated_at timestamptz default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare album_uuid uuid := (p_album->>'id')::uuid; current_row public.albums; item jsonb; next_order integer;
begin
  if not public.is_archive_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(714210001);
  if jsonb_typeof(p_album->'tracks') is distinct from 'array' or jsonb_array_length(p_album->'tracks') > 100 then raise exception 'Invalid track list'; end if;
  select * into current_row from public.albums where id = album_uuid for update;
  if current_row.id is not null and current_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This album changed in another window. Refresh before saving.' using errcode = '40001';
  end if;
  if current_row.id is null and p_expected_updated_at is not null then raise exception 'Album was deleted in another window' using errcode = '40001'; end if;
  if current_row.id is null then select coalesce(max(display_order), -1) + 1 into next_order from public.albums;
  else next_order := current_row.display_order; end if;
  insert into public.albums(id, title, artist, release_year, cover_path, description, background_color, display_order, published, featured_track_id)
    values(album_uuid, btrim(p_album->>'title'), btrim(p_album->>'artist'), (p_album->>'release_year')::integer,
      nullif(p_album->>'cover_path',''), coalesce(p_album->>'description',''), coalesce(p_album->>'background_color','#141b18'),
      next_order, coalesce((p_album->>'published')::boolean,false), null)
    on conflict (id) do update set title = excluded.title, artist = excluded.artist, release_year = excluded.release_year,
      cover_path = excluded.cover_path, description = excluded.description, background_color = excluded.background_color,
      published = excluded.published, featured_track_id = null;
  delete from public.tracks where album_id = album_uuid;
  for item in select value from jsonb_array_elements(p_album->'tracks') loop
    insert into public.tracks(id, album_id, title, track_number, audio_path, duration)
      values((item->>'id')::uuid, album_uuid, btrim(item->>'title'), (item->>'track_number')::integer,
        nullif(item->>'audio_path',''), (item->>'duration')::double precision);
  end loop;
  update public.albums set featured_track_id = nullif(p_album->>'featured_track_id','')::uuid where id = album_uuid;
  delete from public.archive_media_gc q where exists (select 1 from public.albums a where a.cover_path = q.storage_path)
    or exists (select 1 from public.tracks t where t.audio_path = q.storage_path);
  return album_uuid;
end;
$$;

create function public.archive_set_published(p_id uuid, p_published boolean, p_expected_updated_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_archive_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(714210001);
  update public.albums set published = p_published where id = p_id and updated_at = p_expected_updated_at;
  if not found then raise exception 'Album changed; refresh before publishing' using errcode = '40001'; end if;
end;
$$;
create function public.archive_delete_album(p_id uuid, p_expected_updated_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_archive_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(714210001);
  delete from public.albums where id = p_id and updated_at = p_expected_updated_at;
  if not found then raise exception 'Album changed; refresh before deleting' using errcode = '40001'; end if;
end;
$$;
create function public.archive_reorder_albums(p_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_archive_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(714210001);
  if cardinality(p_ids) <> (select count(*) from public.albums)
    or cardinality(p_ids) <> (select count(distinct value) from unnest(p_ids) value)
    or exists (select 1 from unnest(p_ids) value where not exists (select 1 from public.albums where id = value)) then
    raise exception 'Album list changed; refresh before reordering' using errcode = '40001';
  end if;
  update public.albums a set display_order = ordered.position - 1
    from unnest(p_ids) with ordinality as ordered(id, position) where a.id = ordered.id;
end;
$$;

create function public.archive_claim_media_cleanup() returns setof text
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_archive_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(714210001);
  insert into public.archive_media_gc(storage_path)
    select m.storage_path from public.media_assets m where m.created_at < now() - interval '24 hours'
      and not exists(select 1 from public.albums a where a.cover_path = m.storage_path)
      and not exists(select 1 from public.tracks t where t.audio_path = m.storage_path) on conflict do nothing;
  delete from public.archive_media_gc q where exists(select 1 from public.albums a where a.cover_path = q.storage_path)
    or exists(select 1 from public.tracks t where t.audio_path = q.storage_path);
  return query update public.media_assets m set status = 'deleting'
    where m.storage_path in (select q.storage_path from public.archive_media_gc q order by q.queued_at limit 25)
    returning m.storage_path;
end;
$$;
create function public.archive_finish_media_cleanup(p_paths text[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_archive_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(714210001);
  delete from public.media_assets m where m.storage_path = any(p_paths) and m.status = 'deleting'
    and not exists(select 1 from storage.objects o where o.bucket_id = 'archive-media' and o.name = m.storage_path)
    and not exists(select 1 from public.albums a where a.cover_path = m.storage_path)
    and not exists(select 1 from public.tracks t where t.audio_path = m.storage_path);
end;
$$;
create function public.archive_abandon_media(p_paths text[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_archive_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(714210001);
  insert into public.archive_media_gc(storage_path) select storage_path from public.media_assets m
    where storage_path = any(p_paths) and not exists(select 1 from public.albums a where a.cover_path = m.storage_path)
    and not exists(select 1 from public.tracks t where t.audio_path = m.storage_path) on conflict do nothing;
end;
$$;

revoke all on function public.archive_stage_media(uuid,uuid,text,text,bigint,double precision) from public;
revoke all on function public.archive_save_album(jsonb,timestamptz) from public;
revoke all on function public.archive_set_published(uuid,boolean,timestamptz) from public;
revoke all on function public.archive_delete_album(uuid,timestamptz) from public;
revoke all on function public.archive_reorder_albums(uuid[]) from public;
revoke all on function public.archive_claim_media_cleanup() from public;
revoke all on function public.archive_finish_media_cleanup(text[]) from public;
revoke all on function public.archive_abandon_media(text[]) from public;
grant execute on function public.archive_stage_media(uuid,uuid,text,text,bigint,double precision),
  public.archive_save_album(jsonb,timestamptz), public.archive_set_published(uuid,boolean,timestamptz),
  public.archive_delete_album(uuid,timestamptz), public.archive_reorder_albums(uuid[]),
  public.archive_claim_media_cleanup(), public.archive_finish_media_cleanup(text[]), public.archive_abandon_media(text[]) to authenticated;

-- Only current references of published albums can be fetched anonymously.
create function public.can_read_archive_media(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_archive_admin() or exists (
    select 1 from public.albums a where a.published and (a.cover_path = p_path or exists (
      select 1 from public.tracks t where t.album_id = a.id and t.audio_path = p_path))
  );
$$;
revoke all on function public.can_read_archive_media(text) from public;
grant execute on function public.can_read_archive_media(text) to anon, authenticated;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values('archive-media','archive-media',false,12582912,array['image/jpeg','image/png','image/webp','audio/wav'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy archive_media_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'archive-media' and public.can_read_archive_media(name));
create policy archive_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'archive-media' and (select public.is_archive_admin()) and exists (
    select 1 from public.media_assets m where m.storage_path = name and m.status = 'staged' and m.owner_id = (select auth.uid())
  ));
-- No UPDATE policy: paths are immutable and uploads always use upsert:false.
create policy archive_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'archive-media' and (select public.is_archive_admin()) and exists (
    select 1 from public.media_assets m where m.storage_path = name and m.status = 'deleting'
  ));
commit;
