-- Archive Nova v2 — Supabase/PostgreSQL schema
-- Empty by design: this migration creates structure, policies, functions and buckets only.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.count_words(value text)
returns integer
language sql
immutable
parallel safe
as $$
  select case
    when value is null or btrim(value) = '' then 0
    else cardinality(regexp_split_to_array(btrim(value), E'\\s+'))
  end;
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- -----------------------------------------------------------------------------
-- Accounts and preferences. auth.users is owned by Supabase Auth.
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  display_name varchar(80),
  bio text,
  role varchar(20) not null default 'USER' check (role in ('USER', 'MODERATOR', 'ADMIN')),
  status varchar(20) not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username::text ~ '^[A-Za-z0-9_]{3,40}$')
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme varchar(20) not null default 'SYSTEM' check (theme in ('SYSTEM', 'LIGHT', 'DARK')),
  hide_explicit boolean not null default false,
  default_language varchar(16) not null default 'pt-BR',
  email_notifications boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.pseuds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name citext not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create unique index pseuds_one_default_per_user on public.pseuds(user_id) where is_default;

-- -----------------------------------------------------------------------------
-- Works, chapters and taxonomy
-- -----------------------------------------------------------------------------

create table public.works (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete restrict,
  title varchar(300) not null,
  summary text not null default '',
  rating varchar(20) not null check (rating in ('GENERAL', 'TEEN', 'MATURE', 'EXPLICIT', 'NOT_RATED')),
  status varchar(20) not null default 'ONGOING' check (status in ('ONGOING', 'COMPLETE', 'HIATUS', 'DRAFT')),
  visibility varchar(20) not null default 'PUBLIC' check (visibility in ('PUBLIC', 'REGISTERED', 'UNLISTED', 'PRIVATE')),
  language varchar(16) not null default 'pt-BR',
  expected_chapters integer check (expected_chapters is null or expected_chapters > 0),
  word_count bigint not null default 0 check (word_count >= 0),
  chapter_count integer not null default 0 check (chapter_count >= 0),
  kudos_count bigint not null default 0 check (kudos_count >= 0),
  bookmarks_count bigint not null default 0 check (bookmarks_count >= 0),
  comments_count bigint not null default 0 check (comments_count >= 0),
  hits_count bigint not null default 0 check (hits_count >= 0),
  allow_comments boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.work_authors (
  work_id uuid not null references public.works(id) on delete cascade,
  pseud_id uuid not null references public.pseuds(id) on delete restrict,
  author_order smallint not null default 0,
  primary key (work_id, pseud_id),
  unique (work_id, author_order)
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  chapter_number integer not null check (chapter_number > 0),
  title varchar(300),
  content text not null,
  notes_before text,
  notes_after text,
  word_count integer not null default 0 check (word_count >= 0),
  status varchar(20) not null default 'PUBLISHED' check (status in ('DRAFT', 'PUBLISHED')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, chapter_number),
  unique (id, work_id)
);

create table public.fandoms (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique,
  slug varchar(260) not null unique,
  description text,
  canonical boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name citext not null,
  slug varchar(260) not null,
  type varchar(30) not null default 'FREEFORM' check (type in ('FREEFORM', 'CHARACTER', 'RELATIONSHIP', 'WARNING', 'CATEGORY')),
  canonical boolean not null default false,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (name, type),
  unique (slug, type)
);

create table public.tag_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_tag_id uuid not null unique references public.tags(id) on delete cascade,
  canonical_tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (alias_tag_id <> canonical_tag_id)
);

create table public.work_fandoms (
  work_id uuid not null references public.works(id) on delete cascade,
  fandom_id uuid not null references public.fandoms(id) on delete restrict,
  primary key (work_id, fandom_id)
);

