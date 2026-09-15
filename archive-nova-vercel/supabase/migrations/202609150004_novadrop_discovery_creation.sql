-- ArchiveNova v4.7 — NovaDrop 01: Discovery & Creation
-- Additive product expansion: personalized home, Discovery 2.0, Profile 2.0,
-- saved searches, richer fandom hubs and Admin health/feature controls.

-- -----------------------------------------------------------------------------
-- 1. Profile 2.0
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists banner_url text,
  add column if not exists website_url text,
  add column if not exists location varchar(120),
  add column if not exists favorite_fandoms text[] not null default array[]::text[],
  add column if not exists featured_work_id uuid references public.works(id) on delete set null;

create index if not exists profiles_featured_work_idx
  on public.profiles(featured_work_id)
  where featured_work_id is not null;

create or replace function public.update_profile_v2(
  next_display_name text,
  next_bio text,
  next_avatar_url text default null,
  next_banner_url text default null,
  next_website_url text default null,
  next_location text default null,
  next_favorite_fandoms text[] default array[]::text[],
  next_featured_work uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  clean_avatar text:=nullif(left(btrim(coalesce(next_avatar_url,'')),1000),'');
  clean_banner text:=nullif(left(btrim(coalesce(next_banner_url,'')),1000),'');
  clean_website text:=nullif(left(btrim(coalesce(next_website_url,'')),1000),'');
  clean_fandoms text[];
  result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  if clean_avatar is not null and clean_avatar !~* '^https?://' then raise exception 'INVALID_AVATAR_URL'; end if;
  if clean_banner is not null and clean_banner !~* '^https?://' then raise exception 'INVALID_BANNER_URL'; end if;
  if clean_website is not null and clean_website !~* '^https?://' then raise exception 'INVALID_WEBSITE_URL'; end if;

  select coalesce(array_agg(distinct left(btrim(u.value),120)) filter(where btrim(u.value)<>''),array[]::text[])
  into clean_fandoms
  from unnest(coalesce(next_favorite_fandoms,array[]::text[])) as u(value);

  if cardinality(clean_fandoms)>12 then
    clean_fandoms:=clean_fandoms[1:12];
  end if;

  if next_featured_work is not null and not exists(
    select 1 from public.works w
    where w.id=next_featured_work
      and w.creator_id=uid
      and w.deleted_at is null
  ) then
    raise exception 'FEATURED_WORK_NOT_OWNED' using errcode='42501';
  end if;

  update public.profiles
  set display_name=nullif(left(btrim(coalesce(next_display_name,'')),120),''),
      bio=nullif(left(btrim(coalesce(next_bio,'')),4000),''),
      avatar_url=clean_avatar,
      banner_url=clean_banner,
      website_url=clean_website,
      location=nullif(left(btrim(coalesce(next_location,'')),120),''),
      favorite_fandoms=clean_fandoms,
      featured_work_id=next_featured_work,
      updated_at=now()
  where id=uid;

  select jsonb_build_object(
    'id',p.id,
    'username',p.username::text,
    'display_name',p.display_name,
    'bio',p.bio,
    'avatar_url',p.avatar_url,
    'banner_url',p.banner_url,
    'website_url',p.website_url,
    'location',p.location,
    'favorite_fandoms',p.favorite_fandoms,
    'featured_work_id',p.featured_work_id
  )
  into result
  from public.profiles p
  where p.id=uid;

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Saved searches / filters
-- -----------------------------------------------------------------------------

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name varchar(100) not null,
  query text not null default '',
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_searches_user_updated_idx
  on public.saved_searches(user_id,updated_at desc);

alter table public.saved_searches enable row level security;

drop policy if exists saved_searches_owner_read on public.saved_searches;
drop policy if exists saved_searches_owner_insert on public.saved_searches;
drop policy if exists saved_searches_owner_update on public.saved_searches;
drop policy if exists saved_searches_owner_delete on public.saved_searches;

create policy saved_searches_owner_read
on public.saved_searches for select to authenticated
using(user_id=(select auth.uid()));

create policy saved_searches_owner_insert
on public.saved_searches for insert to authenticated
with check(user_id=(select auth.uid()));

create policy saved_searches_owner_update
on public.saved_searches for update to authenticated
using(user_id=(select auth.uid()))
with check(user_id=(select auth.uid()));

create policy saved_searches_owner_delete
on public.saved_searches for delete to authenticated
using(user_id=(select auth.uid()));

drop trigger if exists saved_searches_updated_at on public.saved_searches;
create trigger saved_searches_updated_at
before update on public.saved_searches
for each row execute function public.set_updated_at();

drop trigger if exists saved_searches_active_account_guard on public.saved_searches;
create trigger saved_searches_active_account_guard
before insert or update or delete on public.saved_searches
for each row execute function public.enforce_active_account_write();

create or replace function public.saved_searches_list()
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'name',s.name,
    'query',s.query,
    'filters',s.filters,
    'created_at',s.created_at,
    'updated_at',s.updated_at
  ) order by s.updated_at desc),'[]'::jsonb)
  from public.saved_searches s
  where s.user_id=auth.uid();
