-- ArchiveNova v3 FINAL — cloud drafts, autosave, conflict protection and multi-chapter draft publishing

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title varchar(300) not null default '',
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.draft_chapters (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  title varchar(300),
  content_html text not null default '<p></p>',
  content_json jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  word_count integer not null default 0 check (word_count >= 0),
  position integer not null check (position > 0),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, position)
);

create index if not exists drafts_user_updated_idx on public.drafts(user_id, updated_at desc);
create index if not exists draft_chapters_draft_position_idx on public.draft_chapters(draft_id, position);

alter table public.drafts enable row level security;
alter table public.draft_chapters enable row level security;

drop policy if exists drafts_owner_select on public.drafts;
create policy drafts_owner_select on public.drafts for select to authenticated using (auth.uid() = user_id);
drop policy if exists drafts_owner_insert on public.drafts;
create policy drafts_owner_insert on public.drafts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists drafts_owner_update on public.drafts;
create policy drafts_owner_update on public.drafts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists drafts_owner_delete on public.drafts;
create policy drafts_owner_delete on public.drafts for delete to authenticated using (auth.uid() = user_id);

drop policy if exists draft_chapters_owner_select on public.draft_chapters;
create policy draft_chapters_owner_select on public.draft_chapters for select to authenticated using (
  exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid())
);
drop policy if exists draft_chapters_owner_insert on public.draft_chapters;
create policy draft_chapters_owner_insert on public.draft_chapters for insert to authenticated with check (
  exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid())
);
drop policy if exists draft_chapters_owner_update on public.draft_chapters;
create policy draft_chapters_owner_update on public.draft_chapters for update to authenticated using (
  exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid())
) with check (
  exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid())
);
drop policy if exists draft_chapters_owner_delete on public.draft_chapters;
create policy draft_chapters_owner_delete on public.draft_chapters for delete to authenticated using (
  exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid())
);

create or replace function public.create_writer_draft(
  initial_title text default '',
  initial_chapter_title text default '',
  initial_content_html text default '<p></p>',
  initial_content_json jsonb default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  initial_word_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  did uuid;
  cid uuid;
  created_at_value timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = uid and status = 'ACTIVE') then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  insert into public.drafts(user_id, title)
  values (uid, left(coalesce(initial_title, ''), 300))
  returning id, created_at into did, created_at_value;

  insert into public.draft_chapters(draft_id, title, content_html, content_json, word_count, position)
  values (
    did,
    nullif(left(btrim(coalesce(initial_chapter_title, '')), 300), ''),
    coalesce(nullif(initial_content_html, ''), '<p></p>'),
    coalesce(initial_content_json, '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb),
    greatest(0, coalesce(initial_word_count, 0)),
    1
  ) returning id into cid;

  return jsonb_build_object(
    'id', did,
    'title', left(coalesce(initial_title, ''), 300),
    'revision', 1,
    'created_at', created_at_value,
    'updated_at', created_at_value,
    'chapter_id', cid,
    'chapter_revision', 1
  );
end;
$$;

create or replace function public.get_writer_draft(target_draft uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'revision', d.revision,
    'created_at', d.created_at,
    'updated_at', d.updated_at,
    'chapters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'title', coalesce(c.title, ''),
        'content_html', c.content_html,
        'content_json', c.content_json,
        'word_count', c.word_count,
        'position', c.position,
        'revision', c.revision,
        'updated_at', c.updated_at
      ) order by c.position)
      from public.draft_chapters c where c.draft_id = d.id
    ), '[]'::jsonb)
  ) into result
  from public.drafts d
  where d.id = target_draft and d.user_id = uid;

  if result is null then raise exception 'DRAFT_NOT_FOUND' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.my_writer_drafts()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id,
      'title', d.title,
      'revision', d.revision,
      'created_at', d.created_at,
      'updated_at', d.updated_at,
      'chapter_count', (select count(*) from public.draft_chapters c where c.draft_id = d.id),
      'word_count', (select coalesce(sum(c.word_count),0) from public.draft_chapters c where c.draft_id = d.id),
      'first_chapter_title', (select coalesce(c.title,'') from public.draft_chapters c where c.draft_id = d.id order by c.position limit 1)
    ) order by d.updated_at desc)
    from public.drafts d where d.user_id = uid
  ), '[]'::jsonb);
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
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  d public.drafts%rowtype;
  c public.draft_chapters%rowtype;
  now_value timestamptz := now();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select * into d from public.drafts where id = target_draft and user_id = uid for update;
  if not found then raise exception 'DRAFT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into c from public.draft_chapters where id = target_chapter and draft_id = target_draft for update;
  if not found then raise exception 'CHAPTER_NOT_FOUND' using errcode = 'P0002'; end if;

  if d.revision <> expected_draft_revision or c.revision <> expected_chapter_revision then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'draft_revision', d.revision,
      'chapter_revision', c.revision,
      'updated_at', greatest(d.updated_at, c.updated_at),
      'remote', jsonb_build_object(
        'title', d.title,
        'chapter_title', coalesce(c.title,''),
        'content_html', c.content_html,
        'content_json', c.content_json,
        'word_count', c.word_count
      )
    );
  end if;

  update public.drafts
  set title = left(coalesce(next_title,''), 300), revision = revision + 1, updated_at = now_value
  where id = target_draft;

  update public.draft_chapters
  set title = nullif(left(btrim(coalesce(next_chapter_title,'')),300),''),
      content_html = coalesce(nullif(next_content_html,''), '<p></p>'),
      content_json = coalesce(next_content_json, content_json),
      word_count = greatest(0,coalesce(next_word_count,0)),
      revision = revision + 1,
      updated_at = now_value
  where id = target_chapter;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'draft_revision', d.revision + 1,
    'chapter_revision', c.revision + 1,
    'updated_at', now_value
  );