create table public.work_tags (
  work_id uuid not null references public.works(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete restrict,
  primary key (work_id, tag_id)
);

-- -----------------------------------------------------------------------------
-- Community interactions
-- -----------------------------------------------------------------------------

create table public.kudos (
  work_id uuid not null references public.works(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (work_id, user_id)
);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  note text,
  private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 20000),
  status varchar(20) not null default 'VISIBLE' check (status in ('VISIBLE', 'HIDDEN', 'DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reading_history (
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  chapter_id uuid,
  last_read_at timestamptz not null default now(),
  primary key (user_id, work_id),
  foreign key (chapter_id, work_id) references public.chapters(id, work_id) on delete cascade
);

create table public.work_subscriptions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

create table public.work_hits (
  id bigint generated by default as identity primary key,
  work_id uuid not null references public.works(id) on delete cascade,
  visitor_hash char(64) not null,
  hit_day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (work_id, visitor_hash, hit_day)
);

-- -----------------------------------------------------------------------------
-- Series, collections, subscriptions, notifications and moderation
-- -----------------------------------------------------------------------------

create table public.series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title varchar(300) not null,
  summary text not null default '',
  visibility varchar(20) not null default 'PUBLIC' check (visibility in ('PUBLIC', 'UNLISTED', 'PRIVATE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.series_works (
  series_id uuid not null references public.series(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  position integer not null check (position > 0),
  primary key (series_id, work_id),
  unique (series_id, position)
);

create table public.series_subscriptions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id)
);

create table public.user_subscriptions (
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, author_id),
  check (subscriber_id <> author_id)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name varchar(160) not null,
  slug varchar(180) not null,
  description text,
  visibility varchar(20) not null default 'PUBLIC' check (visibility in ('PUBLIC', 'UNLISTED', 'PRIVATE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table public.collection_works (
  collection_id uuid not null references public.collections(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (collection_id, work_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type varchar(50) not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  work_id uuid references public.works(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  work_id uuid references public.works(id) on delete set null,
  comment_id uuid references public.comments(id) on delete set null,
  reason varchar(80) not null,
  details text,
  status varchar(20) not null default 'OPEN' check (status in ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.audit_log (
  id bigint generated by default as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action varchar(100) not null,
  entity_type varchar(60) not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

create index works_public_updated on public.works(updated_at desc)
  where deleted_at is null and visibility = 'PUBLIC' and status <> 'DRAFT';
create index works_creator_updated on public.works(creator_id, updated_at desc);
create index works_title_lower on public.works(lower(title));
create index chapters_work_number on public.chapters(work_id, chapter_number);
create index work_fandoms_fandom_work on public.work_fandoms(fandom_id, work_id);
create index work_tags_tag_work on public.work_tags(tag_id, work_id);
create index kudos_work_created on public.kudos(work_id, created_at desc);
create index bookmarks_user_created on public.bookmarks(user_id, created_at desc);
create index comments_chapter_created on public.comments(chapter_id, created_at asc) where status = 'VISIBLE';
create index history_user_recent on public.reading_history(user_id, last_read_at desc);
create index notifications_user_unread on public.notifications(user_id, created_at desc) where read_at is null;
create index reports_status_created on public.reports(status, created_at asc);
create index audit_entity on public.audit_log(entity_type, entity_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Automatic profile creation from Supabase Auth
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  requested_username text;
  final_username text;
  requested_display_name text;
begin
  requested_username := regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1), 'user'),
    '[^A-Za-z0-9_]', '_', 'g'
  );

  if char_length(requested_username) < 3 then
    requested_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  requested_username := left(requested_username, 40);
  final_username := requested_username;

  if exists (select 1 from public.profiles p where p.username = final_username) then
    final_username := left(requested_username, 31) || '_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  requested_display_name := nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80), '');

  insert into public.profiles(id, username, display_name)
  values (new.id, final_username, requested_display_name);

  insert into public.user_preferences(user_id) values (new.id);
  insert into public.pseuds(user_id, name, is_default) values (new.id, final_username, true);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Counter and timestamp triggers
-- -----------------------------------------------------------------------------

create trigger profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger preferences_updated_at before update on public.user_preferences
  for each row execute procedure public.set_updated_at();
create trigger works_updated_at before update on public.works
  for each row execute procedure public.set_updated_at();
create trigger chapters_updated_at before update on public.chapters
  for each row execute procedure public.set_updated_at();
create trigger bookmarks_updated_at before update on public.bookmarks
  for each row execute procedure public.set_updated_at();
create trigger comments_updated_at before update on public.comments
  for each row execute procedure public.set_updated_at();
create trigger series_updated_at before update on public.series
  for each row execute procedure public.set_updated_at();
create trigger collections_updated_at before update on public.collections
  for each row execute procedure public.set_updated_at();

create or replace function public.prepare_chapter()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.word_count := public.count_words(new.content);
  if new.status = 'PUBLISHED' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger chapters_prepare before insert or update of content, status on public.chapters
  for each row execute procedure public.prepare_chapter();

create or replace function public.refresh_work_chapter_totals()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_work uuid;
begin
  if tg_op = 'DELETE' then
    target_work := old.work_id;
  else
    target_work := new.work_id;
  end if;

  update public.works w
  set word_count = coalesce((select sum(c.word_count) from public.chapters c where c.work_id = target_work and c.status = 'PUBLISHED'), 0),
      chapter_count = (select count(*) from public.chapters c where c.work_id = target_work and c.status = 'PUBLISHED')
  where w.id = target_work;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger chapters_refresh_work
  after insert or update or delete on public.chapters
  for each row execute procedure public.refresh_work_chapter_totals();

create or replace function public.adjust_kudos_counter()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.works set kudos_count = kudos_count + 1 where id = new.work_id;
    return new;
  end if;
  update public.works set kudos_count = greatest(kudos_count - 1, 0) where id = old.work_id;
  return old;
end;
$$;
create trigger kudos_counter after insert or delete on public.kudos
  for each row execute procedure public.adjust_kudos_counter();

create or replace function public.adjust_bookmarks_counter()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.works set bookmarks_count = bookmarks_count + 1 where id = new.work_id;
    return new;
  end if;
  update public.works set bookmarks_count = greatest(bookmarks_count - 1, 0) where id = old.work_id;
  return old;
end;
$$;
create trigger bookmarks_counter after insert or delete on public.bookmarks
  for each row execute procedure public.adjust_bookmarks_counter();

create or replace function public.refresh_comments_counter()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_chapter uuid;
  target_work uuid;
begin
  if tg_op = 'DELETE' then
    target_chapter := old.chapter_id;
  else
    target_chapter := new.chapter_id;
  end if;

  select c.work_id into target_work from public.chapters c where c.id = target_chapter;
  if target_work is not null then
    update public.works w
    set comments_count = (
      select count(*)
      from public.comments cm
      join public.chapters ch on ch.id = cm.chapter_id
      where ch.work_id = target_work and cm.status = 'VISIBLE'
    )
    where w.id = target_work;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger comments_counter after insert or update of status or delete on public.comments
  for each row execute procedure public.refresh_comments_counter();

create or replace function public.adjust_hits_counter()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.works set hits_count = hits_count + 1 where id = new.work_id;
  return new;
end;
$$;
create trigger hits_counter after insert on public.work_hits
  for each row execute procedure public.adjust_hits_counter();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.pseuds enable row level security;
alter table public.works enable row level security;
alter table public.work_authors enable row level security;
alter table public.chapters enable row level security;
alter table public.fandoms enable row level security;
alter table public.tags enable row level security;
alter table public.tag_aliases enable row level security;
alter table public.work_fandoms enable row level security;
alter table public.work_tags enable row level security;
alter table public.kudos enable row level security;
alter table public.bookmarks enable row level security;
alter table public.comments enable row level security;
alter table public.reading_history enable row level security;
alter table public.work_subscriptions enable row level security;
alter table public.work_hits enable row level security;
alter table public.series enable row level security;
alter table public.series_works enable row level security;
alter table public.series_subscriptions enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.collections enable row level security;
alter table public.collection_works enable row level security;
alter table public.notifications enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'ACTIVE' and p.role in ('MODERATOR', 'ADMIN')
  );
$$;

create or replace function public.can_read_work(target_work uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.works w
    where w.id = target_work
      and w.deleted_at is null
      and (
        w.creator_id = auth.uid()
        or (w.status <> 'DRAFT' and w.visibility in ('PUBLIC', 'UNLISTED'))
        or (w.status <> 'DRAFT' and w.visibility = 'REGISTERED' and auth.uid() is not null)
      )
  );
$$;

-- Profiles
create policy profiles_public_read on public.profiles for select
  to anon, authenticated using (status = 'ACTIVE' or id = auth.uid() or public.is_staff());
create policy profiles_self_update on public.profiles for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Preferences
create policy preferences_self_all on public.user_preferences for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pseuds
create policy pseuds_public_read on public.pseuds for select to anon, authenticated using (true);
create policy pseuds_owner_write on public.pseuds for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Works
create policy works_read on public.works for select to anon, authenticated
  using (public.can_read_work(id));
create policy works_owner_insert on public.works for insert to authenticated
  with check (creator_id = auth.uid());
create policy works_owner_update on public.works for update to authenticated
  using (creator_id = auth.uid() or public.is_staff())
  with check (creator_id = auth.uid() or public.is_staff());
create policy works_owner_delete on public.works for delete to authenticated
  using (creator_id = auth.uid() or public.is_staff());

-- Work authors
create policy work_authors_read on public.work_authors for select to anon, authenticated
  using (public.can_read_work(work_id));
create policy work_authors_owner_write on public.work_authors for all to authenticated
  using (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()))
  with check (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()));

-- Chapters
create policy chapters_read on public.chapters for select to anon, authenticated
  using ((status = 'PUBLISHED' and public.can_read_work(work_id)) or exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()));
create policy chapters_owner_write on public.chapters for all to authenticated
  using (exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_staff())))
  with check (exists (select 1 from public.works w where w.id = work_id and (w.creator_id = auth.uid() or public.is_staff())));

-- Taxonomy
create policy fandoms_read on public.fandoms for select to anon, authenticated using (true);
create policy tags_read on public.tags for select to anon, authenticated using (true);
create policy tag_aliases_read on public.tag_aliases for select to anon, authenticated using (true);
create policy taxonomy_staff_fandoms on public.fandoms for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy taxonomy_staff_tags on public.tags for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy taxonomy_staff_aliases on public.tag_aliases for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy work_fandoms_read on public.work_fandoms for select to anon, authenticated using (public.can_read_work(work_id));
create policy work_fandoms_owner_write on public.work_fandoms for all to authenticated
  using (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()))
  with check (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()));