$$;

create or replace function public.saved_search_upsert(
  target_id uuid,
  search_name text,
  search_query text default '',
  search_filters jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  sid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if char_length(btrim(coalesce(search_name,''))) not between 1 and 100 then raise exception 'INVALID_SEARCH_NAME'; end if;

  if target_id is null then
    insert into public.saved_searches(user_id,name,query,filters)
    values(
      uid,
      btrim(search_name),
      left(coalesce(search_query,''),500),
      coalesce(search_filters,'{}'::jsonb)
    )
    returning id into sid;
  else
    update public.saved_searches
    set name=btrim(search_name),
        query=left(coalesce(search_query,''),500),
        filters=coalesce(search_filters,'{}'::jsonb),
        updated_at=now()
    where id=target_id and user_id=uid
    returning id into sid;

    if sid is null then raise exception 'SAVED_SEARCH_NOT_FOUND' using errcode='P0002'; end if;
  end if;

  return sid;
end;
$$;

create or replace function public.saved_search_delete(target_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  delete from public.saved_searches where id=target_id and user_id=auth.uid();
  if not found then raise exception 'SAVED_SEARCH_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Discovery 2.0 search suggestions
-- -----------------------------------------------------------------------------

create or replace function public.search_suggestions(
  search_text text,
  limit_count integer default 6
)
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  with params as (
    select btrim(coalesce(search_text,'')) q,
           greatest(1,least(coalesce(limit_count,6),12)) lim
  )
  select case when (select char_length(q) from params)<2 then
    jsonb_build_object('works','[]'::jsonb,'authors','[]'::jsonb,'fandoms','[]'::jsonb,'tags','[]'::jsonb)
  else jsonb_build_object(
    'works',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.rank_score desc,x.title)
      from (
        select wc.id,wc.title,wc.author_username,wc.author_display_name,wc.fandoms,
          (
            case when lower(wc.title)=lower(p.q) then 100
                 when wc.title ilike p.q||'%' then 70 else 30 end
            + least(wc.kudos_count,200)/20.0
          ) rank_score
        from public.public_work_cards wc
        cross join params p
        where wc.visibility='PUBLIC' and wc.status<>'DRAFT'
          and public.can_read_work(wc.id)
          and (
            wc.title ilike '%'||p.q||'%'
            or wc.author_username ilike '%'||p.q||'%'
            or exists(select 1 from unnest(wc.fandoms) f where f ilike '%'||p.q||'%')
            or exists(select 1 from unnest(wc.tags) t where t ilike '%'||p.q||'%')
          )
        order by rank_score desc,wc.updated_at desc
        limit (select lim from params)
      ) x
    ),'[]'::jsonb),
    'authors',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.followers desc,x.username)
      from (
        select p.id,p.username::text username,coalesce(p.display_name,p.username::text) display_name,p.avatar_url,
          (select count(*) from public.user_subscriptions us where us.author_id=p.id) followers
        from public.profiles p
        cross join params prm
        where p.status='ACTIVE'
          and (p.username::text ilike '%'||prm.q||'%' or coalesce(p.display_name,'') ilike '%'||prm.q||'%')
        order by followers desc,p.updated_at desc
        limit (select lim from params)
      ) x
    ),'[]'::jsonb),
    'fandoms',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.work_count desc,x.name)
      from (
        select f.id,f.name::text name,f.slug,
          count(distinct w.id) work_count
        from public.fandoms f
        join public.work_fandoms wf on wf.fandom_id=f.id
        join public.works w on w.id=wf.work_id
        cross join params p
        where f.name::text ilike '%'||p.q||'%'
          and w.deleted_at is null and w.visibility='PUBLIC' and w.status<>'DRAFT'
        group by f.id,f.name,f.slug
        order by work_count desc,f.name
        limit (select lim from params)
      ) x
    ),'[]'::jsonb),
    'tags',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.work_count desc,x.name)
      from (
        select t.id,t.name::text name,t.slug,t.type,
          count(distinct w.id) work_count
        from public.tags t
        join public.work_tags wt on wt.tag_id=t.id
        join public.works w on w.id=wt.work_id
        cross join params p
        where t.name::text ilike '%'||p.q||'%'
          and w.deleted_at is null and w.visibility='PUBLIC' and w.status<>'DRAFT'
        group by t.id,t.name,t.slug,t.type
        order by work_count desc,t.name
        limit (select lim from params)
      ) x
    ),'[]'::jsonb)
  ) end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Discovery 2.0 recommendation scoring
