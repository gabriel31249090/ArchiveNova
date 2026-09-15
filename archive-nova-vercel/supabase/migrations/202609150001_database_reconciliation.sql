-- ArchiveNova v4.6.1 — Database Reconciliation & Security
-- Reconciles the live Supabase schema with the current Next.js frontend.
-- Designed to be safe on both the current production database and fresh installs.

-- -----------------------------------------------------------------------------
-- 1. Canonical library tables
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.shelves') is null and to_regclass('public.library_shelves') is not null then
    alter table public.library_shelves rename to shelves;
  end if;

  if to_regclass('public.shelf_items') is null and to_regclass('public.library_shelf_items') is not null then
    alter table public.library_shelf_items rename to shelf_items;
  end if;

  if to_regclass('public.shelves') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='shelves' and column_name='user_id'
     )
     and not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='shelves' and column_name='owner_id'
     )
  then
    alter table public.shelves rename column user_id to owner_id;
  end if;

  if to_regclass('public.shelf_items') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='shelf_items' and column_name='added_at'
     )
     and not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='shelf_items' and column_name='created_at'
     )
  then
    alter table public.shelf_items rename column added_at to created_at;
  end if;
end;
$$;

create table if not exists public.shelves (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name varchar(120) not null,
  slug varchar(160) not null,
  description text,
  visibility varchar(20) not null default 'PUBLIC'
    check (visibility in ('PUBLIC','UNLISTED','PRIVATE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, slug)
);

create table if not exists public.shelf_items (
  shelf_id uuid not null references public.shelves(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  position integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  primary key(shelf_id, work_id)
);

create table if not exists public.library_entries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  state varchar(20) not null default 'TO_READ'
    check (state in ('TO_READ','READING','COMPLETED','FAVORITE')),
  private_note text,
  rating smallint check (rating is null or rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, work_id)
);

create index if not exists library_entries_user_updated_idx
  on public.library_entries(user_id, updated_at desc);
create index if not exists shelves_owner_updated_idx
  on public.shelves(owner_id, updated_at desc);
create index if not exists shelf_items_shelf_position_idx
  on public.shelf_items(shelf_id, position);
create index if not exists shelf_items_work_idx
  on public.shelf_items(work_id);

alter table public.library_entries enable row level security;
alter table public.shelves enable row level security;
alter table public.shelf_items enable row level security;

drop policy if exists library_entries_owner_all on public.library_entries;
create policy library_entries_owner_all
on public.library_entries for all to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

drop policy if exists library_shelves_read on public.shelves;
drop policy if exists library_shelves_owner_write on public.shelves;
drop policy if exists shelves_read on public.shelves;
drop policy if exists shelves_owner_write on public.shelves;

create policy shelves_read
on public.shelves for select to anon, authenticated
using (visibility in ('PUBLIC','UNLISTED') or owner_id=(select auth.uid()));

create policy shelves_owner_write
on public.shelves for all to authenticated
using (owner_id=(select auth.uid()))
with check (owner_id=(select auth.uid()));

drop policy if exists library_shelf_items_read on public.shelf_items;
drop policy if exists library_shelf_items_owner_write on public.shelf_items;
drop policy if exists shelf_items_read on public.shelf_items;
drop policy if exists shelf_items_owner_write on public.shelf_items;

create policy shelf_items_read
on public.shelf_items for select to anon, authenticated
using (
  exists (
    select 1 from public.shelves s
    where s.id=shelf_id
      and (s.visibility in ('PUBLIC','UNLISTED') or s.owner_id=(select auth.uid()))
  )
);

create policy shelf_items_owner_write
on public.shelf_items for all to authenticated
using (
  exists (
    select 1 from public.shelves s
    where s.id=shelf_id and s.owner_id=(select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.shelves s
    where s.id=shelf_id and s.owner_id=(select auth.uid())
  )
);

drop trigger if exists library_entries_updated_at on public.library_entries;
create trigger library_entries_updated_at
before update on public.library_entries
for each row execute function public.set_updated_at();

drop trigger if exists shelves_updated_at on public.shelves;
drop trigger if exists library_shelves_updated_at on public.shelves;
create trigger shelves_updated_at
before update on public.shelves
for each row execute function public.set_updated_at();

drop trigger if exists library_entries_active_account_guard on public.library_entries;
create trigger library_entries_active_account_guard
before insert or update or delete on public.library_entries
for each row execute function public.enforce_active_account_write();

drop trigger if exists shelves_active_account_guard on public.shelves;
create trigger shelves_active_account_guard
before insert or update or delete on public.shelves
for each row execute function public.enforce_active_account_write();

drop trigger if exists shelf_items_active_account_guard on public.shelf_items;
create trigger shelf_items_active_account_guard
before insert or update or delete on public.shelf_items
for each row execute function public.enforce_active_account_write();

-- -----------------------------------------------------------------------------
-- 2. Reader Pro compatibility
-- -----------------------------------------------------------------------------

alter table public.user_preferences
  add column if not exists reader_width smallint not null default 760,
  add column if not exists reader_focus boolean not null default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_preferences' and column_name='reader_content_width'
  ) then
    execute 'update public.user_preferences set reader_width=reader_content_width where reader_width=760 and reader_content_width is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_preferences' and column_name='reader_focus_mode'
  ) then
    execute 'update public.user_preferences set reader_focus=reader_focus_mode where reader_focus=false and reader_focus_mode is not null';
  end if;
end;
$$;

alter table public.reading_history
  add column if not exists scroll_offset integer not null default 0,
  add column if not exists completed boolean not null default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reading_history' and column_name='completed_at'
  ) then
    execute 'update public.reading_history set completed=(completed_at is not null or progress_percent >= 98)';
  end if;
end;
$$;

create or replace function public.save_reader_preferences(
  next_theme text,
  next_font text,
  next_font_size integer,
  next_line_height numeric,
  next_width integer,
  next_focus boolean
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  insert into public.user_preferences(
    user_id,reader_theme,reader_font,reader_font_size,reader_line_height,reader_width,reader_focus
  )
  values(
    auth.uid(),
    case when upper(coalesce(next_theme,'DARK')) in ('DARK','LIGHT','SEPIA') then upper(next_theme) else 'DARK' end,
    case when upper(coalesce(next_font,'SERIF')) in ('SERIF','SANS','MONO') then upper(next_font) else 'SERIF' end,
    greatest(14,least(coalesce(next_font_size,19),32)),
    greatest(1.20,least(coalesce(next_line_height,1.80),2.50)),
    greatest(520,least(coalesce(next_width,760),1100)),
    coalesce(next_focus,false)
  )
  on conflict(user_id) do update
  set reader_theme=excluded.reader_theme,
      reader_font=excluded.reader_font,
      reader_font_size=excluded.reader_font_size,
      reader_line_height=excluded.reader_line_height,
      reader_width=excluded.reader_width,
      reader_focus=excluded.reader_focus,
      updated_at=now();

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_preferences' and column_name='reader_content_width'
  ) then
    execute 'update public.user_preferences set reader_content_width=$1 where user_id=$2'
      using greatest(520,least(coalesce(next_width,760),1100)),auth.uid();
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_preferences' and column_name='reader_focus_mode'
  ) then
    execute 'update public.user_preferences set reader_focus_mode=$1 where user_id=$2'
      using coalesce(next_focus,false),auth.uid();
  end if;