end;
$$;

create or replace function public.add_writer_draft_chapter(target_draft uuid, next_title text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  next_position integer;
  now_value timestamptz := now();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.drafts where id = target_draft and user_id = uid) then raise exception 'DRAFT_NOT_FOUND' using errcode = 'P0002'; end if;
  select coalesce(max(position),0)+1 into next_position from public.draft_chapters where draft_id = target_draft;
  insert into public.draft_chapters(draft_id,title,position)
  values (target_draft,nullif(left(btrim(coalesce(next_title,'')),300),''),next_position)
  returning id into cid;
  update public.drafts set revision=revision+1, updated_at=now_value where id=target_draft;
  return jsonb_build_object('id',cid,'title',coalesce(next_title,''),'position',next_position,'revision',1,'updated_at',now_value);
end;
$$;

create or replace function public.delete_writer_draft_chapter(target_chapter uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  did uuid;
  chapter_total integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select c.draft_id into did from public.draft_chapters c join public.drafts d on d.id=c.draft_id where c.id=target_chapter and d.user_id=uid;
  if did is null then raise exception 'CHAPTER_NOT_FOUND' using errcode='P0002'; end if;
  select count(*) into chapter_total from public.draft_chapters where draft_id=did;
  if chapter_total <= 1 then raise exception 'LAST_CHAPTER'; end if;
  delete from public.draft_chapters where id=target_chapter;
  with ordered as (select id,row_number() over(order by position,created_at)::integer as new_position from public.draft_chapters where draft_id=did)
  update public.draft_chapters c set position=o.new_position from ordered o where c.id=o.id;
  update public.drafts set revision=revision+1,updated_at=now() where id=did;
end;
$$;

create or replace function public.rename_writer_draft(target_draft uuid, next_title text)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  update public.drafts set title=left(coalesce(next_title,''),300),revision=revision+1,updated_at=now()
  where id=target_draft and user_id=auth.uid();
  if not found then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

create or replace function public.duplicate_writer_draft(target_draft uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  source_draft public.drafts%rowtype;
  new_id uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into source_draft from public.drafts where id=target_draft and user_id=uid;
  if not found then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.drafts(user_id,title) values(uid,left(source_draft.title || ' — cópia',300)) returning id into new_id;
  insert into public.draft_chapters(draft_id,title,content_html,content_json,word_count,position)
  select new_id,title,content_html,content_json,word_count,position from public.draft_chapters where draft_id=target_draft order by position;
  return new_id;
end;
$$;

create or replace function public.delete_writer_draft(target_draft uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  delete from public.drafts where id=target_draft and user_id=auth.uid();
  if not found then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

create or replace function public.publish_writer_draft(
  target_draft uuid,
  work_title text,
  work_summary text,
  work_rating text,
  work_status text,
  fandom_names text[],
  tag_names text[],
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
  first_chapter public.draft_chapters%rowtype;
  chapter_row public.draft_chapters%rowtype;
  wid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.drafts where id=target_draft and user_id=uid) then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002'; end if;
  select * into first_chapter from public.draft_chapters where draft_id=target_draft order by position limit 1;
  if first_chapter.id is null or public.count_words(regexp_replace(first_chapter.content_html,'<[^>]+>',' ','g')) = 0 then raise exception 'EMPTY_CHAPTER'; end if;

  wid := public.publish_work(
    work_title, work_summary, work_rating, work_status, fandom_names, tag_names,
    first_chapter.title, first_chapter.content_html, expected_chapter_count, work_language, allow_comments_input
  );

  for chapter_row in select * from public.draft_chapters where draft_id=target_draft and id<>first_chapter.id order by position loop
    if public.count_words(regexp_replace(chapter_row.content_html,'<[^>]+>',' ','g')) > 0 then
      perform public.add_chapter(wid, chapter_row.title, chapter_row.content_html, upper(coalesce(work_status,'ONGOING')) <> 'DRAFT');
    end if;
  end loop;

  delete from public.drafts where id=target_draft and user_id=uid;
  return wid;
end;
$$;

revoke execute on function public.create_writer_draft(text,text,text,jsonb,integer) from public;
revoke execute on function public.get_writer_draft(uuid) from public;
revoke execute on function public.my_writer_drafts() from public;
revoke execute on function public.save_writer_draft(uuid,uuid,text,text,text,jsonb,integer,bigint,bigint) from public;
revoke execute on function public.add_writer_draft_chapter(uuid,text) from public;
revoke execute on function public.delete_writer_draft_chapter(uuid) from public;
revoke execute on function public.rename_writer_draft(uuid,text) from public;
revoke execute on function public.duplicate_writer_draft(uuid) from public;
revoke execute on function public.delete_writer_draft(uuid) from public;
revoke execute on function public.publish_writer_draft(uuid,text,text,text,text,text[],text[],integer,text,boolean) from public;

grant execute on function public.create_writer_draft(text,text,text,jsonb,integer) to authenticated;
grant execute on function public.get_writer_draft(uuid) to authenticated;
grant execute on function public.my_writer_drafts() to authenticated;
grant execute on function public.save_writer_draft(uuid,uuid,text,text,text,jsonb,integer,bigint,bigint) to authenticated;
grant execute on function public.add_writer_draft_chapter(uuid,text) to authenticated;
grant execute on function public.delete_writer_draft_chapter(uuid) to authenticated;
grant execute on function public.rename_writer_draft(uuid,text) to authenticated;
grant execute on function public.duplicate_writer_draft(uuid) to authenticated;
grant execute on function public.delete_writer_draft(uuid) to authenticated;
grant execute on function public.publish_writer_draft(uuid,text,text,text,text,text[],text[],integer,text,boolean) to authenticated;