-- -----------------------------------------------------------------------------

create or replace function public.discovery_feed(
  feed_mode text default 'RECOMMENDED',
  limit_count integer default 24,
  offset_count integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  mode text:=upper(coalesce(feed_mode,'RECOMMENDED'));
  result jsonb;
begin
  if mode='RECENT' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'work',to_jsonb(x)||jsonb_build_object(
        'bookmarked',uid is not null and exists(select 1 from public.bookmarks b where b.user_id=uid and b.work_id=x.id)
      ),
      'reason','Recém-publicada',
      'reason_code','RECENT'
    ) order by x.published_at desc),'[]'::jsonb)
    into result
    from (
      select wc.*
      from public.public_work_cards wc
      where wc.visibility='PUBLIC' and wc.status<>'DRAFT'
        and wc.published_at is not null
        and public.can_read_work(wc.id)
      order by wc.published_at desc
      limit greatest(1,least(limit_count,50))
      offset greatest(0,offset_count)
    ) x;
    return result;
  end if;

  if mode='FOLLOWING' and uid is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'work',to_jsonb(x)||jsonb_build_object(
        'bookmarked',exists(select 1 from public.bookmarks b where b.user_id=uid and b.work_id=x.id)
      ),
      'reason','De um autor que você segue',
      'reason_code','FOLLOWING'
    ) order by x.updated_at desc),'[]'::jsonb)
    into result
    from (
      select wc.*
      from public.public_work_cards wc
      where wc.visibility='PUBLIC' and wc.status<>'DRAFT'
        and public.can_read_work(wc.id)
        and exists(
          select 1 from public.user_subscriptions us
          where us.subscriber_id=uid and us.author_id=wc.creator_id
        )
      order by wc.updated_at desc
      limit greatest(1,least(limit_count,50))
      offset greatest(0,offset_count)
    ) x;
    return result;
  end if;

  with interest_sources as (
    select b.work_id,3::numeric weight from public.bookmarks b where b.user_id=uid
    union all
    select le.work_id,
      case le.state when 'FAVORITE' then 4 when 'COMPLETED' then 2.5 when 'READING' then 2 else 1 end
    from public.library_entries le where le.user_id=uid
    union all
    select rh.work_id,1.5::numeric from public.reading_history rh where rh.user_id=uid
  ),
  interest_tags as (
    select wt.tag_id,sum(i.weight) weight
    from public.work_tags wt
    join interest_sources i on i.work_id=wt.work_id
    group by wt.tag_id
  ),
  interest_fandoms as (
    select wf.fandom_id,sum(i.weight) weight
    from public.work_fandoms wf
    join interest_sources i on i.work_id=wf.work_id
    group by wf.fandom_id
  ),
  scored as (
    select wc.*,
      (
        case when uid is not null and exists(
          select 1 from public.user_subscriptions us
          where us.subscriber_id=uid and us.author_id=wc.creator_id
        ) then 95 else 0 end
        + coalesce((
          select sum(it.weight)*10
          from public.work_tags wt
          join interest_tags it on it.tag_id=wt.tag_id
          where wt.work_id=wc.id
        ),0)
        + coalesce((
          select sum(ifd.weight)*14
          from public.work_fandoms wf
          join interest_fandoms ifd on ifd.fandom_id=wf.fandom_id
          where wf.work_id=wc.id
        ),0)
        + ln(1+greatest(wc.kudos_count,0))*2.2
        + ln(1+greatest(wc.bookmarks_count,0))*2.5
        + ln(1+greatest(wc.comments_count,0))*1.4
        + greatest(0,24-extract(epoch from (now()-coalesce(wc.published_at,wc.updated_at)))/86400)::numeric
        + case
            when wc.hits_count<100 and wc.kudos_count<20 then 9
            when wc.hits_count<500 then 4
            else 0
          end
      ) score,
      case
        when uid is not null and exists(
          select 1 from public.user_subscriptions us
          where us.subscriber_id=uid and us.author_id=wc.creator_id
        ) then 'De um autor que você segue'
        when exists(
          select 1 from public.work_fandoms wf
          join interest_fandoms ifd on ifd.fandom_id=wf.fandom_id
          where wf.work_id=wc.id
        ) then 'De um fandom que aparece nas suas leituras'
        when exists(
          select 1 from public.work_tags wt
          join interest_tags it on it.tag_id=wt.tag_id
          where wt.work_id=wc.id
        ) then 'Combina com tags que você costuma ler'
        when wc.hits_count<100 and wc.kudos_count<20 then 'Uma descoberta fora do óbvio'
        else 'Em destaque no arquivo'
      end reason,
      case
        when uid is not null and exists(
          select 1 from public.user_subscriptions us
          where us.subscriber_id=uid and us.author_id=wc.creator_id
        ) then 'FOLLOWING'
        when exists(
          select 1 from public.work_fandoms wf
          join interest_fandoms ifd on ifd.fandom_id=wf.fandom_id
          where wf.work_id=wc.id
        ) then 'FANDOM'
        when exists(
          select 1 from public.work_tags wt
          join interest_tags it on it.tag_id=wt.tag_id
          where wt.work_id=wc.id
        ) then 'TAG'
        when wc.hits_count<100 and wc.kudos_count<20 then 'DISCOVERY'
        else 'COMMUNITY'
      end reason_code
    from public.public_work_cards wc
    where wc.visibility='PUBLIC' and wc.status<>'DRAFT'
      and public.can_read_work(wc.id)
      and (
        uid is null
        or not exists(
          select 1 from public.reading_history rh
          where rh.user_id=uid and rh.work_id=wc.id and rh.last_read_at>=now()-interval '30 days'
        )
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'work',(to_jsonb(x)-'score'-'reason'-'reason_code')||jsonb_build_object(
      'bookmarked',uid is not null and exists(select 1 from public.bookmarks b where b.user_id=uid and b.work_id=x.id)
    ),
    'reason',x.reason,
    'reason_code',x.reason_code
  ) order by x.score desc,x.updated_at desc),'[]'::jsonb)
  into result
  from (
    select *
    from scored
    order by score desc,updated_at desc
    limit greatest(1,least(limit_count,50))
    offset greatest(0,offset_count)
  ) x;

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Personalized home
-- -----------------------------------------------------------------------------

