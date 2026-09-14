-- ArchiveNova v3 — Fases 6, 7 e 8
-- Creator Studio, perfis públicos, assinaturas, notificações e moderação.

-- -----------------------------------------------------------------------------
-- Helpful indexes
-- -----------------------------------------------------------------------------

create index if not exists user_subscriptions_author_created
  on public.user_subscriptions(author_id, created_at desc);
create index if not exists work_subscriptions_work_created
  on public.work_subscriptions(work_id, created_at desc);
create index if not exists comments_user_created
  on public.comments(user_id, created_at desc);
create index if not exists notifications_user_created
  on public.notifications(user_id, created_at desc);

-- Blocks now also affect work visibility for signed-in users.
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
      and (
        auth.uid() is null
        or w.creator_id = auth.uid()
        or not exists (
          select 1 from public.user_blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = w.creator_id)
             or (b.blocker_id = w.creator_id and b.blocked_id = auth.uid())
        )
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- Creator Studio
-- -----------------------------------------------------------------------------

create or replace function public.creator_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totals', jsonb_build_object(
      'works', count(*) filter (where w.deleted_at is null),
      'published', count(*) filter (where w.deleted_at is null and w.status <> 'DRAFT'),
      'ongoing', count(*) filter (where w.deleted_at is null and w.status = 'ONGOING'),
      'complete', count(*) filter (where w.deleted_at is null and w.status = 'COMPLETE'),
      'drafts', count(*) filter (where w.deleted_at is null and w.status = 'DRAFT'),
      'words', coalesce(sum(w.word_count) filter (where w.deleted_at is null), 0),
      'hits', coalesce(sum(w.hits_count) filter (where w.deleted_at is null), 0),
      'kudos', coalesce(sum(w.kudos_count) filter (where w.deleted_at is null), 0),
      'bookmarks', coalesce(sum(w.bookmarks_count) filter (where w.deleted_at is null), 0),
      'comments', coalesce(sum(w.comments_count) filter (where w.deleted_at is null), 0),
      'followers', (select count(*) from public.user_subscriptions us where us.author_id = uid),
      'subscribers', (select count(*) from public.work_subscriptions ws join public.works sw on sw.id = ws.work_id where sw.creator_id = uid and sw.deleted_at is null),
      'unread_notifications', (select count(*) from public.notifications n where n.user_id = uid and n.read_at is null)
    ),
    'works', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select wc.*
        from public.public_work_cards wc
        where wc.creator_id = uid
        order by wc.updated_at desc
        limit 50
      ) x
    ), '[]'::jsonb),
    'top_works', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.score desc, x.updated_at desc)
      from (
        select wc.*, (wc.hits_count + wc.kudos_count * 8 + wc.bookmarks_count * 5 + wc.comments_count * 4)::bigint as score
        from public.public_work_cards wc
        where wc.creator_id = uid and wc.status <> 'DRAFT'
        order by score desc, wc.updated_at desc
        limit 5
      ) x
    ), '[]'::jsonb),
    'recent_comments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          c.id,
          c.body,
          c.created_at,
          c.chapter_id,
          ch.chapter_number,
          ch.title as chapter_title,
          w.id as work_id,
          w.title as work_title,
          p.id as user_id,
          p.username::text as username,
          coalesce(p.display_name, p.username::text) as display_name
        from public.comments c
        join public.chapters ch on ch.id = c.chapter_id
        join public.works w on w.id = ch.work_id
        join public.profiles p on p.id = c.user_id
        where w.creator_id = uid and w.deleted_at is null and c.status = 'VISIBLE'
        order by c.created_at desc
        limit 8
      ) x
    ), '[]'::jsonb)
  ) into result
  from public.works w
  where w.creator_id = uid;

  return coalesce(result, jsonb_build_object(
    'totals', jsonb_build_object(
      'works', 0, 'published', 0, 'ongoing', 0, 'complete', 0, 'drafts', 0,
      'words', 0, 'hits', 0, 'kudos', 0, 'bookmarks', 0, 'comments', 0,
      'followers', 0, 'subscribers', 0, 'unread_notifications', 0
    ),
    'works', '[]'::jsonb,
    'top_works', '[]'::jsonb,
    'recent_comments', '[]'::jsonb
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Public author profiles
-- -----------------------------------------------------------------------------

create or replace function public.get_public_profile(profile_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target public.profiles%rowtype;
  viewer uuid := auth.uid();
  result jsonb;
begin
  select * into target
  from public.profiles p
  where p.username = btrim(profile_username)
    and p.status = 'ACTIVE'
  limit 1;

  if target.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if viewer is not null and viewer <> target.id and exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = viewer and b.blocked_id = target.id)
       or (b.blocker_id = target.id and b.blocked_id = viewer)
  ) then
    raise exception 'PROFILE_BLOCKED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', target.id,
      'username', target.username::text,
      'display_name', target.display_name,
      'bio', target.bio,
      'created_at', target.created_at
    ),
    'stats', jsonb_build_object(
      'works', count(*) filter (where w.id is not null),
      'words', coalesce(sum(w.word_count), 0),
      'hits', coalesce(sum(w.hits_count), 0),
      'kudos', coalesce(sum(w.kudos_count), 0),
      'followers', (select count(*) from public.user_subscriptions us where us.author_id = target.id)
    ),
    'viewer', jsonb_build_object(
      'is_self', viewer = target.id,
      'following', viewer is not null and exists (
        select 1 from public.user_subscriptions us
        where us.subscriber_id = viewer and us.author_id = target.id
      ),
      'blocked', viewer is not null and exists (
        select 1 from public.user_blocks ub
        where ub.blocker_id = viewer and ub.blocked_id = target.id
      )
    ),
    'works', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select wc.*
        from public.public_work_cards wc
        where wc.creator_id = target.id
          and wc.visibility = 'PUBLIC'
          and wc.status <> 'DRAFT'
        order by wc.updated_at desc
      ) x
    ), '[]'::jsonb)
  ) into result
  from public.works w
  where w.creator_id = target.id
    and w.deleted_at is null
    and w.visibility = 'PUBLIC'
    and w.status <> 'DRAFT';

  return result;
