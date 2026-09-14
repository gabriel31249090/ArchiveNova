-- ArchiveNova v4.6 — Admin & Security Center
-- Separates ADMIN from MODERATOR, closes profile privilege escalation,
-- adds auditable admin RPCs and global platform settings.

begin;

-- -----------------------------------------------------------------------------
-- 1. Roles: ADMIN is distinct from MODERATOR
-- -----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ACTIVE'
      and p.role = 'ADMIN'
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Ensure the project owner account is ADMIN in case an earlier bootstrap was missed.
update public.profiles p
set role = 'ADMIN',
    status = 'ACTIVE',
    updated_at = now()
from auth.users u
where u.id = p.id
  and lower(coalesce(u.email, '')) = 'gabriel31249090@gmail.com';

-- -----------------------------------------------------------------------------
-- 2. Critical hardening: users may not change role/status directly
-- -----------------------------------------------------------------------------

revoke insert, update, delete on public.profiles from authenticated;
grant update (username, display_name, bio) on public.profiles to authenticated;

-- Keep the existing self-update RLS policy, but column grants now prevent
-- role/status privilege escalation from the browser.

-- Audit log is administrative. Moderators keep moderation RPCs but do not
-- receive the full platform audit trail.
drop policy if exists audit_staff_read on public.audit_log;
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log
for select to authenticated
using (public.is_admin());

-- Active-account enforcement. Suspended/deleted accounts may authenticate at
-- Supabase Auth level, but they cannot mutate ArchiveNova application data.
create or replace function public.enforce_active_account_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is not null and not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'ACTIVE'
  ) then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','user_preferences','pseuds','works','chapters','comments','kudos','bookmarks','reading_history',
    'work_subscriptions','series','series_works','series_subscriptions',
    'user_subscriptions','collections','collection_works','notifications','user_blocks','reports',
    'community_posts','post_poll_votes','post_likes','post_comments',
    'work_collaborators','work_contributions','contribution_reviews',
    'creator_support_profiles','ad_requests','library_entries','shelves',
    'shelf_items','drafts','draft_chapters','draft_collaborators',
    'draft_inline_comments'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_active_account_guard', table_name);
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function public.enforce_active_account_write()',
      table_name || '_active_account_guard',
      table_name
    );
  end loop;
end;
$$;

-- Public content from suspended/deleted creators disappears for normal readers,
-- while the owner and staff can still inspect it.
create or replace function public.can_read_work(target_work uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.works w
    join public.profiles creator on creator.id = w.creator_id
    where w.id = target_work
      and w.deleted_at is null
      and (
        w.creator_id = auth.uid()
        or public.is_staff()
        or (
          creator.status = 'ACTIVE'
          and (
            (w.status <> 'DRAFT' and w.visibility in ('PUBLIC', 'UNLISTED'))
            or (w.status <> 'DRAFT' and w.visibility = 'REGISTERED' and auth.uid() is not null)
          )
        )
      )
  );
$$;

create or replace function public.can_read_post(target_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.community_posts cp
    join public.profiles author_profile on author_profile.id = cp.author_id
    where cp.id = target_post
      and cp.deleted_at is null
      and (
        cp.author_id = auth.uid()
        or public.is_staff()
        or (
          author_profile.status = 'ACTIVE'
          and (
            cp.visibility = 'PUBLIC'
            or (
              cp.visibility = 'FOLLOWERS'
              and auth.uid() is not null
              and exists (
                select 1 from public.user_subscriptions us
                where us.subscriber_id = auth.uid() and us.author_id = cp.author_id
              )
            )
          )
        )
      )
      and (
        auth.uid() is null
        or cp.author_id = auth.uid()
        or public.is_staff()
        or not exists (
          select 1 from public.user_blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = cp.author_id)
             or (b.blocker_id = cp.author_id and b.blocked_id = auth.uid())
        )
      )
  );
$$;