create or replace function public.personalized_home(limit_count integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  lim integer:=greatest(3,least(coalesce(limit_count,8),16));
  result jsonb;
begin
  select jsonb_build_object(
    'viewer',jsonb_build_object(
      'authenticated',uid is not null,
      'library_count',case when uid is null then 0 else (select count(*) from public.library_entries le where le.user_id=uid) end,
      'unread_notifications',case when uid is null then 0 else (select count(*) from public.notifications n where n.user_id=uid and n.read_at is null) end
    ),
    'stats',public.platform_stats(),
    'continue_reading',case when uid is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(x) order by x.last_read_at desc)
      from (
        select wc.*,rh.chapter_id last_chapter_id,rh.progress_percent progress,rh.last_read_at
        from public.reading_history rh
        join public.public_work_cards wc on wc.id=rh.work_id
        where rh.user_id=uid
          and rh.completed=false
          and public.can_read_work(wc.id)
        order by rh.last_read_at desc
        limit lim
      ) x
    ),'[]'::jsonb) end,
    'recommended',public.discovery_feed('RECOMMENDED',lim,0),
    'following',case when uid is null then '[]'::jsonb else public.discovery_feed('FOLLOWING',lim,0) end,
    'recent',public.discovery_feed('RECENT',lim,0),
    'fandoms',coalesce((
      select jsonb_agg(to_jsonb(f))
      from public.active_fandoms(lim) f
    ),'[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Fandom / taxonomy hub expansion
-- -----------------------------------------------------------------------------

create or replace function public.get_taxonomy_page(
  target_slug text,
  target_kind text default 'FANDOM'
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
        'id',f.id,'name',f.name::text,'slug',f.slug,'description',f.description,'kind','FANDOM'
      ),
      'stats',jsonb_build_object(
        'works',(select count(distinct wf2.work_id) from public.work_fandoms wf2 join public.works w2 on w2.id=wf2.work_id where wf2.fandom_id=f.id and w2.visibility='PUBLIC' and w2.status<>'DRAFT' and w2.deleted_at is null),
        'words',(select coalesce(sum(w2.word_count),0) from public.work_fandoms wf2 join public.works w2 on w2.id=wf2.work_id where wf2.fandom_id=f.id and w2.visibility='PUBLIC' and w2.status<>'DRAFT' and w2.deleted_at is null),
        'kudos',(select coalesce(sum(w2.kudos_count),0) from public.work_fandoms wf2 join public.works w2 on w2.id=wf2.work_id where wf2.fandom_id=f.id and w2.visibility='PUBLIC' and w2.status<>'DRAFT' and w2.deleted_at is null),
        'authors',(select count(distinct w2.creator_id) from public.work_fandoms wf2 join public.works w2 on w2.id=wf2.work_id where wf2.fandom_id=f.id and w2.visibility='PUBLIC' and w2.status<>'DRAFT' and w2.deleted_at is null)
      ),
      'works',coalesce((
        select jsonb_agg(to_jsonb(wc) order by wc.updated_at desc)
        from public.work_fandoms wf
        join public.public_work_cards wc on wc.id=wf.work_id
        where wf.fandom_id=f.id and wc.visibility='PUBLIC' and wc.status<>'DRAFT'
      ),'[]'::jsonb),
      'related',coalesce((
        select jsonb_agg(to_jsonb(x) order by x.work_count desc,x.name)
        from (
          select t.id,t.name::text name,t.slug,t.type,count(distinct wt.work_id) work_count
          from public.work_fandoms wf
          join public.work_tags wt on wt.work_id=wf.work_id
          join public.tags t on t.id=wt.tag_id
          where wf.fandom_id=f.id
          group by t.id,t.name,t.slug,t.type
          order by work_count desc,t.name
          limit 16
        ) x
      ),'[]'::jsonb),
      'authors',coalesce((
        select jsonb_agg(to_jsonb(x) order by x.work_count desc,x.display_name)
        from (
          select p.id,p.username::text username,coalesce(p.display_name,p.username::text) display_name,p.avatar_url,
            count(distinct w.id) work_count
          from public.work_fandoms wf
          join public.works w on w.id=wf.work_id
          join public.profiles p on p.id=w.creator_id
          where wf.fandom_id=f.id
            and w.visibility='PUBLIC' and w.status<>'DRAFT' and w.deleted_at is null
            and p.status='ACTIVE'
          group by p.id,p.username,p.display_name,p.avatar_url
          order by work_count desc,p.updated_at desc
          limit 10
        ) x
      ),'[]'::jsonb)
    )
    into result
    from public.fandoms f
    where f.slug=target_slug;
  else
    select jsonb_build_object(
      'taxonomy',jsonb_build_object(
        'id',t.id,'name',t.name::text,'slug',t.slug,'description',t.description,'kind',t.type
      ),
      'stats',jsonb_build_object(
        'works',(select count(distinct wt2.work_id) from public.work_tags wt2 join public.works w2 on w2.id=wt2.work_id where wt2.tag_id=t.id and w2.visibility='PUBLIC' and w2.status<>'DRAFT' and w2.deleted_at is null),
        'words',(select coalesce(sum(w2.word_count),0) from public.work_tags wt2 join public.works w2 on w2.id=wt2.work_id where wt2.tag_id=t.id and w2.visibility='PUBLIC' and w2.status<>'DRAFT' and w2.deleted_at is null),
        'kudos',(select coalesce(sum(w2.kudos_count),0) from public.work_tags wt2 join public.works w2 on w2.id=wt2.work_id where wt2.tag_id=t.id and w2.visibility='PUBLIC' and w2.status<>'DRAFT' and w2.deleted_at is null)
      ),
      'works',coalesce((
        select jsonb_agg(to_jsonb(wc) order by wc.updated_at desc)
        from public.work_tags wt
        join public.public_work_cards wc on wc.id=wt.work_id
        where wt.tag_id=t.id and wc.visibility='PUBLIC' and wc.status<>'DRAFT'
      ),'[]'::jsonb),
      'related',coalesce((
        select jsonb_agg(to_jsonb(x) order by x.work_count desc,x.name)
        from (
          select t2.id,t2.name::text name,t2.slug,t2.type,count(distinct wt2.work_id) work_count
          from public.work_tags source
          join public.work_tags wt2 on wt2.work_id=source.work_id and wt2.tag_id<>source.tag_id
          join public.tags t2 on t2.id=wt2.tag_id
          where source.tag_id=t.id
          group by t2.id,t2.name,t2.slug,t2.type
          order by work_count desc,t2.name
          limit 16
        ) x
      ),'[]'::jsonb),
      'fandoms',coalesce((
        select jsonb_agg(to_jsonb(x) order by x.work_count desc,x.name)
        from (
          select f.id,f.name::text name,f.slug,count(distinct wf.work_id) work_count
          from public.work_tags source
          join public.work_fandoms wf on wf.work_id=source.work_id
          join public.fandoms f on f.id=wf.fandom_id
          where source.tag_id=t.id
          group by f.id,f.name,f.slug
          order by work_count desc,f.name
          limit 12
        ) x
      ),'[]'::jsonb)
    )
    into result
    from public.tags t
    where t.slug=target_slug and (kind='TAG' or t.type=kind);
  end if;

  if result is null then raise exception 'TAXONOMY_NOT_FOUND' using errcode='P0002'; end if;
  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Public profile payload 2.0
