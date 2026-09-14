-- Archive Nova v3 / Fase 3
-- Publicação em etapas + gerenciamento de obras e capítulos.
-- Execute depois de 202609100001_initial_schema.sql.

create or replace function public.update_work(
  target_work uuid,
  work_title text,
  work_summary text,
  work_rating text,
  work_status text,
  work_visibility text,
  fandom_names text[],
  tag_names text[],
  expected_chapter_count integer default null,
  work_language text default 'pt-BR',
  allow_comments_input boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  fid uuid;
  tid uuid;
  label text;
  clean_label text;
  normalized_rating text := upper(coalesce(work_rating, 'GENERAL'));
  normalized_status text := upper(coalesce(work_status, 'ONGOING'));
  normalized_visibility text := upper(coalesce(work_visibility, 'PUBLIC'));
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.works w where w.id = target_work and w.creator_id = uid and w.deleted_at is null) then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(work_title, ''))) not between 1 and 300 then raise exception 'INVALID_TITLE'; end if;
  if char_length(coalesce(work_summary, '')) > 20000 then raise exception 'SUMMARY_TOO_LONG'; end if;
  if normalized_rating not in ('GENERAL','TEEN','MATURE','EXPLICIT','NOT_RATED') then raise exception 'INVALID_RATING'; end if;
  if normalized_status not in ('ONGOING','COMPLETE','HIATUS','DRAFT') then raise exception 'INVALID_STATUS'; end if;
  if normalized_visibility not in ('PUBLIC','REGISTERED','UNLISTED','PRIVATE') then raise exception 'INVALID_VISIBILITY'; end if;
  if expected_chapter_count is not null and expected_chapter_count <= 0 then raise exception 'INVALID_EXPECTED_CHAPTERS'; end if;
  if coalesce(cardinality(fandom_names), 0) = 0 then raise exception 'FANDOM_REQUIRED'; end if;

  update public.works
  set title = btrim(work_title),
      summary = coalesce(work_summary, ''),
      rating = normalized_rating,
      status = normalized_status,
      visibility = case when normalized_status = 'DRAFT' then 'PRIVATE' else normalized_visibility end,
      language = coalesce(nullif(btrim(work_language), ''), 'pt-BR'),
      expected_chapters = expected_chapter_count,
      allow_comments = coalesce(allow_comments_input, true),
      published_at = case
        when normalized_status = 'DRAFT' then published_at
        else coalesce(published_at, now())
      end
  where id = target_work;

  delete from public.work_fandoms where work_id = target_work;
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
      insert into public.work_fandoms(work_id, fandom_id) values (target_work, fid) on conflict do nothing;
    end if;
  end loop;

  delete from public.work_tags where work_id = target_work;
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
        insert into public.work_tags(work_id, tag_id) values (target_work, tid) on conflict do nothing;
      end if;
    end loop;
  end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (uid, 'WORK_UPDATED', 'WORK', target_work, jsonb_build_object('status', normalized_status, 'visibility', normalized_visibility));
end;
$$;