end;
$$;

create or replace function public.get_reader_preferences()
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select case
    when auth.uid() is null then
      jsonb_build_object(
        'theme','DARK','font','SERIF','font_size',19,
        'line_height',1.80,'width',760,'focus',false
      )
    else coalesce((
      select jsonb_build_object(
        'theme',reader_theme,
        'font',reader_font,
        'font_size',reader_font_size,
        'line_height',reader_line_height,
        'width',reader_width,
        'focus',reader_focus
      )
      from public.user_preferences
      where user_id=auth.uid()
    ),jsonb_build_object(
      'theme','DARK','font','SERIF','font_size',19,
      'line_height',1.80,'width',760,'focus',false
    ))
  end;
$$;

create or replace function public.save_reading_progress(
  target_work uuid,
  target_chapter uuid,
  progress numeric default 0,
  scroll_y integer default 0
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  pct numeric(5,2):=greatest(0,least(coalesce(progress,0),100));
begin
  if uid is null then return; end if;
  if not public.can_read_work(target_work) then return; end if;

  if target_chapter is not null and not exists(
    select 1 from public.chapters c
    where c.id=target_chapter
      and c.work_id=target_work
      and c.status='PUBLISHED'
  ) then
    return;
  end if;

  insert into public.reading_history(
    user_id,work_id,chapter_id,progress_percent,scroll_offset,completed,last_read_at
  )
  values(
    uid,target_work,target_chapter,pct,greatest(coalesce(scroll_y,0),0),pct>=98,now()
  )
  on conflict(user_id,work_id) do update
  set chapter_id=excluded.chapter_id,
      progress_percent=excluded.progress_percent,
      scroll_offset=excluded.scroll_offset,
      completed=excluded.completed,
      last_read_at=excluded.last_read_at;

  update public.library_entries
  set state=case
        when pct>=98 then 'COMPLETED'
        when pct>1 and state='TO_READ' then 'READING'
        else state
      end,
      updated_at=now()
  where user_id=uid and work_id=target_work;
end;
$$;

create or replace function public.get_reading_progress(target_work uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select coalesce((
    select jsonb_build_object(
      'chapter_id',h.chapter_id,
      'progress',h.progress_percent,
      'scroll_offset',h.scroll_offset,
      'completed',h.completed,
      'last_read_at',h.last_read_at
    )
    from public.reading_history h
    where h.user_id=auth.uid() and h.work_id=target_work
  ),'{}'::jsonb);
$$;

-- -----------------------------------------------------------------------------
-- 3. Library / series / collections / shelves RPC surface
-- -----------------------------------------------------------------------------

create or replace function public.set_library_state(target_work uuid,next_state text)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare normalized text:=upper(coalesce(next_state,'TO_READ'));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if normalized not in ('TO_READ','READING','COMPLETED','FAVORITE') then raise exception 'INVALID_LIBRARY_STATE'; end if;
  if not public.can_read_work(target_work) then raise exception 'WORK_NOT_FOUND' using errcode='P0002'; end if;

  insert into public.library_entries(user_id,work_id,state)
  values(auth.uid(),target_work,normalized)
  on conflict(user_id,work_id) do update
  set state=excluded.state,updated_at=now();
end;
$$;

create or replace function public.remove_from_library(target_work uuid)
returns void
language sql
security definer
set search_path=public,auth,pg_temp
as $$
  delete from public.library_entries
  where user_id=auth.uid() and work_id=target_work;
$$;

create or replace function public.my_library()
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select jsonb_build_object(
    'entries',coalesce((
      select jsonb_agg(
        to_jsonb(wc)||jsonb_build_object(
          'library_state',le.state,
          'library_rating',le.rating,
          'library_note',le.private_note,
          'library_updated_at',le.updated_at,
          'last_chapter_id',rh.chapter_id,
          'progress',coalesce(rh.progress_percent,0),
          'last_read_at',rh.last_read_at
        )
        order by le.updated_at desc
      )
      from public.library_entries le
      join public.public_work_cards wc on wc.id=le.work_id
      left join public.reading_history rh
        on rh.user_id=le.user_id and rh.work_id=le.work_id
      where le.user_id=auth.uid()
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(
        to_jsonb(wc)||jsonb_build_object(
          'last_chapter_id',rh.chapter_id,
          'progress',rh.progress_percent,
          'completed',rh.completed,
          'last_read_at',rh.last_read_at
        )
        order by rh.last_read_at desc
      )
      from public.reading_history rh
      join public.public_work_cards wc on wc.id=rh.work_id
      where rh.user_id=auth.uid()
    ),'[]'::jsonb),
    'shelves',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,
        'name',s.name,
        'slug',s.slug,
        'description',s.description,
        'visibility',s.visibility,
        'count',(select count(*) from public.shelf_items si where si.shelf_id=s.id),
        'updated_at',s.updated_at
      ) order by s.updated_at desc)
      from public.shelves s
      where s.owner_id=auth.uid()
    ),'[]'::jsonb)
  );
$$;

create or replace function public.create_series(
  series_title text,
  series_summary text default '',
  series_visibility text default 'PUBLIC'
)
returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if char_length(btrim(coalesce(series_title,''))) not between 1 and 300 then raise exception 'INVALID_SERIES_TITLE'; end if;

  insert into public.series(owner_id,title,summary,visibility)
  values(
    auth.uid(),btrim(series_title),coalesce(series_summary,''),
    case when upper(coalesce(series_visibility,'PUBLIC')) in ('PUBLIC','UNLISTED','PRIVATE')
      then upper(series_visibility) else 'PUBLIC' end
  )
  returning id into sid;
  return sid;
end;
$$;