create policy work_tags_read on public.work_tags for select to anon, authenticated using (public.can_read_work(work_id));
create policy work_tags_owner_write on public.work_tags for all to authenticated
  using (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()))
  with check (exists (select 1 from public.works w where w.id = work_id and w.creator_id = auth.uid()));

-- Interactions
create policy kudos_read on public.kudos for select to anon, authenticated using (public.can_read_work(work_id));
create policy kudos_self_insert on public.kudos for insert to authenticated with check (user_id = auth.uid() and public.can_read_work(work_id));
create policy kudos_self_delete on public.kudos for delete to authenticated using (user_id = auth.uid());

create policy bookmarks_read on public.bookmarks for select to anon, authenticated
  using (user_id = auth.uid() or (private = false and public.can_read_work(work_id)));
create policy bookmarks_self_insert on public.bookmarks for insert to authenticated with check (user_id = auth.uid() and public.can_read_work(work_id));
create policy bookmarks_self_update on public.bookmarks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy bookmarks_self_delete on public.bookmarks for delete to authenticated using (user_id = auth.uid());

create policy comments_read on public.comments for select to anon, authenticated
  using (status = 'VISIBLE' and exists (select 1 from public.chapters c where c.id = chapter_id and public.can_read_work(c.work_id)));
create policy comments_self_insert on public.comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.chapters c
      join public.works w on w.id = c.work_id
      where c.id = chapter_id and w.allow_comments and public.can_read_work(w.id)
    )
  );