grant execute on function public.can_read_work(uuid) to anon, authenticated;
grant execute on function public.can_read_post(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Global platform settings
-- -----------------------------------------------------------------------------

create table if not exists public.platform_admin_settings (
  id smallint primary key default 1 check (id = 1),
  announcement_enabled boolean not null default false,
  announcement_text varchar(500),
  allow_new_ad_requests boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_admin_settings(id)
values (1)
on conflict (id) do nothing;

alter table public.platform_admin_settings enable row level security;

drop policy if exists platform_admin_settings_public_read on public.platform_admin_settings;
create policy platform_admin_settings_public_read
on public.platform_admin_settings
for select to anon, authenticated
using (true);

drop policy if exists platform_admin_settings_admin_write on public.platform_admin_settings;
create policy platform_admin_settings_admin_write
on public.platform_admin_settings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.platform_admin_settings from anon, authenticated;

create or replace function public.platform_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'announcement_enabled', s.announcement_enabled,
        'announcement_text', s.announcement_text,
        'allow_new_ad_requests', s.allow_new_ad_requests,
        'updated_at', s.updated_at
      )
      from public.platform_admin_settings s
      where s.id = 1
    ),
    jsonb_build_object(
      'announcement_enabled', false,
      'announcement_text', null,
      'allow_new_ad_requests', true
    )
  );
$$;

revoke execute on function public.platform_public_settings() from public;
grant execute on function public.platform_public_settings() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Global product areas: ADMIN-only writes
-- -----------------------------------------------------------------------------

drop policy if exists project_support_public_read on public.project_support_config;
create policy project_support_public_read on public.project_support_config
for select to anon, authenticated
using (enabled or public.is_admin());

drop policy if exists project_support_staff_write on public.project_support_config;
drop policy if exists project_support_admin_write on public.project_support_config;
create policy project_support_admin_write on public.project_support_config
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists faq_public_read on public.faq_items;
create policy faq_public_read on public.faq_items
for select to anon, authenticated
using (published or public.is_admin());

drop policy if exists faq_staff_write on public.faq_items;
drop policy if exists faq_admin_write on public.faq_items;
create policy faq_admin_write on public.faq_items
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists ad_campaigns_public_read on public.ad_campaigns;
create policy ad_campaigns_public_read on public.ad_campaigns
for select to anon, authenticated
using (
  (
    status = 'ACTIVE'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  )
  or public.is_admin()
);

drop policy if exists ad_campaigns_staff_write on public.ad_campaigns;
drop policy if exists ad_campaigns_admin_write on public.ad_campaigns;
create policy ad_campaigns_admin_write on public.ad_campaigns
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists ad_requests_read on public.ad_requests;
create policy ad_requests_read on public.ad_requests
for select to authenticated
using (requester_id = auth.uid() or public.is_admin());

drop policy if exists ad_requests_staff_update on public.ad_requests;
drop policy if exists ad_requests_admin_update on public.ad_requests;
create policy ad_requests_admin_update on public.ad_requests
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Block new ad requests globally when an administrator disables intake.
drop policy if exists ad_requests_insert on public.ad_requests;
create policy ad_requests_insert on public.ad_requests
for insert to authenticated
with check (
  requester_id = auth.uid()
  and coalesce(
    (public.platform_public_settings() ->> 'allow_new_ad_requests')::boolean,
    true
  )
);