create or replace function public.update_chapter(
  target_chapter uuid,
  chapter_title text,
  chapter_content text,
  chapter_status text default 'PUBLISHED',
  notes_before_input text default null,
  notes_after_input text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  normalized_status text := upper(coalesce(chapter_status, 'PUBLISHED'));
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select c.work_id into wid
  from public.chapters c
  join public.works w on w.id = c.work_id
  where c.id = target_chapter and w.creator_id = uid and w.deleted_at is null;

  if wid is null then raise exception 'NOT_OWNER' using errcode = '42501'; end if;
  if normalized_status not in ('DRAFT','PUBLISHED') then raise exception 'INVALID_CHAPTER_STATUS'; end if;
  if btrim(coalesce(chapter_content, '')) = '' then raise exception 'EMPTY_CHAPTER'; end if;
  if char_length(coalesce(chapter_title, '')) > 300 then raise exception 'CHAPTER_TITLE_TOO_LONG'; end if;

  update public.chapters
  set title = nullif(btrim(coalesce(chapter_title, '')), ''),
      content = chapter_content,
      status = normalized_status,
      notes_before = nullif(btrim(coalesce(notes_before_input, '')), ''),
      notes_after = nullif(btrim(coalesce(notes_after_input, '')), ''),
      published_at = case
        when normalized_status = 'PUBLISHED' then coalesce(published_at, now())
        else null
      end
  where id = target_chapter;

  if normalized_status = 'PUBLISHED' then
    update public.works set published_at = coalesce(published_at, now()) where id = wid;
  end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (uid, 'CHAPTER_UPDATED', 'CHAPTER', target_chapter, jsonb_build_object('work_id', wid, 'status', normalized_status));
end;
$$;

create or replace function public.delete_chapter(target_chapter uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select c.work_id into wid
  from public.chapters c
  join public.works w on w.id = c.work_id
  where c.id = target_chapter and w.creator_id = uid and w.deleted_at is null;

  if wid is null then raise exception 'NOT_OWNER' using errcode = '42501'; end if;

  delete from public.chapters where id = target_chapter;

  -- Mantém a numeração contínua após uma exclusão.
  update public.chapters
  set chapter_number = chapter_number + 1000000
  where work_id = wid;

  with ordered as (
    select id, row_number() over (order by chapter_number, created_at, id)::integer as next_number
    from public.chapters where work_id = wid
  )
  update public.chapters c
  set chapter_number = o.next_number
  from ordered o
  where c.id = o.id;

  -- O cascade de comentários pode ocorrer depois de o capítulo já não estar disponível
  -- para o trigger de comentários. Recalcula o total explicitamente.
  update public.works w
  set comments_count = (
    select count(*)
    from public.comments cm
    join public.chapters ch on ch.id = cm.chapter_id
    where ch.work_id = wid and cm.status = 'VISIBLE'
  )
  where w.id = wid;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (uid, 'CHAPTER_DELETED', 'CHAPTER', target_chapter, jsonb_build_object('work_id', wid));
end;
$$;

create or replace function public.reorder_chapters(target_work uuid, ordered_chapter_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  expected_count integer;
  supplied_count integer;
  offset_value integer;
  item uuid;
  position integer := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.works w where w.id = target_work and w.creator_id = uid and w.deleted_at is null) then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;

  select count(*), coalesce(max(chapter_number), 0) + 1000 into expected_count, offset_value
  from public.chapters where work_id = target_work;
  supplied_count := coalesce(cardinality(ordered_chapter_ids), 0);

  if supplied_count <> expected_count then raise exception 'INVALID_CHAPTER_ORDER'; end if;
  if (select count(distinct x) from unnest(ordered_chapter_ids) x) <> expected_count then raise exception 'DUPLICATE_CHAPTER_ORDER'; end if;
  if exists (select 1 from unnest(ordered_chapter_ids) x where not exists (select 1 from public.chapters c where c.id = x and c.work_id = target_work)) then
    raise exception 'FOREIGN_CHAPTER_IN_ORDER';
  end if;

  update public.chapters set chapter_number = chapter_number + offset_value where work_id = target_work;

  foreach item in array ordered_chapter_ids loop
    position := position + 1;
    update public.chapters set chapter_number = position where id = item;
  end loop;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (uid, 'CHAPTERS_REORDERED', 'WORK', target_work, jsonb_build_object('chapter_count', expected_count));
end;
$$;

create or replace function public.delete_work(target_work uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.works w where w.id = target_work and w.creator_id = uid and w.deleted_at is null) then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;

  update public.works
  set deleted_at = now(), visibility = 'PRIVATE'
  where id = target_work;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id)
  values (uid, 'WORK_DELETED', 'WORK', target_work);
end;
$$;

revoke execute on function public.update_work(uuid,text,text,text,text,text,text[],text[],integer,text,boolean) from public;
revoke execute on function public.update_chapter(uuid,text,text,text,text,text) from public;
revoke execute on function public.delete_chapter(uuid) from public;
revoke execute on function public.reorder_chapters(uuid,uuid[]) from public;
revoke execute on function public.delete_work(uuid) from public;

grant execute on function public.update_work(uuid,text,text,text,text,text,text[],text[],integer,text,boolean) to authenticated;
grant execute on function public.update_chapter(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.delete_chapter(uuid) to authenticated;
grant execute on function public.reorder_chapters(uuid,uuid[]) to authenticated;
grant execute on function public.delete_work(uuid) to authenticated;