create policy comments_self_update on public.comments for update to authenticated
  using (user_id = auth.uid() or public.is_staff()) with check (user_id = auth.uid() or public.is_staff());
create policy comments_self_delete on public.comments for delete to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy history_self_all on public.reading_history for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy work_subscriptions_self_all on public.work_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Hits are server-only through the Vercel Route Handler using the Supabase secret key.

-- Series and collections
create policy series_read on public.series for select to anon, authenticated
  using (visibility in ('PUBLIC', 'UNLISTED') or owner_id = auth.uid());
create policy series_owner_write on public.series for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy series_works_read on public.series_works for select to anon, authenticated
  using (exists (select 1 from public.series s where s.id = series_id and (s.visibility in ('PUBLIC','UNLISTED') or s.owner_id = auth.uid())));
create policy series_works_owner_write on public.series_works for all to authenticated
  using (exists (select 1 from public.series s where s.id = series_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.series s where s.id = series_id and s.owner_id = auth.uid()));
create policy series_subscriptions_self_all on public.series_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_subscriptions_self_all on public.user_subscriptions for all to authenticated
  using (subscriber_id = auth.uid()) with check (subscriber_id = auth.uid());

create policy collections_read on public.collections for select to anon, authenticated
  using (visibility in ('PUBLIC', 'UNLISTED') or owner_id = auth.uid());
create policy collections_owner_write on public.collections for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy collection_works_read on public.collection_works for select to anon, authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and (c.visibility in ('PUBLIC','UNLISTED') or c.owner_id = auth.uid())));
create policy collection_works_owner_write on public.collection_works for all to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));

-- Private account modules
create policy notifications_self_all on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy blocks_self_all on public.user_blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_read on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_staff());
create policy reports_staff_update on public.reports for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy audit_staff_read on public.audit_log for select to authenticated using (public.is_staff());

-- -----------------------------------------------------------------------------
-- Safe public read model
-- -----------------------------------------------------------------------------