end;
$$;

create or replace function public.toggle_user_subscription(target_author uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if uid = target_author then raise exception 'CANNOT_FOLLOW_SELF'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_author and p.status = 'ACTIVE') then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = uid and b.blocked_id = target_author)
       or (b.blocker_id = target_author and b.blocked_id = uid)
  ) then
    raise exception 'PROFILE_BLOCKED' using errcode = '42501';
  end if;

  if exists (select 1 from public.user_subscriptions where subscriber_id = uid and author_id = target_author) then
    delete from public.user_subscriptions where subscriber_id = uid and author_id = target_author;
    return false;
  end if;

  insert into public.user_subscriptions(subscriber_id, author_id) values (uid, target_author);
  return true;
end;
$$;

create or replace function public.toggle_user_block(target_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if uid = target_user then raise exception 'CANNOT_BLOCK_SELF'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user) then raise exception 'PROFILE_NOT_FOUND'; end if;

  if exists (select 1 from public.user_blocks where blocker_id = uid and blocked_id = target_user) then
    delete from public.user_blocks where blocker_id = uid and blocked_id = target_user;
    return false;
  end if;

  delete from public.user_subscriptions
  where (subscriber_id = uid and author_id = target_user)
     or (subscriber_id = target_user and author_id = uid);
  insert into public.user_blocks(blocker_id, blocked_id) values (uid, target_user);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Work subscriptions + detail enrichment
-- -----------------------------------------------------------------------------