-- -----------------------------------------------------------------------------
-- 5. Admin dashboard and user management
-- -----------------------------------------------------------------------------

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'active', (select count(*) from public.profiles where status = 'ACTIVE'),
      'suspended', (select count(*) from public.profiles where status = 'SUSPENDED'),
      'moderators', (select count(*) from public.profiles where role = 'MODERATOR' and status = 'ACTIVE'),
      'admins', (select count(*) from public.profiles where role = 'ADMIN' and status = 'ACTIVE')
    ),
    'content', jsonb_build_object(
      'works', (select count(*) from public.works where deleted_at is null),
      'public_works', (select count(*) from public.works where deleted_at is null and visibility = 'PUBLIC' and status <> 'DRAFT'),
      'drafts', (select count(*) from public.works where deleted_at is null and status = 'DRAFT'),
      'posts', (select count(*) from public.community_posts where deleted_at is null),
      'comments', (select count(*) from public.comments where status = 'VISIBLE')
    ),
    'trust', jsonb_build_object(
      'open_reports', (select count(*) from public.reports where status in ('OPEN','REVIEWING')),
      'open_ad_requests', (select count(*) from public.ad_requests where status = 'OPEN'),
      'active_campaigns', (select count(*) from public.ad_campaigns where status = 'ACTIVE')
    ),
    'activity', jsonb_build_object(
      'users_24h', (select count(*) from public.profiles where created_at >= now() - interval '24 hours'),
      'works_24h', (select count(*) from public.works where created_at >= now() - interval '24 hours'),
      'posts_24h', (select count(*) from public.community_posts where created_at >= now() - interval '24 hours'),
      'hits_24h', (select count(*) from public.work_hits where created_at >= now() - interval '24 hours')
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.admin_users(
  search_text text default '',
  limit_count integer default 50,
  offset_count integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into result
  from (
    select
      p.id,
      p.username::text as username,
      p.display_name,
      u.email,
      p.role,
      p.status,
      p.created_at,
      p.updated_at,
      (select count(*) from public.works w where w.creator_id = p.id and w.deleted_at is null) as works_count,
      (select count(*) from public.community_posts cp where cp.author_id = p.id and cp.deleted_at is null) as posts_count,
      (
        select count(*)
        from public.reports r
        left join public.works rw on rw.id = r.work_id
        left join public.comments rc on rc.id = r.comment_id
        where rw.creator_id = p.id or rc.user_id = p.id
      ) as reports_count
    from public.profiles p
    left join auth.users u on u.id = p.id
    where
      btrim(coalesce(search_text, '')) = ''
      or p.username::text ilike '%' || btrim(search_text) || '%'
      or coalesce(p.display_name, '') ilike '%' || btrim(search_text) || '%'
      or coalesce(u.email, '') ilike '%' || btrim(search_text) || '%'
    order by p.created_at desc
    limit greatest(1, least(coalesce(limit_count, 50), 200))
    offset greatest(0, coalesce(offset_count, 0))
  ) x;

  return result;
end;
$$;

create or replace function public.admin_set_user_role(
  target_user uuid,
  next_role text
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized text := upper(btrim(coalesce(next_role, 'USER')));
  previous_role text;
  protected_owner boolean;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  if normalized not in ('USER','MODERATOR','ADMIN') then
    raise exception 'INVALID_ROLE';
  end if;
  if target_user = auth.uid() and normalized <> 'ADMIN' then
    raise exception 'CANNOT_DEMOTE_SELF' using errcode = '42501';
  end if;

  select p.role,
         exists(
           select 1 from auth.users u
           where u.id = p.id
             and lower(coalesce(u.email, '')) = 'gabriel31249090@gmail.com'
         )
  into previous_role, protected_owner
  from public.profiles p
  where p.id = target_user;

  if previous_role is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if protected_owner and normalized <> 'ADMIN' then
    raise exception 'OWNER_ADMIN_PROTECTED' using errcode = '42501';
  end if;

  update public.profiles
  set role = normalized,
      updated_at = now()
  where id = target_user;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'USER_ROLE_CHANGED',
    'USER',
    target_user,
    jsonb_build_object('from', previous_role, 'to', normalized)
  );
end;
$$;

create or replace function public.admin_set_user_status(
  target_user uuid,
  next_status text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized text := upper(btrim(coalesce(next_status, 'ACTIVE')));
  previous_status text;
  protected_owner boolean;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  if normalized not in ('ACTIVE','SUSPENDED','DELETED') then
    raise exception 'INVALID_STATUS';
  end if;
  if target_user = auth.uid() and normalized <> 'ACTIVE' then
    raise exception 'CANNOT_SUSPEND_SELF' using errcode = '42501';
  end if;

  select p.status,
         exists(
           select 1 from auth.users u
           where u.id = p.id
             and lower(coalesce(u.email, '')) = 'gabriel31249090@gmail.com'
         )
  into previous_status, protected_owner
  from public.profiles p
  where p.id = target_user;

  if previous_status is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if protected_owner and normalized <> 'ACTIVE' then
    raise exception 'OWNER_ADMIN_PROTECTED' using errcode = '42501';
  end if;

  update public.profiles
  set status = normalized,
      updated_at = now()
  where id = target_user;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'USER_STATUS_CHANGED',
    'USER',
    target_user,
    jsonb_build_object(
      'from', previous_status,
      'to', normalized,
      'reason', nullif(left(btrim(coalesce(reason, '')), 1000), '')
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Content administration
-- -----------------------------------------------------------------------------

create or replace function public.admin_content(limit_count integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'works', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select
          w.id,
          w.title,
          w.status,
          w.visibility,
          w.deleted_at,
          w.updated_at,
          p.username::text as author_username
        from public.works w
        join public.profiles p on p.id = w.creator_id
        order by w.updated_at desc
        limit greatest(1, least(coalesce(limit_count, 50), 150))
      ) x
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          cp.id,
          left(cp.body, 220) as body,
          cp.deleted_at,
          cp.created_at,
          p.username::text as author_username
        from public.community_posts cp
        join public.profiles p on p.id = cp.author_id
        order by cp.created_at desc
        limit greatest(1, least(coalesce(limit_count, 50), 150))
      ) x
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select *
        from (
          select
            c.id,
            left(c.body, 220) as body,
            c.status,
            c.created_at,
            p.username::text as author_username,
            'WORK'::text as kind
          from public.comments c
          join public.profiles p on p.id = c.user_id
          union all
          select
            pc.id,
            left(pc.body, 220) as body,
            pc.status,
            pc.created_at,
            p.username::text as author_username,
            'POST'::text as kind
          from public.post_comments pc
          join public.profiles p on p.id = pc.user_id
        ) combined
        order by created_at desc
        limit greatest(1, least(coalesce(limit_count, 50), 150))
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_set_work_hidden(target_work uuid, hide boolean default true)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;

  update public.works
  set deleted_at = case when hide then coalesce(deleted_at, now()) else null end,
      updated_at = now()
  where id = target_work;

  if not found then raise exception 'WORK_NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id)
  values(auth.uid(), case when hide then 'WORK_ADMIN_HIDDEN' else 'WORK_ADMIN_RESTORED' end, 'WORK', target_work);
end;
$$;

create or replace function public.admin_set_post_hidden(target_post uuid, hide boolean default true)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;

  update public.community_posts
  set deleted_at = case when hide then coalesce(deleted_at, now()) else null end,
      updated_at = now()
  where id = target_post;

  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id)
  values(auth.uid(), case when hide then 'POST_ADMIN_HIDDEN' else 'POST_ADMIN_RESTORED' end, 'POST', target_post);
end;
$$;

create or replace function public.admin_set_comment_hidden(target_comment uuid, hide boolean default true)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;

  update public.comments
  set status = case when hide then 'HIDDEN' else 'VISIBLE' end,
      updated_at = now()
  where id = target_comment;

  if not found then raise exception 'COMMENT_NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id)
  values(auth.uid(), case when hide then 'COMMENT_ADMIN_HIDDEN' else 'COMMENT_ADMIN_RESTORED' end, 'COMMENT', target_comment);
end;
$$;

create or replace function public.admin_set_post_comment_hidden(target_comment uuid, hide boolean default true)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;

  update public.post_comments
  set status = case when hide then 'HIDDEN' else 'VISIBLE' end,
      updated_at = now()
  where id = target_comment;

  if not found then raise exception 'POST_COMMENT_NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id)
  values(auth.uid(), case when hide then 'POST_COMMENT_ADMIN_HIDDEN' else 'POST_COMMENT_ADMIN_RESTORED' end, 'POST_COMMENT', target_comment);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Taxonomy administration
-- -----------------------------------------------------------------------------

create or replace function public.admin_taxonomy(
  search_text text default '',
  limit_count integer default 80
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'fandoms', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.work_count desc, x.name)
      from (
        select
          f.id,
          f.name::text as name,
          f.slug,
          f.canonical,
          f.description,
          (select count(*) from public.work_fandoms wf where wf.fandom_id = f.id) as work_count
        from public.fandoms f
        where btrim(coalesce(search_text, '')) = ''
           or f.name::text ilike '%' || btrim(search_text) || '%'
        order by work_count desc, f.name
        limit greatest(1, least(coalesce(limit_count, 80), 300))
      ) x
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.work_count desc, x.name)
      from (
        select
          t.id,
          t.name::text as name,
          t.slug,
          t.type,
          t.canonical,
          t.description,
          (select count(*) from public.work_tags wt where wt.tag_id = t.id) as work_count
        from public.tags t
        where btrim(coalesce(search_text, '')) = ''
           or t.name::text ilike '%' || btrim(search_text) || '%'
        order by work_count desc, t.name
        limit greatest(1, least(coalesce(limit_count, 80), 300))
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_rename_fandom(target_fandom uuid, next_name text)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  clean_name text := left(btrim(coalesce(next_name, '')), 180);
  next_slug text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  if clean_name = '' then raise exception 'INVALID_NAME'; end if;

  next_slug := public.slugify(clean_name);
  if exists(select 1 from public.fandoms f where f.slug = next_slug and f.id <> target_fandom) then
    next_slug := left(next_slug, 245) || '-' || left(replace(target_fandom::text, '-', ''), 8);
  end if;

  update public.fandoms
  set name = clean_name,
      slug = next_slug
  where id = target_fandom;

  if not found then raise exception 'FANDOM_NOT_FOUND' using errcode = 'P0002'; end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'FANDOM_RENAMED', 'FANDOM', target_fandom, jsonb_build_object('name', clean_name, 'slug', next_slug));
end;
$$;

create or replace function public.admin_rename_tag(target_tag uuid, next_name text)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  clean_name text := left(btrim(coalesce(next_name, '')), 180);
  next_slug text;
  current_type text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  if clean_name = '' then raise exception 'INVALID_NAME'; end if;

  select type into current_type from public.tags where id = target_tag;
  if current_type is null then raise exception 'TAG_NOT_FOUND' using errcode = 'P0002'; end if;

  next_slug := public.slugify(clean_name);
  if exists(select 1 from public.tags t where t.slug = next_slug and t.type = current_type and t.id <> target_tag) then
    next_slug := left(next_slug, 245) || '-' || left(replace(target_tag::text, '-', ''), 8);
  end if;

  update public.tags
  set name = clean_name,
      slug = next_slug
  where id = target_tag;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'TAG_RENAMED', 'TAG', target_tag, jsonb_build_object('name', clean_name, 'slug', next_slug));