create or replace view public.public_work_cards
with (security_invoker = true)
as
select
  w.id,
  w.creator_id,
  w.title,
  w.summary,
  w.rating,
  w.status,
  w.visibility,
  w.language,
  w.expected_chapters,
  w.word_count,
  w.chapter_count,
  w.kudos_count,
  w.bookmarks_count,
  w.comments_count,
  w.hits_count,
  w.allow_comments,
  w.published_at,
  w.updated_at,
  w.created_at,
  p.username::text as author_username,
  coalesce(p.display_name, p.username::text) as author_display_name,
  coalesce(array(
    select f.name::text
    from public.work_fandoms wf
    join public.fandoms f on f.id = wf.fandom_id
    where wf.work_id = w.id
    order by f.name::text
  ), array[]::text[]) as fandoms,
  coalesce(array(
    select t.name::text
    from public.work_tags wt
    join public.tags t on t.id = wt.tag_id
    where wt.work_id = w.id
    order by t.type, t.name::text
  ), array[]::text[]) as tags
from public.works w
join public.profiles p on p.id = w.creator_id
where w.deleted_at is null;

-- -----------------------------------------------------------------------------
-- RPCs used by the web app
-- -----------------------------------------------------------------------------

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    candidate ~ '^[A-Za-z0-9_]{3,40}$'
    and not exists (select 1 from public.profiles p where p.username = candidate);
$$;

create or replace function public.platform_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'works', (select count(*) from public.works w where w.deleted_at is null and w.visibility = 'PUBLIC' and w.status <> 'DRAFT'),
    'fandoms', (select count(distinct wf.fandom_id) from public.work_fandoms wf join public.works w on w.id = wf.work_id where w.deleted_at is null and w.visibility = 'PUBLIC' and w.status <> 'DRAFT'),
    'users', (select count(*) from public.profiles p where p.status = 'ACTIVE'),
    'words', (select coalesce(sum(w.word_count), 0) from public.works w where w.deleted_at is null and w.visibility = 'PUBLIC' and w.status <> 'DRAFT')
  );
$$;