create or replace function public.set_series_work(
  target_series uuid,target_work uuid,should_include boolean default true
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if not exists(select 1 from public.series where id=target_series and owner_id=auth.uid())
    then raise exception 'SERIES_NOT_FOUND' using errcode='P0002'; end if;
  if not exists(select 1 from public.works where id=target_work and creator_id=auth.uid() and deleted_at is null)
    then raise exception 'NOT_OWNER' using errcode='42501'; end if;

  if should_include then
    insert into public.series_works(series_id,work_id,position)
    values(
      target_series,target_work,
      coalesce((select max(position)+1 from public.series_works where series_id=target_series),1)
    )
    on conflict(series_id,work_id) do nothing;
  else
    delete from public.series_works where series_id=target_series and work_id=target_work;
  end if;

  update public.series set updated_at=now() where id=target_series;
end;
$$;

create or replace function public.get_series(target_series uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select jsonb_build_object(
    'series',jsonb_build_object(
      'id',s.id,'title',s.title,'summary',s.summary,'visibility',s.visibility,
      'owner_id',s.owner_id,'owner_username',p.username::text,
      'owner_display_name',coalesce(p.display_name,p.username::text),
      'subscribed',exists(
        select 1 from public.series_subscriptions ss
        where ss.series_id=s.id and ss.user_id=auth.uid()
      )
    ),
    'works',coalesce((
      select jsonb_agg(to_jsonb(wc)||jsonb_build_object('series_position',sw.position) order by sw.position)
      from public.series_works sw
      join public.public_work_cards wc on wc.id=sw.work_id
      where sw.series_id=s.id
    ),'[]'::jsonb)
  )
  from public.series s
  join public.profiles p on p.id=s.owner_id
  where s.id=target_series
    and (s.visibility in ('PUBLIC','UNLISTED') or s.owner_id=auth.uid());
$$;

create or replace function public.create_collection(
  collection_name text,
  collection_description text default null,
  collection_visibility text default 'PUBLIC'
)
returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  cid uuid;
  base_slug text;
  candidate text;
  counter integer:=0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if char_length(btrim(coalesce(collection_name,''))) not between 1 and 160
    then raise exception 'INVALID_COLLECTION_NAME'; end if;

  base_slug:=coalesce(nullif(public.slugify(collection_name),''),'collection');
  candidate:=base_slug;

  while exists(select 1 from public.collections where owner_id=auth.uid() and slug=candidate) loop
    counter:=counter+1;
    candidate:=left(base_slug,145)||'-'||counter;
  end loop;

  insert into public.collections(owner_id,name,slug,description,visibility)
  values(
    auth.uid(),btrim(collection_name),candidate,
    nullif(btrim(coalesce(collection_description,'')),''),
    case when upper(coalesce(collection_visibility,'PUBLIC')) in ('PUBLIC','UNLISTED','PRIVATE')
      then upper(collection_visibility) else 'PUBLIC' end
  )
  returning id into cid;

  return cid;
end;
$$;

create or replace function public.set_collection_work(
  target_collection uuid,target_work uuid,should_include boolean default true
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if not exists(select 1 from public.collections where id=target_collection and owner_id=auth.uid())
    then raise exception 'COLLECTION_NOT_FOUND' using errcode='P0002'; end if;

  if should_include then
    if not public.can_read_work(target_work) then raise exception 'WORK_NOT_FOUND' using errcode='P0002'; end if;
    insert into public.collection_works(collection_id,work_id,added_by)
    values(target_collection,target_work,auth.uid())
    on conflict(collection_id,work_id) do nothing;
  else
    delete from public.collection_works
    where collection_id=target_collection and work_id=target_work;
  end if;

  update public.collections set updated_at=now() where id=target_collection;
end;
$$;

create or replace function public.get_collection(target_collection uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select jsonb_build_object(
    'collection',jsonb_build_object(
      'id',c.id,'name',c.name,'slug',c.slug,'description',c.description,'visibility',c.visibility,
      'owner_id',c.owner_id,'owner_username',p.username::text,
      'owner_display_name',coalesce(p.display_name,p.username::text)
    ),
    'works',coalesce((
      select jsonb_agg(to_jsonb(wc) order by cw.created_at desc)
      from public.collection_works cw
      join public.public_work_cards wc on wc.id=cw.work_id
      where cw.collection_id=c.id
    ),'[]'::jsonb)
  )
  from public.collections c
  join public.profiles p on p.id=c.owner_id
  where c.id=target_collection
    and (c.visibility in ('PUBLIC','UNLISTED') or c.owner_id=auth.uid());
$$;

create or replace function public.create_shelf(
  shelf_name text,
  shelf_description text default null,
  shelf_visibility text default 'PUBLIC'
)
returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  sid uuid;
  base_slug text;
  candidate text;
  counter integer:=0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if char_length(btrim(coalesce(shelf_name,''))) not between 1 and 120
    then raise exception 'INVALID_SHELF_NAME'; end if;

  base_slug:=coalesce(nullif(public.slugify(shelf_name),''),'shelf');
  candidate:=base_slug;

  while exists(select 1 from public.shelves where owner_id=auth.uid() and slug=candidate) loop
    counter:=counter+1;
    candidate:=left(base_slug,145)||'-'||counter;
  end loop;

  insert into public.shelves(owner_id,name,slug,description,visibility)
  values(
    auth.uid(),btrim(shelf_name),candidate,
    nullif(btrim(coalesce(shelf_description,'')),''),
    case when upper(coalesce(shelf_visibility,'PUBLIC')) in ('PUBLIC','UNLISTED','PRIVATE')
      then upper(shelf_visibility) else 'PUBLIC' end
  )
  returning id into sid;

  return sid;
end;
$$;

create or replace function public.set_shelf_work(
  target_shelf uuid,target_work uuid,should_include boolean default true
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.shelves where id=target_shelf and owner_id=auth.uid())
    then raise exception 'SHELF_NOT_FOUND' using errcode='P0002'; end if;

  if should_include then
    if not public.can_read_work(target_work) then raise exception 'WORK_NOT_FOUND' using errcode='P0002'; end if;
    insert into public.shelf_items(shelf_id,work_id,position)
    values(
      target_shelf,target_work,
      coalesce((select max(position)+1 from public.shelf_items where shelf_id=target_shelf),1)
    )
    on conflict(shelf_id,work_id) do nothing;
  else
    delete from public.shelf_items where shelf_id=target_shelf and work_id=target_work;
  end if;

  update public.shelves set updated_at=now() where id=target_shelf;
end;
$$;

create or replace function public.get_shelf(target_shelf uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select jsonb_build_object(
    'shelf',jsonb_build_object(
      'id',s.id,'name',s.name,'slug',s.slug,'description',s.description,'visibility',s.visibility,
      'owner_id',s.owner_id,'owner_username',p.username::text,
      'owner_display_name',coalesce(p.display_name,p.username::text)
    ),
    'works',coalesce((
      select jsonb_agg(to_jsonb(wc) order by si.position,si.created_at)
      from public.shelf_items si
      join public.public_work_cards wc on wc.id=si.work_id
      where si.shelf_id=s.id
    ),'[]'::jsonb)
  )
  from public.shelves s
  join public.profiles p on p.id=s.owner_id
  where s.id=target_shelf
    and (s.visibility in ('PUBLIC','UNLISTED') or s.owner_id=auth.uid());
$$;

create or replace function public.my_series_and_collections()
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select jsonb_build_object(
    'series',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'title',s.title,'summary',s.summary,'visibility',s.visibility,'updated_at',s.updated_at,
        'count',(select count(*) from public.series_works sw where sw.series_id=s.id)
      ) order by s.updated_at desc)
      from public.series s
      where s.owner_id=auth.uid()
    ),'[]'::jsonb),
    'collections',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'name',c.name,'slug',c.slug,'description',c.description,'visibility',c.visibility,'updated_at',c.updated_at,
        'count',(select count(*) from public.collection_works cw where cw.collection_id=c.id)
      ) order by c.updated_at desc)
      from public.collections c
      where c.owner_id=auth.uid()
    ),'[]'::jsonb)
  );
$$;