end;
$$;

create or replace function public.admin_merge_tags(source_tag uuid, target_tag uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  source_type text;
  target_type text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  if source_tag = target_tag then raise exception 'SAME_TAG'; end if;
  select type into source_type from public.tags where id = source_tag;
  select type into target_type from public.tags where id = target_tag;
  if source_type is null then raise exception 'SOURCE_TAG_NOT_FOUND'; end if;
  if target_type is null then raise exception 'TARGET_TAG_NOT_FOUND'; end if;
  if source_type <> target_type then raise exception 'TAG_TYPE_MISMATCH'; end if;

  insert into public.work_tags(work_id, tag_id)
  select wt.work_id, target_tag
  from public.work_tags wt
  where wt.tag_id = source_tag
  on conflict do nothing;

  delete from public.work_tags where tag_id = source_tag;

  insert into public.tag_aliases(alias_tag_id, canonical_tag_id)
  values(source_tag, target_tag)
  on conflict(alias_tag_id) do update
    set canonical_tag_id = excluded.canonical_tag_id;

  update public.tags set canonical = true where id = target_tag;
  update public.tags set canonical = false where id = source_tag;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, metadata)
  values(auth.uid(), 'TAG_MERGED', 'TAG', source_tag, jsonb_build_object('canonical_tag_id', target_tag));
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Audit and platform analytics
-- -----------------------------------------------------------------------------