-- -----------------------------------------------------------------------------

create or replace function public.get_public_profile(profile_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  target public.profiles%rowtype;
  viewer uuid:=auth.uid();
  result jsonb;
begin
  select * into target
  from public.profiles p
  where p.username=btrim(profile_username)
    and p.status='ACTIVE'
  limit 1;

  if target.id is null then raise exception 'PROFILE_NOT_FOUND' using errcode='P0002'; end if;

  if viewer is not null and viewer<>target.id and exists(
    select 1 from public.user_blocks b
    where (b.blocker_id=viewer and b.blocked_id=target.id)
       or (b.blocker_id=target.id and b.blocked_id=viewer)
  ) then
    raise exception 'PROFILE_BLOCKED' using errcode='42501';
  end if;

  select jsonb_build_object(
    'profile',jsonb_build_object(
      'id',target.id,
      'username',target.username::text,
      'display_name',target.display_name,
      'bio',target.bio,
      'role',target.role,
      'avatar_url',target.avatar_url,
      'banner_url',target.banner_url,
      'website_url',target.website_url,
      'location',target.location,
      'favorite_fandoms',target.favorite_fandoms,
      'featured_work_id',target.featured_work_id,
      'created_at',target.created_at
    ),
    'stats',jsonb_build_object(
      'works',count(*) filter(where w.id is not null),
      'words',coalesce(sum(w.word_count),0),
      'hits',coalesce(sum(w.hits_count),0),
      'kudos',coalesce(sum(w.kudos_count),0),
      'followers',(select count(*) from public.user_subscriptions us where us.author_id=target.id),
      'following',(select count(*) from public.user_subscriptions us where us.subscriber_id=target.id)
    ),
    'viewer',jsonb_build_object(
      'is_self',viewer=target.id,
      'following',viewer is not null and exists(
        select 1 from public.user_subscriptions us
        where us.subscriber_id=viewer and us.author_id=target.id
      ),
      'blocked',viewer is not null and exists(
        select 1 from public.user_blocks ub
        where ub.blocker_id=viewer and ub.blocked_id=target.id
      )
    ),
    'works',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select wc.*
        from public.public_work_cards wc
        where wc.creator_id=target.id
          and wc.visibility='PUBLIC'
          and wc.status<>'DRAFT'
        order by wc.updated_at desc
      ) x
    ),'[]'::jsonb),
    'featured_work',(
      select to_jsonb(wc)
      from public.public_work_cards wc
      where wc.id=target.featured_work_id
        and wc.visibility='PUBLIC'
        and wc.status<>'DRAFT'
      limit 1
    ),
    'series',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'title',s.title,'summary',s.summary,'slug',s.slug,'updated_at',s.updated_at,
        'work_count',(select count(*) from public.series_works sw where sw.series_id=s.id)
      ) order by s.updated_at desc)
      from public.series s
      where s.owner_id=target.id and s.visibility='PUBLIC'
    ),'[]'::jsonb),
    'collections',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'name',c.name,'description',c.description,'slug',c.slug,'updated_at',c.updated_at,
        'work_count',(select count(*) from public.collection_works cw where cw.collection_id=c.id)
      ) order by c.updated_at desc)
      from public.collections c
      where c.owner_id=target.id and c.visibility='PUBLIC'
    ),'[]'::jsonb)
  )
  into result
  from public.works w
  where w.creator_id=target.id
    and w.deleted_at is null
    and w.visibility='PUBLIC'
    and w.status<>'DRAFT';

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Admin Center 2.0: feature flags and health
-- -----------------------------------------------------------------------------