create or replace function public.update_series_info(
  target_series uuid,next_title text,next_summary text,next_visibility text
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare normalized text:=upper(coalesce(next_visibility,'PUBLIC'));
begin
  if normalized not in ('PUBLIC','UNLISTED','PRIVATE') then raise exception 'INVALID_VISIBILITY'; end if;
  update public.series
  set title=btrim(next_title),summary=coalesce(next_summary,''),visibility=normalized,updated_at=now()
  where id=target_series and owner_id=auth.uid();
  if not found then raise exception 'SERIES_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

create or replace function public.reorder_series_works(target_series uuid,ordered_work_ids uuid[])
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  expected integer;
  supplied integer;
  item uuid;
  pos integer:=0;
begin
  if not exists(select 1 from public.series where id=target_series and owner_id=auth.uid())
    then raise exception 'SERIES_NOT_FOUND' using errcode='P0002'; end if;

  select count(*) into expected from public.series_works where series_id=target_series;
  supplied:=coalesce(cardinality(ordered_work_ids),0);

  if expected<>supplied
     or (select count(distinct x) from unnest(ordered_work_ids) x)<>expected
  then
    raise exception 'INVALID_SERIES_ORDER';
  end if;

  if exists(
    select 1 from unnest(ordered_work_ids) x
    where not exists(
      select 1 from public.series_works sw
      where sw.series_id=target_series and sw.work_id=x
    )
  ) then
    raise exception 'FOREIGN_WORK_IN_SERIES';
  end if;

  update public.series_works set position=position+100000 where series_id=target_series;

  foreach item in array ordered_work_ids loop
    pos:=pos+1;
    update public.series_works set position=pos
    where series_id=target_series and work_id=item;
  end loop;

  update public.series set updated_at=now() where id=target_series;
end;
$$;

create or replace function public.delete_series(target_series uuid)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  delete from public.series where id=target_series and owner_id=auth.uid();
  if not found then raise exception 'SERIES_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

create or replace function public.update_collection_info(
  target_collection uuid,next_name text,next_description text,next_visibility text
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare normalized text:=upper(coalesce(next_visibility,'PUBLIC'));
begin
  if normalized not in ('PUBLIC','UNLISTED','PRIVATE') then raise exception 'INVALID_VISIBILITY'; end if;

  update public.collections
  set name=btrim(next_name),
      description=nullif(btrim(coalesce(next_description,'')),''),
      visibility=normalized,
      updated_at=now()
  where id=target_collection and owner_id=auth.uid();

  if not found then raise exception 'COLLECTION_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

create or replace function public.delete_collection(target_collection uuid)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  delete from public.collections where id=target_collection and owner_id=auth.uid();
  if not found then raise exception 'COLLECTION_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

create or replace function public.update_shelf_info(
  target_shelf uuid,next_name text,next_description text,next_visibility text
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare normalized text:=upper(coalesce(next_visibility,'PUBLIC'));
begin
  if normalized not in ('PUBLIC','UNLISTED','PRIVATE') then raise exception 'INVALID_VISIBILITY'; end if;

  update public.shelves
  set name=btrim(next_name),
      description=nullif(btrim(coalesce(next_description,'')),''),
      visibility=normalized,
      updated_at=now()
  where id=target_shelf and owner_id=auth.uid();

  if not found then raise exception 'SHELF_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

create or replace function public.reorder_shelf_works(target_shelf uuid,ordered_work_ids uuid[])
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  expected integer;
  supplied integer;
  item uuid;
  pos integer:=0;
begin
  if not exists(select 1 from public.shelves where id=target_shelf and owner_id=auth.uid())
    then raise exception 'SHELF_NOT_FOUND' using errcode='P0002'; end if;

  select count(*) into expected from public.shelf_items where shelf_id=target_shelf;
  supplied:=coalesce(cardinality(ordered_work_ids),0);

  if expected<>supplied
     or (select count(distinct x) from unnest(ordered_work_ids) x)<>expected
  then
    raise exception 'INVALID_SHELF_ORDER';
  end if;

  if exists(
    select 1 from unnest(ordered_work_ids) x
    where not exists(
      select 1 from public.shelf_items si
      where si.shelf_id=target_shelf and si.work_id=x
    )
  ) then
    raise exception 'FOREIGN_WORK_IN_SHELF';
  end if;

  foreach item in array ordered_work_ids loop
    pos:=pos+1;
    update public.shelf_items set position=pos
    where shelf_id=target_shelf and work_id=item;
  end loop;

  update public.shelves set updated_at=now() where id=target_shelf;
end;
$$;

create or replace function public.delete_shelf(target_shelf uuid)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  delete from public.shelves where id=target_shelf and owner_id=auth.uid();
  if not found then raise exception 'SHELF_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

-- Backwards-compatible API names from the alternate v4.5 schema.
create or replace function public.create_library_shelf(
  shelf_name text,
  shelf_visibility text default 'PRIVATE',
  shelf_description text default null
)
returns uuid
language sql
security definer
set search_path=public,auth,pg_temp
as $$
  select public.create_shelf(shelf_name,shelf_description,shelf_visibility);
$$;

create or replace function public.toggle_shelf_work(target_shelf uuid,target_work uuid)
returns boolean
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare exists_now boolean;
begin
  select exists(
    select 1 from public.shelf_items
    where shelf_id=target_shelf and work_id=target_work
  ) into exists_now;

  perform public.set_shelf_work(target_shelf,target_work,not exists_now);
  return not exists_now;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Scheduled publishing: canonical frontend column is scheduled_for
-- -----------------------------------------------------------------------------

alter table public.chapters
  add column if not exists scheduled_for timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='chapters' and column_name='scheduled_at'
  ) then
    execute 'update public.chapters set scheduled_for=scheduled_at where scheduled_for is null and scheduled_at is not null';
  end if;
end;
$$;

create index if not exists chapters_scheduled_for_idx
  on public.chapters(scheduled_for)
  where status='SCHEDULED';

create or replace function public.schedule_chapter(target_chapter uuid,publish_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if publish_at<=now() then raise exception 'SCHEDULE_MUST_BE_FUTURE'; end if;

  update public.chapters c
  set status='SCHEDULED',
      scheduled_for=publish_at,
      published_at=null,
      updated_at=now()
  from public.works w
  where c.id=target_chapter
    and w.id=c.work_id
    and w.creator_id=auth.uid()
    and w.deleted_at is null;

  if not found then raise exception 'CHAPTER_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
  return publish_at;
end;
$$;

create or replace function public.publish_due_chapters()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare affected integer;
begin
  update public.chapters
  set status='PUBLISHED',
      published_at=coalesce(published_at,now()),
      scheduled_for=null,
      updated_at=now()
  where status='SCHEDULED'
    and scheduled_for is not null
    and scheduled_for<=now();

  get diagnostics affected=row_count;
  return affected;
end;
$$;

revoke execute on function public.publish_due_chapters() from public,anon,authenticated;
grant execute on function public.publish_due_chapters() to service_role;

-- -----------------------------------------------------------------------------
-- 5. Draft collaboration / beta review
-- -----------------------------------------------------------------------------

create table if not exists public.draft_collaborators (
  draft_id uuid not null references public.drafts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  role varchar(20) not null check(role in ('COAUTHOR','BETA_READER')),
  status varchar(20) not null default 'PENDING' check(status in ('PENDING','ACCEPTED','DECLINED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(draft_id,user_id)
);

create table if not exists public.draft_inline_comments (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  chapter_id uuid not null references public.draft_chapters(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  anchor_text text,
  body text not null check(char_length(body) between 1 and 12000),
  status varchar(20) not null default 'OPEN' check(status in ('OPEN','RESOLVED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists draft_collaborators_user_status_idx
  on public.draft_collaborators(user_id,status);
create index if not exists draft_inline_comments_draft_created_idx
  on public.draft_inline_comments(draft_id,created_at desc);

alter table public.draft_collaborators enable row level security;
alter table public.draft_inline_comments enable row level security;

drop policy if exists draft_collaborators_members_read on public.draft_collaborators;
create policy draft_collaborators_members_read
on public.draft_collaborators for select to authenticated
using (
  user_id=(select auth.uid())
  or invited_by=(select auth.uid())
  or exists(
    select 1 from public.drafts d
    where d.id=draft_id and d.user_id=(select auth.uid())
  )
);

create or replace function public.can_edit_draft(target_draft uuid)
returns boolean
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select
    exists(
      select 1 from public.drafts d
      where d.id=target_draft and d.user_id=auth.uid()
    )
    or exists(
      select 1 from public.draft_collaborators dc
      where dc.draft_id=target_draft
        and dc.user_id=auth.uid()
        and dc.role='COAUTHOR'
        and dc.status='ACCEPTED'
    );
$$;

create or replace function public.can_review_draft(target_draft uuid)
returns boolean
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select
    exists(
      select 1 from public.drafts d
      where d.id=target_draft and d.user_id=auth.uid()
    )
    or exists(
      select 1 from public.draft_collaborators dc
      where dc.draft_id=target_draft
        and dc.user_id=auth.uid()
        and dc.status='ACCEPTED'
    );
$$;

drop policy if exists draft_inline_comments_members_all on public.draft_inline_comments;
create policy draft_inline_comments_members_all
on public.draft_inline_comments for all to authenticated
using (public.can_review_draft(draft_id))
with check (public.can_review_draft(draft_id));

drop trigger if exists draft_collaborators_updated_at on public.draft_collaborators;
create trigger draft_collaborators_updated_at
before update on public.draft_collaborators
for each row execute function public.set_updated_at();

drop trigger if exists draft_collaborators_active_account_guard on public.draft_collaborators;
create trigger draft_collaborators_active_account_guard
before insert or update or delete on public.draft_collaborators
for each row execute function public.enforce_active_account_write();

drop trigger if exists draft_inline_comments_active_account_guard on public.draft_inline_comments;
create trigger draft_inline_comments_active_account_guard
before insert or update or delete on public.draft_inline_comments
for each row execute function public.enforce_active_account_write();

do $$
begin
  begin
    alter publication supabase_realtime add table public.draft_inline_comments;
  exception
    when duplicate_object then null;
    when undefined_object then raise notice 'supabase_realtime publication is not available';
    when insufficient_privilege then raise notice 'Could not add draft comments to realtime publication';
  end;
end;
$$;

create or replace function public.invite_draft_collaborator(
  target_draft uuid,target_username text,target_role text
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  target_user uuid;
  normalized text:=upper(coalesce(target_role,'BETA_READER'));
begin
  if not exists(
    select 1 from public.drafts
    where id=target_draft and user_id=auth.uid()
  ) then
    raise exception 'NOT_OWNER' using errcode='42501';
  end if;

  if normalized not in ('COAUTHOR','BETA_READER') then raise exception 'INVALID_ROLE'; end if;

  select id into target_user
  from public.profiles
  where username=btrim(target_username) and status='ACTIVE';

  if target_user is null then raise exception 'USER_NOT_FOUND' using errcode='P0002'; end if;
  if target_user=auth.uid() then raise exception 'CANNOT_INVITE_SELF'; end if;

  insert into public.draft_collaborators(draft_id,user_id,invited_by,role,status)
  values(target_draft,target_user,auth.uid(),normalized,'PENDING')
  on conflict(draft_id,user_id) do update
  set role=excluded.role,status='PENDING',invited_by=auth.uid(),updated_at=now();

  insert into public.notifications(user_id,type,actor_user_id,payload)
  values(
    target_user,'DRAFT_COLLAB_INVITE',auth.uid(),
    jsonb_build_object('draft_id',target_draft,'role',normalized)
  );
end;
$$;

create or replace function public.respond_draft_invite(target_draft uuid,accept_invite boolean)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  update public.draft_collaborators
  set status=case when accept_invite then 'ACCEPTED' else 'DECLINED' end,
      updated_at=now()
  where draft_id=target_draft and user_id=auth.uid();

  if not found then raise exception 'INVITE_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

create or replace function public.my_draft_collaborations()
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select jsonb_build_object(
    'owned',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,'title',d.title,'updated_at',d.updated_at,
        'collaborators',(
          select count(*) from public.draft_collaborators dc
          where dc.draft_id=d.id and dc.status='ACCEPTED'
        )
      ) order by d.updated_at desc)
      from public.drafts d
      where d.user_id=auth.uid()
    ),'[]'::jsonb),
    'shared',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,'title',d.title,'updated_at',d.updated_at,
        'role',dc.role,'status',dc.status,
        'owner_username',p.username::text,
        'owner_display_name',coalesce(p.display_name,p.username::text)
      ) order by dc.updated_at desc)
      from public.draft_collaborators dc
      join public.drafts d on d.id=dc.draft_id
      join public.profiles p on p.id=d.user_id
      where dc.user_id=auth.uid()
    ),'[]'::jsonb)
  );
$$;

create or replace function public.get_draft_review(target_draft uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select jsonb_build_object(
    'draft',jsonb_build_object(
      'id',d.id,'title',d.title,'owner_id',d.user_id,'updated_at',d.updated_at
    ),
    'chapters',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'title',c.title,'position',c.position,
        'word_count',c.word_count,'content_html',c.content_html
      ) order by c.position)
      from public.draft_chapters c
      where c.draft_id=d.id
    ),'[]'::jsonb),
    'collaborators',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',dc.user_id,'username',p.username::text,
        'display_name',coalesce(p.display_name,p.username::text),
        'role',dc.role,'status',dc.status
      ) order by dc.created_at)
      from public.draft_collaborators dc
      join public.profiles p on p.id=dc.user_id
      where dc.draft_id=d.id
    ),'[]'::jsonb),
    'comments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',cm.id,'chapter_id',cm.chapter_id,'author_id',cm.author_id,
        'username',p.username::text,
        'display_name',coalesce(p.display_name,p.username::text),
        'anchor_text',cm.anchor_text,'body',cm.body,'status',cm.status,'created_at',cm.created_at
      ) order by cm.created_at)
      from public.draft_inline_comments cm
      join public.profiles p on p.id=cm.author_id
      where cm.draft_id=d.id
    ),'[]'::jsonb)
  )
  from public.drafts d
  where d.id=target_draft and public.can_review_draft(d.id);