create or replace function public.toggle_work_subscription(target_work uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not public.can_read_work(target_work) then raise exception 'WORK_NOT_FOUND' using errcode = 'P0002'; end if;

  if exists (select 1 from public.work_subscriptions where user_id = uid and work_id = target_work) then
    delete from public.work_subscriptions where user_id = uid and work_id = target_work;
    return false;
  end if;

  insert into public.work_subscriptions(user_id, work_id) values (uid, target_work);
  return true;
end;
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
    'bookmarked', exists(select 1 from public.bookmarks b where b.work_id = wc.id and b.user_id = auth.uid()),
    'subscribed', exists(select 1 from public.work_subscriptions s where s.work_id = wc.id and s.user_id = auth.uid())
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

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------

create or replace function public.notifications_feed(limit_count integer default 50, unread_only boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select jsonb_build_object(
    'unread_count', (select count(*) from public.notifications where user_id = uid and read_at is null),
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          n.id,
          n.type,
          n.actor_user_id,
          n.work_id,
          n.comment_id,
          n.payload,
          n.read_at,
          n.created_at,
          p.username::text as actor_username,
          coalesce(p.display_name, p.username::text) as actor_display_name,
          w.title as work_title
        from public.notifications n
        left join public.profiles p on p.id = n.actor_user_id
        left join public.works w on w.id = n.work_id
        where n.user_id = uid
          and (not coalesce(unread_only, false) or n.read_at is null)
        order by n.created_at desc
        limit greatest(1, least(coalesce(limit_count, 50), 100))
      ) x
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.mark_notification_read(target_notification uuid)
returns void
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = target_notification and user_id = auth.uid();
$$;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.notify_kudos_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare owner_id uuid;
begin
  select creator_id into owner_id from public.works where id = new.work_id;
  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications(user_id, type, actor_user_id, work_id, payload)
    values (owner_id, 'KUDOS', new.user_id, new.work_id, '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists kudos_notification on public.kudos;
create trigger kudos_notification after insert on public.kudos
  for each row execute procedure public.notify_kudos_event();

create or replace function public.notify_comment_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
  work_id_value uuid;
  parent_user uuid;
begin
  select w.id, w.creator_id into work_id_value, owner_id
  from public.chapters ch join public.works w on w.id = ch.work_id
  where ch.id = new.chapter_id;

  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications(user_id, type, actor_user_id, work_id, comment_id, payload)
    values (owner_id, 'COMMENT', new.user_id, work_id_value, new.id, '{}'::jsonb);
  end if;

  if new.parent_id is not null then
    select c.user_id into parent_user from public.comments c where c.id = new.parent_id;
    if parent_user is not null and parent_user <> new.user_id and parent_user <> owner_id then
      insert into public.notifications(user_id, type, actor_user_id, work_id, comment_id, payload)
      values (parent_user, 'COMMENT_REPLY', new.user_id, work_id_value, new.id, '{}'::jsonb);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists comments_notification on public.comments;
create trigger comments_notification after insert on public.comments
  for each row execute procedure public.notify_comment_event();

create or replace function public.notify_follow_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications(user_id, type, actor_user_id, payload)
  values (new.author_id, 'NEW_FOLLOWER', new.subscriber_id, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists user_subscription_notification on public.user_subscriptions;
create trigger user_subscription_notification after insert on public.user_subscriptions
  for each row execute procedure public.notify_follow_event();

create or replace function public.notify_chapter_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare owner_id uuid;
begin
  if new.status <> 'PUBLISHED' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'PUBLISHED' then return new; end if;
  end if;

  select creator_id into owner_id from public.works where id = new.work_id;

  insert into public.notifications(user_id, type, actor_user_id, work_id, payload)
  select s.user_id, 'NEW_CHAPTER', owner_id, new.work_id,
         jsonb_build_object('chapter_id', new.id, 'chapter_number', new.chapter_number, 'chapter_title', new.title)
  from public.work_subscriptions s
  where s.work_id = new.work_id and s.user_id <> owner_id;

  return new;
end;
$$;

drop trigger if exists chapter_notification on public.chapters;
create trigger chapter_notification
  after insert or update of status on public.chapters
  for each row execute procedure public.notify_chapter_event();

-- -----------------------------------------------------------------------------
-- Reports and moderation
-- -----------------------------------------------------------------------------

create or replace function public.submit_report(
  target_work uuid default null,
  target_comment uuid default null,
  report_reason text default 'OTHER',
  report_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if (target_work is null and target_comment is null) or (target_work is not null and target_comment is not null) then
    raise exception 'REPORT_ONE_TARGET';
  end if;
  if char_length(btrim(coalesce(report_reason, ''))) not between 2 and 80 then raise exception 'INVALID_REASON'; end if;
  if char_length(coalesce(report_details, '')) > 5000 then raise exception 'DETAILS_TOO_LONG'; end if;
  if target_work is not null and not exists (select 1 from public.works w where w.id = target_work and w.deleted_at is null) then raise exception 'WORK_NOT_FOUND'; end if;
  if target_comment is not null and not exists (select 1 from public.comments c where c.id = target_comment) then raise exception 'COMMENT_NOT_FOUND'; end if;

  insert into public.reports(reporter_id, work_id, comment_id, reason, details)
  values (uid, target_work, target_comment, upper(btrim(report_reason)), nullif(btrim(coalesce(report_details, '')), ''))
  returning id into rid;

  return rid;
end;
$$;

create or replace function public.moderation_queue(limit_count integer default 80)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare result jsonb;
begin
  if not public.is_staff() then raise exception 'STAFF_ONLY' using errcode = '42501'; end if;

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(x) order by x.created_at asc), '[]'::jsonb)
  ) into result
  from (
    select
      r.id, r.reason, r.details, r.status, r.created_at, r.resolved_at,
      r.work_id, r.comment_id,
      reporter.username::text as reporter_username,
      w.title as work_title,
      c.body as comment_body,
      comment_author.username::text as comment_author_username
    from public.reports r
    left join public.profiles reporter on reporter.id = r.reporter_id
    left join public.works w on w.id = r.work_id
    left join public.comments c on c.id = r.comment_id
    left join public.profiles comment_author on comment_author.id = c.user_id
    where r.status in ('OPEN', 'REVIEWING')
    order by r.created_at asc
    limit greatest(1, least(coalesce(limit_count, 80), 200))
  ) x;

  return result;
end;
$$;

create or replace function public.resolve_report(target_report uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare normalized text := upper(coalesce(next_status, 'RESOLVED'));
begin
  if not public.is_staff() then raise exception 'STAFF_ONLY' using errcode = '42501'; end if;
  if normalized not in ('REVIEWING','RESOLVED','DISMISSED') then raise exception 'INVALID_REPORT_STATUS'; end if;

  update public.reports
  set status = normalized,
      resolved_at = case when normalized in ('RESOLVED','DISMISSED') then now() else null end
  where id = target_report;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'REPORT_' || normalized, 'REPORT', target_report, '{}'::jsonb);
end;
$$;

create or replace function public.moderate_comment(target_comment uuid, hide boolean default true)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_staff() then raise exception 'STAFF_ONLY' using errcode = '42501'; end if;
  update public.comments set status = case when hide then 'HIDDEN' else 'VISIBLE' end where id = target_comment;
  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), case when hide then 'COMMENT_HIDDEN' else 'COMMENT_RESTORED' end, 'COMMENT', target_comment, '{}'::jsonb);