create or replace function public.active_fandoms(limit_count integer default 8)
returns table (
  id uuid,
  name text,
  slug text,
  work_count bigint,
  total_words bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    f.id,
    f.name::text,
    f.slug,
    count(distinct w.id) as work_count,
    coalesce(sum(w.word_count), 0)::bigint as total_words
  from public.fandoms f
  join public.work_fandoms wf on wf.fandom_id = f.id
  join public.works w on w.id = wf.work_id
  where w.deleted_at is null and w.visibility = 'PUBLIC' and w.status <> 'DRAFT'
  group by f.id, f.name, f.slug
  order by work_count desc, total_words desc, f.name::text asc
  limit greatest(1, least(coalesce(limit_count, 8), 30));
$$;

create or replace function public.search_works(
  search_text text default null,
  fandom_filter text default null,
  rating_filter text default null,
  status_filter text default null,
  min_words bigint default 0,
  include_tag text default null,
  exclude_tag text default null,
  hide_explicit boolean default false,
  sort_mode text default 'recent',
  page_size integer default 24,
  page_offset integer default 0
)
returns table (
  id uuid,
  creator_id uuid,
  title text,
  summary text,
  rating text,
  status text,
  visibility text,
  language text,
  expected_chapters integer,
  word_count bigint,
  chapter_count integer,
  kudos_count bigint,
  bookmarks_count bigint,
  comments_count bigint,
  hits_count bigint,
  allow_comments boolean,
  published_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz,
  author_username text,
  author_display_name text,
  fandoms text[],
  tags text[],
  kudosed boolean,
  bookmarked boolean,
  total_count bigint
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    wc.id,
    wc.creator_id,
    wc.title::text,
    wc.summary::text,
    wc.rating::text,
    wc.status::text,
    wc.visibility::text,
    wc.language::text,
    wc.expected_chapters,
    wc.word_count,
    wc.chapter_count,
    wc.kudos_count,
    wc.bookmarks_count,
    wc.comments_count,
    wc.hits_count,
    wc.allow_comments,
    wc.published_at,
    wc.updated_at,
    wc.created_at,
    wc.author_username,
    wc.author_display_name,
    wc.fandoms,
    wc.tags,
    exists (select 1 from public.kudos k where k.work_id = wc.id and k.user_id = auth.uid()) as kudosed,
    exists (select 1 from public.bookmarks b where b.work_id = wc.id and b.user_id = auth.uid()) as bookmarked,
    count(*) over() as total_count
  from public.public_work_cards wc
  where wc.visibility = 'PUBLIC'
    and wc.status <> 'DRAFT'
    and (coalesce(hide_explicit, false) = false or wc.rating <> 'EXPLICIT')
    and wc.word_count >= greatest(coalesce(min_words, 0), 0)
    and (nullif(btrim(rating_filter), '') is null or wc.rating = upper(btrim(rating_filter)))
    and (nullif(btrim(status_filter), '') is null or wc.status = upper(btrim(status_filter)))
    and (
      nullif(btrim(fandom_filter), '') is null
      or exists (
        select 1
        from public.work_fandoms wf
        join public.fandoms f on f.id = wf.fandom_id
        where wf.work_id = wc.id and (f.slug = fandom_filter or f.name = fandom_filter)
      )
    )
    and (
      nullif(btrim(include_tag), '') is null
      or exists (
        select 1 from public.work_tags wt
        join public.tags t on t.id = wt.tag_id
        where wt.work_id = wc.id and t.name::text ilike '%' || btrim(include_tag) || '%'
      )
    )
    and (
      nullif(btrim(exclude_tag), '') is null
      or not exists (
        select 1 from public.work_tags wt
        join public.tags t on t.id = wt.tag_id
        where wt.work_id = wc.id and t.name::text ilike '%' || btrim(exclude_tag) || '%'
      )
    )
    and (
      nullif(btrim(search_text), '') is null
      or wc.title ilike '%' || btrim(search_text) || '%'
      or wc.summary ilike '%' || btrim(search_text) || '%'
      or wc.author_username ilike '%' || btrim(search_text) || '%'
      or wc.author_display_name ilike '%' || btrim(search_text) || '%'
      or exists (select 1 from unnest(wc.fandoms) x where x ilike '%' || btrim(search_text) || '%')
      or exists (select 1 from unnest(wc.tags) x where x ilike '%' || btrim(search_text) || '%')
    )
  order by
    case when lower(coalesce(sort_mode, 'recent')) = 'long' then wc.word_count end desc nulls last,
    case when lower(coalesce(sort_mode, 'recent')) = 'hot' then (wc.kudos_count * 5 + wc.bookmarks_count * 3 + wc.comments_count * 2 + least(wc.hits_count, 100000) / 20) end desc nulls last,
    wc.published_at desc nulls last,
    wc.updated_at desc
  limit greatest(1, least(coalesce(page_size, 24), 100))
  offset greatest(coalesce(page_offset, 0), 0);
$$;

create or replace function public.get_work_detail(target_work uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  work_json jsonb;
  chapters_json jsonb;
begin
  select to_jsonb(wc) || jsonb_build_object(
    'kudosed', exists(select 1 from public.kudos k where k.work_id = wc.id and k.user_id = auth.uid()),
    'bookmarked', exists(select 1 from public.bookmarks b where b.work_id = wc.id and b.user_id = auth.uid())
  )
  into work_json
  from public.public_work_cards wc
  where wc.id = target_work;

  if work_json is null then
    raise exception 'WORK_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.chapter_number), '[]'::jsonb)
  into chapters_json
  from public.chapters c
  where c.work_id = target_work
    and (c.status = 'PUBLISHED' or exists (select 1 from public.works w where w.id = target_work and w.creator_id = auth.uid()));

  return jsonb_build_object('work', work_json, 'chapters', chapters_json);
end;
$$;

create or replace function public.publish_work(
  work_title text,
  work_summary text,
  work_rating text,
  work_status text,
  fandom_names text[],
  tag_names text[],
  chapter_title text,
  chapter_content text,
  expected_chapter_count integer default null,
  work_language text default 'pt-BR',
  allow_comments_input boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  pid uuid;
  fid uuid;
  tid uuid;
  label text;
  clean_label text;
  normalized_rating text := upper(coalesce(work_rating, 'GENERAL'));
  normalized_status text := upper(coalesce(work_status, 'ONGOING'));
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.status = 'ACTIVE') then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(work_title, ''))) not between 1 and 300 then raise exception 'INVALID_TITLE'; end if;
  if char_length(coalesce(work_summary, '')) > 20000 then raise exception 'SUMMARY_TOO_LONG'; end if;
  if normalized_rating not in ('GENERAL','TEEN','MATURE','EXPLICIT','NOT_RATED') then raise exception 'INVALID_RATING'; end if;
  if normalized_status not in ('ONGOING','COMPLETE','HIATUS','DRAFT') then raise exception 'INVALID_STATUS'; end if;
  if btrim(coalesce(chapter_content, '')) = '' then raise exception 'EMPTY_CHAPTER'; end if;
  if expected_chapter_count is not null and expected_chapter_count <= 0 then raise exception 'INVALID_EXPECTED_CHAPTERS'; end if;
  if coalesce(cardinality(fandom_names), 0) = 0 then raise exception 'FANDOM_REQUIRED'; end if;

  insert into public.works(
    creator_id, title, summary, rating, status, visibility, language, expected_chapters, published_at, allow_comments
  ) values (
    uid, btrim(work_title), coalesce(work_summary, ''), normalized_rating, normalized_status,
    case when normalized_status = 'DRAFT' then 'PRIVATE' else 'PUBLIC' end,
    coalesce(nullif(btrim(work_language), ''), 'pt-BR'), expected_chapter_count,
    case when normalized_status = 'DRAFT' then null else now() end,
    coalesce(allow_comments_input, true)
  ) returning id into wid;

  select p.id into pid from public.pseuds p where p.user_id = uid and p.is_default limit 1;
  if pid is null then
    insert into public.pseuds(user_id, name, is_default)
    select uid, pr.username, true from public.profiles pr where pr.id = uid
    returning id into pid;
  end if;
  insert into public.work_authors(work_id, pseud_id, author_order) values (wid, pid, 0);

  foreach label in array fandom_names loop
    clean_label := left(btrim(coalesce(label, '')), 220);
    if clean_label <> '' then
      insert into public.fandoms(name, slug, created_by)
      values (
        clean_label,
        left(public.slugify(clean_label), 220) || '-' || substr(md5(lower(clean_label)), 1, 8),
        uid
      )
      on conflict (name) do update set name = excluded.name
      returning id into fid;
      insert into public.work_fandoms(work_id, fandom_id) values (wid, fid) on conflict do nothing;
    end if;
  end loop;

  if tag_names is not null then
    foreach label in array tag_names loop
      clean_label := left(btrim(coalesce(label, '')), 220);
      if clean_label <> '' then
        insert into public.tags(name, slug, type, created_by)
        values (
          clean_label,
          left(public.slugify(clean_label), 220) || '-' || substr(md5(lower(clean_label) || ':freeform'), 1, 8),
          'FREEFORM', uid
        )
        on conflict (name, type) do update set name = excluded.name
        returning id into tid;
        insert into public.work_tags(work_id, tag_id) values (wid, tid) on conflict do nothing;
      end if;
    end loop;
  end if;

  insert into public.chapters(work_id, chapter_number, title, content, status, published_at)
  values (
    wid, 1, nullif(btrim(coalesce(chapter_title, '')), ''), chapter_content,
    case when normalized_status = 'DRAFT' then 'DRAFT' else 'PUBLISHED' end,
    case when normalized_status = 'DRAFT' then null else now() end
  );

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id)
  values (uid, 'WORK_CREATED', 'WORK', wid);

  return wid;