create table if not exists public.platform_feature_flags (
  key varchar(80) primary key,
  enabled boolean not null default false,
  description varchar(300),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_feature_flags(key,enabled,description)
values
  ('discovery_v2',true,'Discovery 2.0 e recomendações transparentes'),
  ('personalized_home',true,'Home personalizada por leitura e autores seguidos'),
  ('profile_v2',true,'Perfis enriquecidos com banner, avatar e destaques'),
  ('fandom_hubs',true,'Hubs expandidos de fandoms e taxonomias'),
  ('saved_searches',true,'Filtros e buscas salvos por usuário')
on conflict(key) do nothing;

alter table public.platform_feature_flags enable row level security;
revoke all on public.platform_feature_flags from anon,authenticated;

create or replace function public.public_feature_flags()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce(jsonb_object_agg(key,enabled),'{}'::jsonb)
  from public.platform_feature_flags;
$$;

create or replace function public.admin_feature_flags()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'key',f.key,'enabled',f.enabled,'description',f.description,'updated_at',f.updated_at
    ) order by f.key)
    from public.platform_feature_flags f
  ),'[]'::jsonb);
end;
$$;

create or replace function public.admin_set_feature_flag(flag_key text,next_enabled boolean)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode='42501'; end if;

  update public.platform_feature_flags
  set enabled=coalesce(next_enabled,false),updated_by=auth.uid(),updated_at=now()
  where key=flag_key;

  if not found then raise exception 'FEATURE_FLAG_NOT_FOUND' using errcode='P0002'; end if;

  insert into public.audit_log(actor_user_id,action,entity_type,metadata)
  values(auth.uid(),'FEATURE_FLAG_UPDATED','PLATFORM',jsonb_build_object('key',flag_key,'enabled',coalesce(next_enabled,false)));