end;
$$;

create or replace function public.moderate_work(target_work uuid, hide boolean default true)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_staff() then raise exception 'STAFF_ONLY' using errcode = '42501'; end if;
  update public.works
  set visibility = case when hide then 'PRIVATE' else 'PUBLIC' end
  where id = target_work and deleted_at is null;
  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), case when hide then 'WORK_HIDDEN' else 'WORK_RESTORED' end, 'WORK', target_work, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

revoke execute on function public.creator_dashboard() from public;
revoke execute on function public.get_public_profile(text) from public;
revoke execute on function public.toggle_user_subscription(uuid) from public;
revoke execute on function public.toggle_user_block(uuid) from public;
revoke execute on function public.toggle_work_subscription(uuid) from public;
revoke execute on function public.notifications_feed(integer,boolean) from public;
revoke execute on function public.mark_notification_read(uuid) from public;
revoke execute on function public.mark_all_notifications_read() from public;
revoke execute on function public.submit_report(uuid,uuid,text,text) from public;
revoke execute on function public.moderation_queue(integer) from public;
revoke execute on function public.resolve_report(uuid,text) from public;
revoke execute on function public.moderate_comment(uuid,boolean) from public;
revoke execute on function public.moderate_work(uuid,boolean) from public;

-- Public profile lookup is intentionally public. It only returns ACTIVE profiles and PUBLIC works.
grant execute on function public.get_public_profile(text) to anon, authenticated;
grant execute on function public.creator_dashboard() to authenticated;
grant execute on function public.toggle_user_subscription(uuid) to authenticated;
grant execute on function public.toggle_user_block(uuid) to authenticated;
grant execute on function public.toggle_work_subscription(uuid) to authenticated;
grant execute on function public.notifications_feed(integer,boolean) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.submit_report(uuid,uuid,text,text) to authenticated;
grant execute on function public.moderation_queue(integer) to authenticated;
grant execute on function public.resolve_report(uuid,text) to authenticated;
grant execute on function public.moderate_comment(uuid,boolean) to authenticated;
grant execute on function public.moderate_work(uuid,boolean) to authenticated;