$$;

create or replace function public.add_draft_inline_comment(
  target_draft uuid,target_chapter uuid,anchor text,comment_body text
)
returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare cid uuid;
begin
  if not public.can_review_draft(target_draft)
    then raise exception 'NO_ACCESS' using errcode='42501'; end if;

  if not exists(
    select 1 from public.draft_chapters
    where id=target_chapter and draft_id=target_draft
  ) then
    raise exception 'CHAPTER_NOT_FOUND' using errcode='P0002';
  end if;

  insert into public.draft_inline_comments(
    draft_id,chapter_id,author_id,anchor_text,body
  )
  values(
    target_draft,target_chapter,auth.uid(),
    nullif(left(btrim(coalesce(anchor,'')),500),''),
    btrim(comment_body)
  )
  returning id into cid;

  return cid;
end;
$$;

create or replace function public.resolve_draft_inline_comment(
  target_comment uuid,resolved boolean default true
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare did uuid;
begin
  select draft_id into did
  from public.draft_inline_comments
  where id=target_comment;

  if did is null or not public.can_review_draft(did)
    then raise exception 'NO_ACCESS' using errcode='42501'; end if;

  update public.draft_inline_comments
  set status=case when resolved then 'RESOLVED' else 'OPEN' end,
      resolved_at=case when resolved then now() else null end
  where id=target_comment;
end;
$$;

-- Coauthors can use the normal Writer Cloud editor.
create or replace function public.get_writer_draft(target_draft uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not public.can_edit_draft(target_draft)
    then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002'; end if;

  select jsonb_build_object(
    'id',d.id,'title',d.title,'revision',d.revision,
    'created_at',d.created_at,'updated_at',d.updated_at,
    'chapters',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'title',coalesce(c.title,''),
        'content_html',c.content_html,'content_json',c.content_json,
        'word_count',c.word_count,'position',c.position,
        'revision',c.revision,'updated_at',c.updated_at
      ) order by c.position)
      from public.draft_chapters c
      where c.draft_id=d.id
    ),'[]'::jsonb)
  )
  into result
  from public.drafts d
  where d.id=target_draft;

  return result;