create or replace function public.admin_audit_log(limit_count integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select
        a.id,
        a.action,
        a.entity_type,
        a.entity_id,
        a.metadata,
        a.created_at,
        p.username::text as actor_username,
        p.display_name as actor_display_name
      from public.audit_log a
      left join public.profiles p on p.id = a.actor_user_id
      order by a.created_at desc
      limit greatest(1, least(coalesce(limit_count, 100), 500))
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_platform_analytics(days_back integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  safe_days integer := greatest(1, least(coalesce(days_back, 30), 365));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;

  return coalesce((
    with days as (
      select generate_series(current_date - (safe_days - 1), current_date, interval '1 day')::date as day
    )
    select jsonb_agg(
      jsonb_build_object(
        'date', d.day,
        'users', (select count(*) from public.profiles p where p.created_at::date = d.day),
        'works', (select count(*) from public.works w where w.created_at::date = d.day),
        'posts', (select count(*) from public.community_posts cp where cp.created_at::date = d.day),
        'reports', (select count(*) from public.reports r where r.created_at::date = d.day),
        'hits', (select count(*) from public.work_hits h where h.created_at::date = d.day)
      )
      order by d.day
    )
    from days d
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
  return coalesce(
    (select to_jsonb(s) from public.platform_admin_settings s where s.id = 1),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.admin_update_settings(
  next_announcement_enabled boolean,
  next_announcement_text text,
  next_allow_new_ad_requests boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;

  insert into public.platform_admin_settings(
    id,
    announcement_enabled,
    announcement_text,
    allow_new_ad_requests,
    updated_by,
    updated_at
  )
  values(
    1,
    coalesce(next_announcement_enabled, false),
    nullif(left(btrim(coalesce(next_announcement_text, '')), 500), ''),
    coalesce(next_allow_new_ad_requests, true),
    auth.uid(),
    now()
  )
  on conflict(id) do update set
    announcement_enabled = excluded.announcement_enabled,
    announcement_text = excluded.announcement_text,
    allow_new_ad_requests = excluded.allow_new_ad_requests,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.audit_log(actor_user_id, action, entity_type, metadata)
  values(
    auth.uid(),
    'PLATFORM_SETTINGS_UPDATED',
    'PLATFORM',
    jsonb_build_object(
      'announcement_enabled', coalesce(next_announcement_enabled, false),
      'allow_new_ad_requests', coalesce(next_allow_new_ad_requests, true)
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Grants
-- -----------------------------------------------------------------------------

revoke execute on function public.admin_dashboard() from public;
revoke execute on function public.admin_users(text,integer,integer) from public;
revoke execute on function public.admin_set_user_role(uuid,text) from public;
revoke execute on function public.admin_set_user_status(uuid,text,text) from public;
revoke execute on function public.admin_content(integer) from public;
revoke execute on function public.admin_set_work_hidden(uuid,boolean) from public;
revoke execute on function public.admin_set_post_hidden(uuid,boolean) from public;
revoke execute on function public.admin_set_comment_hidden(uuid,boolean) from public;
revoke execute on function public.admin_set_post_comment_hidden(uuid,boolean) from public;
revoke execute on function public.admin_taxonomy(text,integer) from public;
revoke execute on function public.admin_rename_fandom(uuid,text) from public;
revoke execute on function public.admin_rename_tag(uuid,text) from public;
revoke execute on function public.admin_merge_tags(uuid,uuid) from public;
revoke execute on function public.admin_audit_log(integer) from public;
revoke execute on function public.admin_platform_analytics(integer) from public;
revoke execute on function public.admin_get_settings() from public;
revoke execute on function public.admin_update_settings(boolean,text,boolean) from public;

grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_users(text,integer,integer) to authenticated;
grant execute on function public.admin_set_user_role(uuid,text) to authenticated;
grant execute on function public.admin_set_user_status(uuid,text,text) to authenticated;
grant execute on function public.admin_content(integer) to authenticated;
grant execute on function public.admin_set_work_hidden(uuid,boolean) to authenticated;
grant execute on function public.admin_set_post_hidden(uuid,boolean) to authenticated;
grant execute on function public.admin_set_comment_hidden(uuid,boolean) to authenticated;
grant execute on function public.admin_set_post_comment_hidden(uuid,boolean) to authenticated;
grant execute on function public.admin_taxonomy(text,integer) to authenticated;
grant execute on function public.admin_rename_fandom(uuid,text) to authenticated;
grant execute on function public.admin_rename_tag(uuid,text) to authenticated;
grant execute on function public.admin_merge_tags(uuid,uuid) to authenticated;
grant execute on function public.admin_audit_log(integer) to authenticated;
grant execute on function public.admin_platform_analytics(integer) to authenticated;
grant execute on function public.admin_get_settings() to authenticated;
grant execute on function public.admin_update_settings(boolean,text,boolean) to authenticated;

grant all on public.platform_admin_settings to service_role;

commit;