end;
$$;

create or replace function public.admin_health_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  latest_migration text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY' using errcode='42501'; end if;

  select max(version) into latest_migration
  from supabase_migrations.schema_migrations;

  return jsonb_build_object(
    'database',jsonb_build_object(
      'size_bytes',pg_database_size(current_database()),
      'public_tables',(select count(*) from pg_tables where schemaname='public'),
      'public_functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
      'latest_migration',latest_migration
    ),
    'security',jsonb_build_object(
      'rls_tables_without_policies',(
        select count(*)
        from pg_class c
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and c.relrowsecurity
          and not exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)
      ),
      'suspended_users',(select count(*) from public.profiles where status='SUSPENDED'),
      'rate_events_1h',(select count(*) from public.rate_limit_events where created_at>=now()-interval '1 hour')
    ),
    'content',jsonb_build_object(
      'public_works',(select count(*) from public.works where deleted_at is null and visibility='PUBLIC' and status<>'DRAFT'),
      'open_reports',(select count(*) from public.reports where status in ('OPEN','REVIEWING')),
      'scheduled_chapters',(select count(*) from public.chapters where status='SCHEDULED' and scheduled_for is not null)
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Grants
-- -----------------------------------------------------------------------------

revoke execute on function public.update_profile_v2(text,text,text,text,text,text,text[],uuid) from public,anon;
revoke execute on function public.saved_searches_list() from public,anon;
revoke execute on function public.saved_search_upsert(uuid,text,text,jsonb) from public,anon;
revoke execute on function public.saved_search_delete(uuid) from public,anon;
revoke execute on function public.admin_feature_flags() from public,anon;
revoke execute on function public.admin_set_feature_flag(text,boolean) from public,anon;
revoke execute on function public.admin_health_summary() from public,anon;

grant execute on function public.update_profile_v2(text,text,text,text,text,text,text[],uuid) to authenticated;
grant execute on function public.saved_searches_list() to authenticated;
grant execute on function public.saved_search_upsert(uuid,text,text,jsonb) to authenticated;
grant execute on function public.saved_search_delete(uuid) to authenticated;
grant execute on function public.search_suggestions(text,integer) to anon,authenticated;
grant execute on function public.personalized_home(integer) to anon,authenticated;
grant execute on function public.public_feature_flags() to anon,authenticated;
grant execute on function public.admin_feature_flags() to authenticated;
grant execute on function public.admin_set_feature_flag(text,boolean) to authenticated;
grant execute on function public.admin_health_summary() to authenticated;

grant all on public.saved_searches to service_role;
grant all on public.platform_feature_flags to service_role;