end;
$$;

create or replace function public.save_writer_draft(
  target_draft uuid,
  target_chapter uuid,
  next_title text,
  next_chapter_title text,
  next_content_html text,
  next_content_json jsonb,
  next_word_count integer,
  expected_draft_revision bigint,
  expected_chapter_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  d public.drafts%rowtype;
  c public.draft_chapters%rowtype;
  now_value timestamptz:=now();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not public.can_edit_draft(target_draft)
    then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002'; end if;

  select * into d from public.drafts where id=target_draft for update;
  select * into c from public.draft_chapters
  where id=target_chapter and draft_id=target_draft for update;

  if c.id is null then raise exception 'CHAPTER_NOT_FOUND' using errcode='P0002'; end if;

  if d.revision<>expected_draft_revision or c.revision<>expected_chapter_revision then
    return jsonb_build_object(
      'ok',false,'conflict',true,
      'draft_revision',d.revision,
      'chapter_revision',c.revision,
      'updated_at',greatest(d.updated_at,c.updated_at),
      'remote',jsonb_build_object(
        'title',d.title,'chapter_title',coalesce(c.title,''),
        'content_html',c.content_html,'content_json',c.content_json,
        'word_count',c.word_count
      )
    );
  end if;

  update public.drafts
  set title=left(coalesce(next_title,''),300),
      revision=revision+1,
      updated_at=now_value
  where id=target_draft;

  update public.draft_chapters
  set title=nullif(left(btrim(coalesce(next_chapter_title,'')),300),''),
      content_html=coalesce(nullif(next_content_html,''),'<p></p>'),
      content_json=coalesce(next_content_json,content_json),
      word_count=greatest(0,coalesce(next_word_count,0)),
      revision=revision+1,
      updated_at=now_value
  where id=target_chapter;

  return jsonb_build_object(
    'ok',true,'conflict',false,
    'draft_revision',d.revision+1,
    'chapter_revision',c.revision+1,
    'updated_at',now_value
  );
end;
$$;

create or replace function public.add_writer_draft_chapter(
  target_draft uuid,next_title text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  cid uuid;
  next_position integer;
  now_value timestamptz:=now();
begin
  if not public.can_edit_draft(target_draft)
    then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002'; end if;

  select coalesce(max(position),0)+1 into next_position
  from public.draft_chapters
  where draft_id=target_draft;

  insert into public.draft_chapters(draft_id,title,position)
  values(
    target_draft,
    nullif(left(btrim(coalesce(next_title,'')),300),''),
    next_position
  )
  returning id into cid;

  update public.drafts
  set revision=revision+1,updated_at=now_value
  where id=target_draft;

  return jsonb_build_object(
    'id',cid,'title',coalesce(next_title,''),
    'position',next_position,'revision',1,'updated_at',now_value
  );
end;
$$;

create or replace function public.delete_writer_draft_chapter(target_chapter uuid)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  did uuid;
  chapter_total integer;
begin
  select draft_id into did
  from public.draft_chapters
  where id=target_chapter;

  if did is null or not public.can_edit_draft(did)
    then raise exception 'CHAPTER_NOT_FOUND' using errcode='P0002'; end if;

  select count(*) into chapter_total
  from public.draft_chapters
  where draft_id=did;

  if chapter_total<=1 then raise exception 'LAST_CHAPTER'; end if;

  delete from public.draft_chapters where id=target_chapter;

  with ordered as (
    select id,row_number() over(order by position,created_at)::integer new_position
    from public.draft_chapters
    where draft_id=did
  )
  update public.draft_chapters c
  set position=o.new_position
  from ordered o
  where c.id=o.id;

  update public.drafts
  set revision=revision+1,updated_at=now()
  where id=did;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Public taxonomy pages
-- -----------------------------------------------------------------------------

create or replace function public.get_taxonomy_page(
  target_slug text,target_kind text default 'FANDOM'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  kind text:=upper(coalesce(target_kind,'FANDOM'));
  result jsonb;
begin
  if kind='FANDOM' then
    select jsonb_build_object(
      'taxonomy',jsonb_build_object(
        'id',f.id,'name',f.name::text,'slug',f.slug,
        'description',f.description,'kind','FANDOM'
      ),
      'works',coalesce((
        select jsonb_agg(to_jsonb(wc) order by wc.updated_at desc)
        from public.work_fandoms wf
        join public.public_work_cards wc on wc.id=wf.work_id
        where wf.fandom_id=f.id
          and wc.visibility='PUBLIC'
          and wc.status<>'DRAFT'
      ),'[]'::jsonb)
    )
    into result
    from public.fandoms f
    where f.slug=target_slug;
  else
    select jsonb_build_object(
      'taxonomy',jsonb_build_object(
        'id',t.id,'name',t.name::text,'slug',t.slug,
        'description',t.description,'kind',t.type
      ),
      'works',coalesce((
        select jsonb_agg(to_jsonb(wc) order by wc.updated_at desc)
        from public.work_tags wt
        join public.public_work_cards wc on wc.id=wt.work_id
        where wt.tag_id=t.id
          and wc.visibility='PUBLIC'
          and wc.status<>'DRAFT'
      ),'[]'::jsonb)
    )
    into result
    from public.tags t
    where t.slug=target_slug
      and (kind='TAG' or t.type=kind);
  end if;

  if result is null then
    raise exception 'TAXONOMY_NOT_FOUND' using errcode='P0002';
  end if;

  return result;
end;
$$;

create or replace function public.public_taxonomy_sitemap()
returns table(kind text,slug text,updated_at timestamptz)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select 'FANDOM'::text,f.slug,max(w.updated_at)
  from public.fandoms f
  join public.work_fandoms wf on wf.fandom_id=f.id
  join public.works w on w.id=wf.work_id
  where w.visibility='PUBLIC'
    and w.status<>'DRAFT'
    and w.deleted_at is null
  group by f.slug

  union all

  select
    case
      when t.type='CHARACTER' then 'CHARACTER'
      when t.type='RELATIONSHIP' then 'RELATIONSHIP'
      else 'TAG'
    end,
    t.slug,
    max(w.updated_at)
  from public.tags t
  join public.work_tags wt on wt.tag_id=t.id
  join public.works w on w.id=wt.work_id
  where w.visibility='PUBLIC'
    and w.status<>'DRAFT'
    and w.deleted_at is null
  group by t.slug,t.type;
$$;

-- -----------------------------------------------------------------------------
-- 7. Rate limiting / anti-spam
-- -----------------------------------------------------------------------------

create table if not exists public.rate_limit_events (
  id bigint generated by default as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  bucket varchar(60) not null,
  payload_hash varchar(32),
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_actor_bucket_created_idx
  on public.rate_limit_events(actor_id,bucket,created_at desc);

alter table public.rate_limit_events enable row level security;

create or replace function public.consume_rate_limit(
  actor uuid,
  action_bucket text,
  max_actions integer,
  window_seconds integer,
  payload text default null
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  recent_count integer;
  fingerprint text:=case
    when nullif(btrim(coalesce(payload,'')),'') is null then null
    else md5(lower(btrim(payload)))
  end;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select count(*) into recent_count
  from public.rate_limit_events e
  where e.actor_id=actor
    and e.bucket=action_bucket
    and e.created_at>=now()-make_interval(secs=>greatest(1,window_seconds));

  if recent_count>=greatest(1,max_actions) then
    raise exception 'RATE_LIMITED' using errcode='P0001';
  end if;

  if fingerprint is not null and exists(
    select 1 from public.rate_limit_events e
    where e.actor_id=actor
      and e.bucket=action_bucket
      and e.payload_hash=fingerprint
      and e.created_at>=now()-interval '15 seconds'
  ) then
    raise exception 'DUPLICATE_SPAM' using errcode='P0001';
  end if;

  insert into public.rate_limit_events(actor_id,bucket,payload_hash)
  values(actor,left(action_bucket,60),fingerprint);

  delete from public.rate_limit_events
  where created_at<now()-interval '24 hours';
end;
$$;

create or replace function public.guard_archive_writes()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if tg_table_name='comments' then
    perform public.consume_rate_limit(new.user_id,'WORK_COMMENT',8,60,new.body);
  elsif tg_table_name='post_comments' then
    perform public.consume_rate_limit(new.user_id,'POST_COMMENT',10,60,new.body);
  elsif tg_table_name='community_posts' then
    perform public.consume_rate_limit(new.author_id,'COMMUNITY_POST',5,300,new.body);
  elsif tg_table_name='work_contributions' then
    perform public.consume_rate_limit(new.contributor_id,'WORK_CONTRIBUTION',6,3600,new.proposed_content);
  elsif tg_table_name='reports' then
    perform public.consume_rate_limit(
      new.reporter_id,'REPORT',6,3600,
      coalesce(new.reason,'')||' '||coalesce(new.details,'')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists comments_archive_guard on public.comments;
create trigger comments_archive_guard
before insert on public.comments
for each row execute function public.guard_archive_writes();

drop trigger if exists post_comments_archive_guard on public.post_comments;
create trigger post_comments_archive_guard
before insert on public.post_comments
for each row execute function public.guard_archive_writes();

drop trigger if exists community_posts_archive_guard on public.community_posts;
create trigger community_posts_archive_guard
before insert on public.community_posts
for each row execute function public.guard_archive_writes();

drop trigger if exists contributions_archive_guard on public.work_contributions;
create trigger contributions_archive_guard
before insert on public.work_contributions
for each row execute function public.guard_archive_writes();

drop trigger if exists reports_archive_guard on public.reports;
create trigger reports_archive_guard
before insert on public.reports
for each row execute function public.guard_archive_writes();

revoke execute on function public.consume_rate_limit(uuid,text,integer,integer,text) from public,anon,authenticated;
revoke execute on function public.guard_archive_writes() from public,anon,authenticated;

-- -----------------------------------------------------------------------------
-- 8. Chapter analytics
-- -----------------------------------------------------------------------------

create table if not exists public.chapter_hits (
  id bigint generated by default as identity primary key,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  visitor_hash char(64) not null,
  source varchar(80),
  hit_day date not null default current_date,
  created_at timestamptz not null default now(),
  unique(chapter_id,visitor_hash,hit_day)
);

create index if not exists chapter_hits_work_day_idx
  on public.chapter_hits(work_id,hit_day desc);
create index if not exists chapter_hits_chapter_created_idx
  on public.chapter_hits(chapter_id,created_at desc);

alter table public.chapter_hits enable row level security;

drop policy if exists chapter_hits_creator_read on public.chapter_hits;
create policy chapter_hits_creator_read
on public.chapter_hits for select to authenticated
using (
  exists(
    select 1 from public.works w
    where w.id=work_id
      and (w.creator_id=(select auth.uid()) or public.is_admin())
  )
);

drop policy if exists work_hits_creator_read on public.work_hits;
create policy work_hits_creator_read
on public.work_hits for select to authenticated
using (
  exists(
    select 1 from public.works w
    where w.id=work_id
      and (w.creator_id=(select auth.uid()) or public.is_admin())
  )
);

create or replace function public.creator_analytics(target_work uuid default null)
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select jsonb_build_object(
    'chapters',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'work_id',w.id,
        'work_title',w.title,
        'chapter_number',c.chapter_number,
        'title',c.title,
        'hits',(select count(*) from public.chapter_hits ch where ch.chapter_id=c.id),
        'unique_30d',(
          select count(*) from public.chapter_hits ch
          where ch.chapter_id=c.id
            and ch.created_at>=now()-interval '30 days'
        ),
        'retention',case
          when c.chapter_number=1 then 100
          else round(
            100.0*(select count(*) from public.chapter_hits ch where ch.chapter_id=c.id)
            /
            greatest(
              1,
              (
                select count(*)
                from public.chapter_hits ch
                join public.chapters first_c on first_c.id=ch.chapter_id
                where first_c.work_id=w.id and first_c.chapter_number=1
              )
            ),
            1
          )
        end
      ) order by w.updated_at desc,c.chapter_number)
      from public.chapters c
      join public.works w on w.id=c.work_id
      where w.creator_id=auth.uid()
        and w.deleted_at is null
        and c.status='PUBLISHED'
        and (target_work is null or w.id=target_work)
    ),'[]'::jsonb),
    'sources',coalesce((
      select jsonb_agg(
        jsonb_build_object('source',x.source,'hits',x.hits)
        order by x.hits desc
      )
      from (
        select coalesce(nullif(ch.source,''),'Direto') source,count(*) hits
        from public.chapter_hits ch
        join public.works w on w.id=ch.work_id
        where w.creator_id=auth.uid()
          and (target_work is null or w.id=target_work)
        group by coalesce(nullif(ch.source,''),'Direto')
        limit 12
      ) x
    ),'[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- 9. Notification preference enforcement
-- -----------------------------------------------------------------------------

create or replace function public.filter_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare allowed boolean;
begin
  select case
    when new.type='KUDOS' then np.kudos
    when new.type='COMMENT' then np.comments
    when new.type='COMMENT_REPLY' then np.replies
    when new.type='NEW_FOLLOWER' then np.follows
    when new.type='NEW_CHAPTER' then np.work_updates
    when new.type='BETA_READER_INVITE' then np.beta_reader
    when new.type like '%CONTRIB%'
      or new.type like '%COLLAB%'
      or new.type='DRAFT_COLLAB_INVITE' then np.collaborations
    when new.type like '%MODERAT%'
      or new.type like '%REPORT%' then np.moderation
    else true
  end
  into allowed
  from public.notification_preferences np
  where np.user_id=new.user_id;

  if coalesce(allowed,true)=false then return null; end if;
  return new;
end;
$$;

drop trigger if exists notifications_respect_preferences on public.notifications;
create trigger notifications_respect_preferences
before insert on public.notifications
for each row execute function public.filter_notification_preferences();

revoke execute on function public.filter_notification_preferences() from public,anon,authenticated;

-- -----------------------------------------------------------------------------
-- 10. Function hardening
-- -----------------------------------------------------------------------------

alter function public.count_words(text)
  set search_path=pg_catalog,public,pg_temp;
alter function public.slugify(text)
  set search_path=pg_catalog,public,pg_temp;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and pg_get_function_result(p.oid)='trigger'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated',r.signature);
  end loop;
end;
$$;

-- Keep explicitly public/authenticated RPCs available.
grant execute on function public.get_reader_preferences() to anon,authenticated;
grant execute on function public.get_taxonomy_page(text,text) to anon,authenticated;
grant execute on function public.public_taxonomy_sitemap() to anon,authenticated;
grant execute on function public.get_series(uuid) to anon,authenticated;
grant execute on function public.get_collection(uuid) to anon,authenticated;
grant execute on function public.get_shelf(uuid) to anon,authenticated;

grant execute on function public.save_reader_preferences(text,text,integer,numeric,integer,boolean) to authenticated;
grant execute on function public.save_reading_progress(uuid,uuid,numeric,integer) to authenticated;
grant execute on function public.get_reading_progress(uuid) to authenticated;
grant execute on function public.set_library_state(uuid,text) to authenticated;
grant execute on function public.remove_from_library(uuid) to authenticated;
grant execute on function public.my_library() to authenticated;
grant execute on function public.create_series(text,text,text) to authenticated;
grant execute on function public.set_series_work(uuid,uuid,boolean) to authenticated;
grant execute on function public.create_collection(text,text,text) to authenticated;
grant execute on function public.set_collection_work(uuid,uuid,boolean) to authenticated;
grant execute on function public.create_shelf(text,text,text) to authenticated;
grant execute on function public.set_shelf_work(uuid,uuid,boolean) to authenticated;
grant execute on function public.my_series_and_collections() to authenticated;
grant execute on function public.update_series_info(uuid,text,text,text) to authenticated;
grant execute on function public.reorder_series_works(uuid,uuid[]) to authenticated;
grant execute on function public.delete_series(uuid) to authenticated;
grant execute on function public.update_collection_info(uuid,text,text,text) to authenticated;
grant execute on function public.delete_collection(uuid) to authenticated;
grant execute on function public.update_shelf_info(uuid,text,text,text) to authenticated;
grant execute on function public.reorder_shelf_works(uuid,uuid[]) to authenticated;
grant execute on function public.delete_shelf(uuid) to authenticated;
grant execute on function public.create_library_shelf(text,text,text) to authenticated;
grant execute on function public.toggle_shelf_work(uuid,uuid) to authenticated;
grant execute on function public.schedule_chapter(uuid,timestamptz) to authenticated;
grant execute on function public.can_edit_draft(uuid) to authenticated;
grant execute on function public.can_review_draft(uuid) to authenticated;
grant execute on function public.invite_draft_collaborator(uuid,text,text) to authenticated;
grant execute on function public.respond_draft_invite(uuid,boolean) to authenticated;
grant execute on function public.my_draft_collaborations() to authenticated;
grant execute on function public.get_draft_review(uuid) to authenticated;
grant execute on function public.add_draft_inline_comment(uuid,uuid,text,text) to authenticated;
grant execute on function public.resolve_draft_inline_comment(uuid,boolean) to authenticated;
grant execute on function public.get_writer_draft(uuid) to authenticated;
grant execute on function public.save_writer_draft(uuid,uuid,text,text,text,jsonb,integer,bigint,bigint) to authenticated;
grant execute on function public.add_writer_draft_chapter(uuid,text) to authenticated;
grant execute on function public.delete_writer_draft_chapter(uuid) to authenticated;
grant execute on function public.creator_analytics(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 11. RLS init-plan optimization for existing auth.uid() policies
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
  q text;
  c text;
begin
  for r in
    select schemaname,tablename,policyname,qual,with_check
    from pg_policies
    where schemaname='public'
      and (
        coalesce(qual,'') like '%auth.uid()%'
        or coalesce(with_check,'') like '%auth.uid()%'
      )
  loop
    q:=case when r.qual is null then null
      else replace(r.qual,'auth.uid()','(select auth.uid())') end;
    c:=case when r.with_check is null then null
      else replace(r.with_check,'auth.uid()','(select auth.uid())') end;

    if q is not null then
      execute format(
        'alter policy %I on %I.%I using (%s)',
        r.policyname,r.schemaname,r.tablename,q
      );
    end if;

    if c is not null then
      execute format(
        'alter policy %I on %I.%I with check (%s)',
        r.policyname,r.schemaname,r.tablename,c
      );
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Cover single-column foreign keys with useful indexes
-- -----------------------------------------------------------------------------

do $$
declare r record;
declare idx_name text;
begin
  for r in
    select
      n.nspname schema_name,
      t.relname table_name,
      a.attname column_name,
      c.conrelid table_oid,
      c.conkey[1] column_number
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f'
      and n.nspname='public'
      and array_length(c.conkey,1)=1
      and not exists(
        select 1 from pg_index i
        where i.indrelid=c.conrelid
          and i.indisvalid
          and i.indkey[0]=c.conkey[1]
      )
  loop
    idx_name:=left('idx_'||r.table_name||'_'||r.column_name||'_fk',63);
    execute format(
      'create index if not exists %I on %I.%I (%I)',
      idx_name,r.schema_name,r.table_name,r.column_name
    );
  end loop;
end;
$$;