end;
$$;

create or replace function public.add_chapter(
  target_work uuid,
  chapter_title text,
  chapter_content text,
  publish_now boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  next_number integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.works w where w.id = target_work and w.creator_id = uid and w.deleted_at is null) then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;
  if btrim(coalesce(chapter_content, '')) = '' then raise exception 'EMPTY_CHAPTER'; end if;

  select coalesce(max(c.chapter_number), 0) + 1 into next_number from public.chapters c where c.work_id = target_work;
  insert into public.chapters(work_id, chapter_number, title, content, status, published_at)
  values (
    target_work, next_number, nullif(btrim(coalesce(chapter_title, '')), ''), chapter_content,
    case when publish_now then 'PUBLISHED' else 'DRAFT' end,
    case when publish_now then now() else null end
  ) returning id into cid;

  if publish_now then
    update public.works set published_at = coalesce(published_at, now()) where id = target_work;
  end if;

  return cid;
end;
$$;

create or replace function public.toggle_kudos(target_work uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not public.can_read_work(target_work) then raise exception 'WORK_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (select 1 from public.kudos where work_id = target_work and user_id = uid) then
    delete from public.kudos where work_id = target_work and user_id = uid;
    return false;
  end if;
  insert into public.kudos(work_id, user_id) values (target_work, uid);
  return true;
end;
$$;

create or replace function public.toggle_bookmark(target_work uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not public.can_read_work(target_work) then raise exception 'WORK_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (select 1 from public.bookmarks where work_id = target_work and user_id = uid) then
    delete from public.bookmarks where work_id = target_work and user_id = uid;
    return false;
  end if;
  insert into public.bookmarks(user_id, work_id) values (uid, target_work);
  return true;
end;
$$;

create or replace function public.record_history(target_work uuid, target_chapter uuid default null)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  if not public.can_read_work(target_work) then return; end if;
  if target_chapter is not null and not exists (select 1 from public.chapters c where c.id = target_chapter and c.work_id = target_work) then return; end if;

  insert into public.reading_history(user_id, work_id, chapter_id, last_read_at)
  values (uid, target_work, target_chapter, now())
  on conflict (user_id, work_id)
  do update set chapter_id = excluded.chapter_id, last_read_at = excluded.last_read_at;
end;
$$;

create or replace function public.my_bookmarks(limit_count integer default 100)
returns setof public.public_work_cards
language sql
stable
set search_path = public, pg_temp
as $$
  select wc.*
  from public.bookmarks b
  join public.public_work_cards wc on wc.id = b.work_id
  where b.user_id = auth.uid()
  order by b.created_at desc
  limit greatest(1, least(coalesce(limit_count, 100), 200));
$$;

create or replace function public.my_history(limit_count integer default 100)
returns setof public.public_work_cards
language sql
stable
set search_path = public, pg_temp
as $$
  select wc.*
  from public.reading_history h
  join public.public_work_cards wc on wc.id = h.work_id
  where h.user_id = auth.uid()
  order by h.last_read_at desc
  limit greatest(1, least(coalesce(limit_count, 100), 200));
$$;

create or replace function public.random_public_work()
returns uuid
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select w.id
  from public.works w
  where w.deleted_at is null and w.visibility = 'PUBLIC' and w.status <> 'DRAFT'
  order by random()
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Grants: permissions first, RLS policies second. Secret keys use service_role.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public;

-- Public/authenticated readable objects
grant select on public.profiles, public.pseuds, public.works, public.work_authors, public.chapters,
  public.fandoms, public.tags, public.tag_aliases, public.work_fandoms, public.work_tags,
  public.kudos, public.bookmarks, public.comments, public.series, public.series_works,
  public.collections, public.collection_works, public.public_work_cards to anon, authenticated;

-- Authenticated mutation paths protected by RLS
grant insert, update, delete on public.profiles, public.user_preferences, public.pseuds, public.works,
  public.work_authors, public.chapters, public.work_fandoms, public.work_tags, public.kudos,
  public.bookmarks, public.comments, public.reading_history, public.work_subscriptions,
  public.series, public.series_works, public.series_subscriptions, public.user_subscriptions,
  public.collections, public.collection_works, public.notifications, public.user_blocks, public.reports to authenticated;
grant select on public.user_preferences, public.reading_history, public.work_subscriptions,
  public.series_subscriptions, public.user_subscriptions, public.notifications, public.user_blocks,
  public.reports, public.audit_log to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- RPC grants
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.can_read_work(uuid) to anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.platform_stats() to anon, authenticated;
grant execute on function public.active_fandoms(integer) to anon, authenticated;
grant execute on function public.search_works(text,text,text,text,bigint,text,text,boolean,text,integer,integer) to anon, authenticated;
grant execute on function public.get_work_detail(uuid) to anon, authenticated;
grant execute on function public.random_public_work() to anon, authenticated;
grant execute on function public.publish_work(text,text,text,text,text[],text[],text,text,integer,text,boolean) to authenticated;
grant execute on function public.add_chapter(uuid,text,text,boolean) to authenticated;
grant execute on function public.toggle_kudos(uuid) to authenticated;
grant execute on function public.toggle_bookmark(uuid) to authenticated;
grant execute on function public.record_history(uuid,uuid) to authenticated;
grant execute on function public.my_bookmarks(integer) to authenticated;
grant execute on function public.my_history(integer) to authenticated;

-- The secret-key role is used only by server-side code such as /api/works/:id/hit.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- -----------------------------------------------------------------------------
-- Supabase Storage buckets for future avatars and work covers.
-- No files are seeded.
-- -----------------------------------------------------------------------------

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('work-covers', 'work-covers', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "Archive images are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id in ('avatars', 'work-covers'));

create policy "Users upload their own archive images"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('avatars', 'work-covers')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users update their own archive images"
on storage.objects for update
to authenticated
using (bucket_id in ('avatars', 'work-covers') and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id in ('avatars', 'work-covers') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete their own archive images"
on storage.objects for delete
to authenticated
using (bucket_id in ('avatars', 'work-covers') and (storage.foldername(name))[1] = auth.uid()::text);
