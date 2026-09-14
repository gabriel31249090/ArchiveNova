-- ArchiveNova v4.0 — Comunidade, colaboração, apoio e descoberta
-- Posts, feed transparente, contribuições estilo GitHub, FAQ, apoio por PIX/links e publicidade nativa.

-- -----------------------------------------------------------------------------
-- Works: opt-in de contribuições da comunidade
-- -----------------------------------------------------------------------------

alter table public.works
  add column if not exists allow_contributions boolean not null default false;

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
  ), array[]::text[]) as tags,
  w.allow_contributions
from public.works w
join public.profiles p on p.id = w.creator_id
where w.deleted_at is null;

-- -----------------------------------------------------------------------------
-- Community posts (estilo posts da comunidade)
-- -----------------------------------------------------------------------------

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 12000),
  image_urls text[] not null default array[]::text[],
  poll_question varchar(300),
  visibility varchar(20) not null default 'PUBLIC' check (visibility in ('PUBLIC','FOLLOWERS')),
  comments_enabled boolean not null default true,
  likes_count bigint not null default 0 check (likes_count >= 0),
  comments_count bigint not null default 0 check (comments_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (char_length(btrim(body)) > 0 or cardinality(image_urls) > 0 or poll_question is not null)
);

create table if not exists public.post_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  option_text varchar(180) not null,
  position smallint not null check (position between 1 and 8),
  vote_count bigint not null default 0 check (vote_count >= 0),
  unique(post_id, position)
);

create table if not exists public.post_poll_votes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  option_id uuid not null references public.post_poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id, user_id)
);

create table if not exists public.post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.post_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  status varchar(20) not null default 'VISIBLE' check (status in ('VISIBLE','HIDDEN','DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_author_created on public.community_posts(author_id, created_at desc);
create index if not exists community_posts_public_created on public.community_posts(created_at desc) where deleted_at is null;
create index if not exists post_comments_post_created on public.post_comments(post_id, created_at desc);

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
    where cp.id = target_post
      and cp.deleted_at is null
      and (
        cp.author_id = auth.uid()
        or cp.visibility = 'PUBLIC'
        or (
          cp.visibility = 'FOLLOWERS'
          and auth.uid() is not null
          and exists (
            select 1 from public.user_subscriptions us
            where us.subscriber_id = auth.uid() and us.author_id = cp.author_id
          )
        )
      )
      and (
        auth.uid() is null
        or cp.author_id = auth.uid()
        or not exists (
          select 1 from public.user_blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = cp.author_id)
             or (b.blocker_id = cp.author_id and b.blocked_id = auth.uid())
        )
      )
  );
$$;

alter table public.community_posts enable row level security;
alter table public.post_poll_options enable row level security;
alter table public.post_poll_votes enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

drop policy if exists community_posts_read on public.community_posts;
create policy community_posts_read on public.community_posts for select to anon, authenticated
  using (public.can_read_post(id));
drop policy if exists community_posts_owner_write on public.community_posts;
create policy community_posts_owner_write on public.community_posts for all to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists poll_options_read on public.post_poll_options;
create policy poll_options_read on public.post_poll_options for select to anon, authenticated
  using (public.can_read_post(post_id));
drop policy if exists poll_options_owner_write on public.post_poll_options;
create policy poll_options_owner_write on public.post_poll_options for all to authenticated
  using (exists(select 1 from public.community_posts p where p.id=post_id and p.author_id=auth.uid()))
  with check (exists(select 1 from public.community_posts p where p.id=post_id and p.author_id=auth.uid()));

drop policy if exists poll_votes_read on public.post_poll_votes;
create policy poll_votes_read on public.post_poll_votes for select to authenticated
  using (user_id = auth.uid() or public.can_read_post(post_id));
drop policy if exists poll_votes_self_insert on public.post_poll_votes;
create policy poll_votes_self_insert on public.post_poll_votes for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_post(post_id) and exists(select 1 from public.post_poll_options o where o.id=option_id and o.post_id=post_id));
drop policy if exists poll_votes_self_delete on public.post_poll_votes;
create policy poll_votes_self_delete on public.post_poll_votes for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists post_likes_read on public.post_likes;
create policy post_likes_read on public.post_likes for select to authenticated using (public.can_read_post(post_id));
drop policy if exists post_likes_self_insert on public.post_likes;
create policy post_likes_self_insert on public.post_likes for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_post(post_id));
drop policy if exists post_likes_self_delete on public.post_likes;
create policy post_likes_self_delete on public.post_likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists post_comments_read on public.post_comments;
create policy post_comments_read on public.post_comments for select to anon, authenticated
  using (status='VISIBLE' and public.can_read_post(post_id));
drop policy if exists post_comments_self_insert on public.post_comments;
create policy post_comments_self_insert on public.post_comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_read_post(post_id)
    and exists(select 1 from public.community_posts p where p.id=post_id and p.comments_enabled)
  );
drop policy if exists post_comments_self_update on public.post_comments;
create policy post_comments_self_update on public.post_comments for update to authenticated
  using (user_id=auth.uid() or public.is_staff()) with check (user_id=auth.uid() or public.is_staff());

drop trigger if exists community_posts_updated_at on public.community_posts;
create trigger community_posts_updated_at before update on public.community_posts
for each row execute function public.set_updated_at();
drop trigger if exists post_comments_updated_at on public.post_comments;
create trigger post_comments_updated_at before update on public.post_comments
for each row execute function public.set_updated_at();

create or replace function public.sync_post_like_counter()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    update public.community_posts set likes_count=likes_count+1 where id=new.post_id;
    return new;
  else
    update public.community_posts set likes_count=greatest(0,likes_count-1) where id=old.post_id;
    return old;
  end if;
end;$$;

drop trigger if exists post_likes_counter on public.post_likes;
create trigger post_likes_counter after insert or delete on public.post_likes
for each row execute function public.sync_post_like_counter();

create or replace function public.sync_post_comment_counter()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' and new.status='VISIBLE' then
    update public.community_posts set comments_count=comments_count+1 where id=new.post_id;
  elsif tg_op='DELETE' and old.status='VISIBLE' then
    update public.community_posts set comments_count=greatest(0,comments_count-1) where id=old.post_id;
  elsif tg_op='UPDATE' and old.status<>new.status then
    update public.community_posts set comments_count=greatest(0,comments_count + case when new.status='VISIBLE' then 1 else -1 end) where id=new.post_id;
  end if;
  return coalesce(new,old);
end;$$;

drop trigger if exists post_comments_counter on public.post_comments;
create trigger post_comments_counter after insert or update of status or delete on public.post_comments
for each row execute function public.sync_post_comment_counter();

create or replace function public.sync_poll_vote_counter()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    update public.post_poll_options set vote_count=vote_count+1 where id=new.option_id;
    return new;
  else
    update public.post_poll_options set vote_count=greatest(0,vote_count-1) where id=old.option_id;
    return old;
  end if;
end;$$;

drop trigger if exists poll_vote_counter on public.post_poll_votes;
create trigger poll_vote_counter after insert or delete on public.post_poll_votes
for each row execute function public.sync_poll_vote_counter();

create or replace function public.create_community_post(
  post_body text,
  post_images text[] default array[]::text[],
  post_visibility text default 'PUBLIC',
  poll_question_input text default null,
  poll_options_input text[] default array[]::text[]
)
returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  post_id uuid;
  option_text text;
  pos int:=0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if post_visibility not in ('PUBLIC','FOLLOWERS') then raise exception 'INVALID_VISIBILITY'; end if;
  if char_length(coalesce(post_body,'')) > 12000 then raise exception 'POST_TOO_LONG'; end if;
  if cardinality(coalesce(post_images,array[]::text[])) > 4 then raise exception 'TOO_MANY_IMAGES'; end if;
  if poll_question_input is not null and cardinality(coalesce(poll_options_input,array[]::text[])) not between 2 and 8 then
    raise exception 'POLL_REQUIRES_2_TO_8_OPTIONS';
  end if;
  if btrim(coalesce(post_body,''))='' and cardinality(coalesce(post_images,array[]::text[]))=0 and poll_question_input is null then
    raise exception 'EMPTY_POST';
  end if;

  insert into public.community_posts(author_id,body,image_urls,poll_question,visibility)
  values(uid,left(coalesce(post_body,''),12000),coalesce(post_images,array[]::text[]),nullif(left(btrim(coalesce(poll_question_input,'')),300),''),post_visibility)
  returning id into post_id;

  if poll_question_input is not null then
    foreach option_text in array poll_options_input loop
      pos:=pos+1;
      insert into public.post_poll_options(post_id,option_text,position)
      values(post_id,left(btrim(option_text),180),pos);
    end loop;
  end if;

  return post_id;
end;$$;

create or replace function public.toggle_post_like(target_post uuid)
returns boolean
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare uid uuid:=auth.uid(); begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not public.can_read_post(target_post) then raise exception 'POST_NOT_FOUND' using errcode='P0002'; end if;
  if exists(select 1 from public.post_likes where post_id=target_post and user_id=uid) then
    delete from public.post_likes where post_id=target_post and user_id=uid;
    return false;
  end if;
  insert into public.post_likes(post_id,user_id) values(target_post,uid);
  return true;
end;$$;

create or replace function public.vote_post_poll(target_post uuid,target_option uuid)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare uid uuid:=auth.uid(); begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.post_poll_options o where o.id=target_option and o.post_id=target_post) then raise exception 'OPTION_NOT_FOUND'; end if;
  if not public.can_read_post(target_post) then raise exception 'POST_NOT_FOUND' using errcode='P0002'; end if;
  delete from public.post_poll_votes where post_id=target_post and user_id=uid;
  insert into public.post_poll_votes(post_id,option_id,user_id) values(target_post,target_option,uid);
end;$$;

create or replace function public.community_post_feed(
  feed_mode text default 'RECENT',
  limit_count integer default 20,
  offset_count integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(feed_row) order by feed_row.rank_score desc, feed_row.created_at desc),'[]'::jsonb)
  from (
    select
      cp.id,
      cp.author_id,
      p.username::text author_username,
      coalesce(p.display_name,p.username::text) author_display_name,
      cp.body,
      cp.image_urls,
      cp.poll_question,
      cp.visibility,
      cp.comments_enabled,
      cp.likes_count,
      cp.comments_count,
      cp.created_at,
      cp.updated_at,
      (auth.uid() is not null and exists(select 1 from public.post_likes pl where pl.post_id=cp.id and pl.user_id=auth.uid())) as liked,
      (select pv.option_id from public.post_poll_votes pv where pv.post_id=cp.id and pv.user_id=auth.uid() limit 1) as viewer_poll_option,
      coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'text',o.option_text,'position',o.position,'votes',o.vote_count) order by o.position) from public.post_poll_options o where o.post_id=cp.id),'[]'::jsonb) as poll_options,
      (
        case when upper(feed_mode)='FOLLOWING' and exists(select 1 from public.user_subscriptions us where us.subscriber_id=auth.uid() and us.author_id=cp.author_id) then 1000 else 0 end
        + case when exists(select 1 from public.user_subscriptions us where us.subscriber_id=auth.uid() and us.author_id=cp.author_id) then 120 else 0 end
        + least(cp.likes_count,500)::numeric * .08
        + least(cp.comments_count,300)::numeric * .12
        + greatest(0,30 - extract(epoch from (now()-cp.created_at))/86400)::numeric
      ) as rank_score
    from public.community_posts cp
    join public.profiles p on p.id=cp.author_id and p.status='ACTIVE'
    where cp.deleted_at is null
      and public.can_read_post(cp.id)
      and (upper(feed_mode)<>'FOLLOWING' or exists(select 1 from public.user_subscriptions us where us.subscriber_id=auth.uid() and us.author_id=cp.author_id))
    order by
      case when upper(feed_mode)='RECENT' then extract(epoch from cp.created_at) else (
        case when exists(select 1 from public.user_subscriptions us where us.subscriber_id=auth.uid() and us.author_id=cp.author_id) then 120 else 0 end
        + least(cp.likes_count,500)::numeric*.08
        + least(cp.comments_count,300)::numeric*.12
        + greatest(0,30-extract(epoch from (now()-cp.created_at))/86400)::numeric
      ) end desc,
      cp.created_at desc
    limit greatest(1,least(limit_count,50)) offset greatest(0,offset_count)
  ) feed_row;
$$;

-- -----------------------------------------------------------------------------
-- Colaboração e contribuições estilo GitHub
-- -----------------------------------------------------------------------------

create table if not exists public.work_collaborators (
  work_id uuid not null references public.works(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role varchar(20) not null default 'REVIEWER' check (role in ('EDITOR','REVIEWER')),
  status varchar(20) not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED')),
  invited_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key(work_id,user_id)
);

create table if not exists public.work_contributions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  contribution_type varchar(30) not null check (contribution_type in ('NEW_CHAPTER','CHAPTER_EDIT')),
  title varchar(220) not null,
  proposed_chapter_title varchar(300),
  proposed_content text not null,
  note text,
  status varchar(30) not null default 'OPEN' check (status in ('OPEN','CHANGES_REQUESTED','ACCEPTED','REJECTED','WITHDRAWN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  merged_at timestamptz,
  merged_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.contribution_reviews (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.work_contributions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  verdict varchar(30) not null default 'COMMENT' check (verdict in ('COMMENT','APPROVE','REQUEST_CHANGES')),
  body text not null check (char_length(body) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index if not exists work_contributions_work_status on public.work_contributions(work_id,status,created_at desc);
create index if not exists work_contributions_user_created on public.work_contributions(contributor_id,created_at desc);

drop trigger if exists work_contributions_updated_at on public.work_contributions;
create trigger work_contributions_updated_at before update on public.work_contributions
for each row execute function public.set_updated_at();

create or replace function public.can_manage_collaboration(target_work uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(select 1 from public.works w where w.id=target_work and w.creator_id=auth.uid() and w.deleted_at is null)
    or exists(select 1 from public.work_collaborators c where c.work_id=target_work and c.user_id=auth.uid() and c.status='ACCEPTED' and c.role in ('EDITOR','REVIEWER'));
$$;

alter table public.work_collaborators enable row level security;
alter table public.work_contributions enable row level security;
alter table public.contribution_reviews enable row level security;

drop policy if exists collaborators_read on public.work_collaborators;
create policy collaborators_read on public.work_collaborators for select to authenticated
  using (user_id=auth.uid() or public.can_manage_collaboration(work_id));
drop policy if exists collaborators_owner_write on public.work_collaborators;
create policy collaborators_owner_write on public.work_collaborators for all to authenticated
  using (exists(select 1 from public.works w where w.id=work_id and w.creator_id=auth.uid()))
  with check (exists(select 1 from public.works w where w.id=work_id and w.creator_id=auth.uid()));

drop policy if exists contributions_read on public.work_contributions;
create policy contributions_read on public.work_contributions for select to authenticated
  using (contributor_id=auth.uid() or public.can_manage_collaboration(work_id));
drop policy if exists contributions_submit on public.work_contributions;
create policy contributions_submit on public.work_contributions for insert to authenticated
  with check (
    contributor_id=auth.uid()
    and status='OPEN'
    and exists(select 1 from public.works w where w.id=work_id and w.deleted_at is null and (w.allow_contributions or w.creator_id=auth.uid()))
  );
drop policy if exists contributions_author_update on public.work_contributions;
create policy contributions_author_update on public.work_contributions for update to authenticated
  using (contributor_id=auth.uid() and status in ('OPEN','CHANGES_REQUESTED'))
  with check (contributor_id=auth.uid() and status in ('OPEN','CHANGES_REQUESTED','WITHDRAWN'));

drop policy if exists contribution_reviews_read on public.contribution_reviews;
create policy contribution_reviews_read on public.contribution_reviews for select to authenticated
  using (exists(select 1 from public.work_contributions c where c.id=contribution_id and (c.contributor_id=auth.uid() or public.can_manage_collaboration(c.work_id))));
drop policy if exists contribution_reviews_insert on public.contribution_reviews;
create policy contribution_reviews_insert on public.contribution_reviews for insert to authenticated
  with check (reviewer_id=auth.uid() and exists(select 1 from public.work_contributions c where c.id=contribution_id and public.can_manage_collaboration(c.work_id)));

create or replace function public.set_work_contributions_open(target_work uuid, is_open boolean)
returns boolean language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  update public.works set allow_contributions=is_open where id=target_work and creator_id=auth.uid() and deleted_at is null;
  if not found then raise exception 'WORK_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
  return is_open;
end;$$;

create or replace function public.invite_work_collaborator(target_work uuid, collaborator_username text, collaborator_role text default 'REVIEWER')
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare target_user uuid; begin
  if collaborator_role not in ('EDITOR','REVIEWER') then raise exception 'INVALID_ROLE'; end if;
  if not exists(select 1 from public.works where id=target_work and creator_id=auth.uid() and deleted_at is null) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select id into target_user from public.profiles where username=btrim(collaborator_username) and status='ACTIVE';
  if target_user is null then raise exception 'PROFILE_NOT_FOUND' using errcode='P0002'; end if;
  if target_user=auth.uid() then raise exception 'CANNOT_INVITE_SELF'; end if;
  insert into public.work_collaborators(work_id,user_id,role,status,invited_by)
  values(target_work,target_user,collaborator_role,'PENDING',auth.uid())
  on conflict(work_id,user_id) do update set role=excluded.role,status='PENDING',invited_by=auth.uid(),created_at=now(),accepted_at=null;
  insert into public.notifications(user_id,type,actor_user_id,work_id,payload)
  values(target_user,'COLLAB_INVITE',auth.uid(),target_work,jsonb_build_object('role',collaborator_role));
  return target_user;
end;$$;

create or replace function public.respond_work_invitation(target_work uuid, accept_invite boolean)
returns text language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  update public.work_collaborators
  set status=case when accept_invite then 'ACCEPTED' else 'DECLINED' end,
      accepted_at=case when accept_invite then now() else null end
  where work_id=target_work and user_id=auth.uid() and status='PENDING';
  if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='P0002'; end if;
  return case when accept_invite then 'ACCEPTED' else 'DECLINED' end;
end;$$;

create or replace function public.submit_work_contribution(
  target_work uuid,
  contribution_kind text,
  contribution_title text,
  proposed_content_input text,
  proposed_chapter_title_input text default null,
  target_chapter uuid default null,
  contribution_note text default null
)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); cid uuid; begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if contribution_kind not in ('NEW_CHAPTER','CHAPTER_EDIT') then raise exception 'INVALID_CONTRIBUTION_TYPE'; end if;
  if not exists(select 1 from public.works w where w.id=target_work and w.deleted_at is null and (w.allow_contributions or w.creator_id=uid)) then raise exception 'CONTRIBUTIONS_CLOSED' using errcode='42501'; end if;
  if contribution_kind='CHAPTER_EDIT' and not exists(select 1 from public.chapters c where c.id=target_chapter and c.work_id=target_work) then raise exception 'CHAPTER_NOT_FOUND'; end if;
  if contribution_kind='NEW_CHAPTER' then target_chapter:=null; end if;
  insert into public.work_contributions(work_id,chapter_id,contributor_id,contribution_type,title,proposed_chapter_title,proposed_content,note)
  values(target_work,target_chapter,uid,contribution_kind,left(btrim(contribution_title),220),nullif(left(btrim(coalesce(proposed_chapter_title_input,'')),300),''),proposed_content_input,nullif(btrim(coalesce(contribution_note,'')),'')) returning id into cid;
  insert into public.notifications(user_id,type,actor_user_id,work_id,payload)
  select w.creator_id,'CONTRIBUTION_OPENED',uid,target_work,jsonb_build_object('contribution_id',cid,'title',contribution_title)
  from public.works w where w.id=target_work and w.creator_id<>uid;
  return cid;
end;$$;

create or replace function public.review_work_contribution(target_contribution uuid, review_verdict text, review_body text)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare c public.work_contributions%rowtype; begin
  select * into c from public.work_contributions where id=target_contribution;
  if c.id is null then raise exception 'CONTRIBUTION_NOT_FOUND' using errcode='P0002'; end if;
  if not public.can_manage_collaboration(c.work_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if review_verdict not in ('COMMENT','APPROVE','REQUEST_CHANGES') then raise exception 'INVALID_VERDICT'; end if;
  insert into public.contribution_reviews(contribution_id,reviewer_id,verdict,body)
  values(target_contribution,auth.uid(),review_verdict,left(review_body,12000));
  if review_verdict='REQUEST_CHANGES' then update public.work_contributions set status='CHANGES_REQUESTED' where id=target_contribution and status='OPEN'; end if;
  insert into public.notifications(user_id,type,actor_user_id,work_id,payload)
  values(c.contributor_id,'CONTRIBUTION_REVIEW',auth.uid(),c.work_id,jsonb_build_object('contribution_id',c.id,'verdict',review_verdict));
end;$$;

create or replace function public.merge_work_contribution(target_contribution uuid)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare c public.work_contributions%rowtype; new_chapter uuid; next_number int; begin
  select * into c from public.work_contributions where id=target_contribution for update;
  if c.id is null then raise exception 'CONTRIBUTION_NOT_FOUND' using errcode='P0002'; end if;
  if not exists(select 1 from public.works w where w.id=c.work_id and w.creator_id=auth.uid()) then raise exception 'OWNER_ONLY' using errcode='42501'; end if;
  if c.status not in ('OPEN','CHANGES_REQUESTED') then raise exception 'CONTRIBUTION_CLOSED'; end if;
  if c.contribution_type='CHAPTER_EDIT' then
    update public.chapters set title=coalesce(c.proposed_chapter_title,title),content=c.proposed_content,updated_at=now() where id=c.chapter_id and work_id=c.work_id returning id into new_chapter;
  else
    select coalesce(max(chapter_number),0)+1 into next_number from public.chapters where work_id=c.work_id;
    insert into public.chapters(work_id,chapter_number,title,content,status,published_at)
    values(c.work_id,next_number,c.proposed_chapter_title,c.proposed_content,'PUBLISHED',now()) returning id into new_chapter;
  end if;
  update public.work_contributions set status='ACCEPTED',merged_at=now(),merged_by=auth.uid() where id=c.id;
  insert into public.notifications(user_id,type,actor_user_id,work_id,payload)
  values(c.contributor_id,'CONTRIBUTION_MERGED',auth.uid(),c.work_id,jsonb_build_object('contribution_id',c.id,'chapter_id',new_chapter));
  return new_chapter;
end;$$;

create or replace function public.get_collaboration_hub(target_work uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); w public.works%rowtype; result jsonb; begin
  select * into w from public.works where id=target_work and deleted_at is null;
  if w.id is null then raise exception 'WORK_NOT_FOUND' using errcode='P0002'; end if;
  if uid is null then
    if not w.allow_contributions then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  end if;
  select jsonb_build_object(
    'work',jsonb_build_object('id',w.id,'title',w.title,'creator_id',w.creator_id,'allow_contributions',w.allow_contributions),
    'permissions',jsonb_build_object(
      'is_owner',uid=w.creator_id,
      'can_submit',uid is not null and (w.allow_contributions or uid=w.creator_id),
      'can_review',uid=w.creator_id or exists(select 1 from public.work_collaborators c where c.work_id=w.id and c.user_id=uid and c.status='ACCEPTED'),
      'can_merge',uid=w.creator_id
    ),
    'chapters',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'number',c.chapter_number,'title',c.title) order by c.chapter_number) from public.chapters c where c.work_id=w.id),'[]'::jsonb),
    'collaborators',case when uid=w.creator_id or public.can_manage_collaboration(w.id) then coalesce((
      select jsonb_agg(jsonb_build_object('user_id',c.user_id,'username',p.username::text,'display_name',coalesce(p.display_name,p.username::text),'role',c.role,'status',c.status,'created_at',c.created_at) order by c.created_at)
      from public.work_collaborators c join public.profiles p on p.id=c.user_id where c.work_id=w.id
    ),'[]'::jsonb) else '[]'::jsonb end,
    'contributions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'contributor_id',c.contributor_id,'username',p.username::text,'display_name',coalesce(p.display_name,p.username::text),
        'type',c.contribution_type,'title',c.title,'chapter_id',c.chapter_id,'proposed_chapter_title',c.proposed_chapter_title,'proposed_content',c.proposed_content,
        'note',c.note,'status',c.status,'created_at',c.created_at,'updated_at',c.updated_at,'merged_at',c.merged_at,
        'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reviewer_id',r.reviewer_id,'username',rp.username::text,'display_name',coalesce(rp.display_name,rp.username::text),'verdict',r.verdict,'body',r.body,'created_at',r.created_at) order by r.created_at) from public.contribution_reviews r join public.profiles rp on rp.id=r.reviewer_id where r.contribution_id=c.id),'[]'::jsonb)
      ) order by c.created_at desc)
      from public.work_contributions c join public.profiles p on p.id=c.contributor_id
      where c.work_id=w.id and (c.contributor_id=uid or public.can_manage_collaboration(w.id))
    ),'[]'::jsonb)
  ) into result;
  return result;
end;$$;

create or replace function public.profile_contribution_calendar(profile_username text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare uid uuid; begin
  select id into uid from public.profiles where username=btrim(profile_username) and status='ACTIVE';
  if uid is null then return '[]'::jsonb; end if;
  return coalesce((
    with events as (
      select date(coalesce(c.merged_at,c.updated_at)) day,3 points from public.work_contributions c where c.contributor_id=uid and c.status='ACCEPTED' and coalesce(c.merged_at,c.updated_at)>=current_date-364
      union all
      select date(cp.created_at),1 from public.community_posts cp where cp.author_id=uid and cp.deleted_at is null and cp.created_at>=current_date-364
      union all
      select date(ch.published_at),1 from public.chapters ch join public.works w on w.id=ch.work_id where w.creator_id=uid and ch.status='PUBLISHED' and ch.published_at>=current_date-364
    ), days as (
      select g::date day from generate_series(current_date-364,current_date,'1 day'::interval) g
    ), daily as (
      select d.day,coalesce(sum(e.points),0)::bigint as count
      from days d left join events e on e.day=d.day
      group by d.day
      order by d.day
    )
    select jsonb_agg(jsonb_build_object('date',daily.day,'count',daily.count) order by daily.day) from daily
  ),'[]'::jsonb);
end;$$;

-- -----------------------------------------------------------------------------
-- Apoio a escritores e ao projeto
-- -----------------------------------------------------------------------------

create table if not exists public.creator_support_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  message text,
  pix_key varchar(180),
  pix_receiver_name varchar(25),
  pix_city varchar(15),
  paypal_url text,
  ko_fi_url text,
  mercado_pago_url text,
  other_label varchar(50),
  other_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_support_config (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default false,
  message text,
  pix_key varchar(180),
  pix_receiver_name varchar(25),
  pix_city varchar(15),
  paypal_url text,
  ko_fi_url text,
  mercado_pago_url text,
  other_label varchar(50),
  other_url text,
  updated_at timestamptz not null default now()
);
insert into public.project_support_config(id,enabled,message) values(1,false,'Ajude a manter o Archive Nova independente.') on conflict(id) do nothing;

alter table public.creator_support_profiles enable row level security;
alter table public.project_support_config enable row level security;

drop policy if exists creator_support_public_read on public.creator_support_profiles;
create policy creator_support_public_read on public.creator_support_profiles for select to anon,authenticated using(enabled or user_id=auth.uid());
drop policy if exists creator_support_owner_write on public.creator_support_profiles;
create policy creator_support_owner_write on public.creator_support_profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists project_support_public_read on public.project_support_config;
create policy project_support_public_read on public.project_support_config for select to anon,authenticated using(enabled or public.is_staff());
drop policy if exists project_support_staff_write on public.project_support_config;
create policy project_support_staff_write on public.project_support_config for all to authenticated using(public.is_staff()) with check(public.is_staff());

drop trigger if exists creator_support_updated_at on public.creator_support_profiles;
create trigger creator_support_updated_at before update on public.creator_support_profiles for each row execute function public.set_updated_at();
drop trigger if exists project_support_updated_at on public.project_support_config;
create trigger project_support_updated_at before update on public.project_support_config for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- FAQ
-- -----------------------------------------------------------------------------

create table if not exists public.faq_items (
  id uuid primary key default gen_random_uuid(),
  category varchar(80) not null default 'Geral',
  question varchar(300) not null unique,
  answer text not null,
  position integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.faq_items enable row level security;
drop policy if exists faq_public_read on public.faq_items;
create policy faq_public_read on public.faq_items for select to anon,authenticated using(published or public.is_staff());
drop policy if exists faq_staff_write on public.faq_items;
create policy faq_staff_write on public.faq_items for all to authenticated using(public.is_staff()) with check(public.is_staff());
drop trigger if exists faq_updated_at on public.faq_items;
create trigger faq_updated_at before update on public.faq_items for each row execute function public.set_updated_at();

insert into public.faq_items(category,question,answer,position) values
('Conta','Preciso pagar para usar o Archive Nova?','Não. Ler, escrever, publicar e usar os recursos principais do Archive Nova é gratuito.',10),
('Conta','Por que preciso confirmar meu e-mail?','A confirmação ajuda a proteger sua conta e reduz spam e contas automatizadas.',20),
('Escrita','Meus rascunhos ficam salvos?','Sim. Quando você está conectado, o Writer Cloud salva seus rascunhos na sua conta e mantém uma cópia local de segurança.',30),
('Publicação','Posso editar uma obra depois de publicar?','Sim. O autor pode editar informações, capítulos, ordem dos capítulos e status da obra pelo Creator Studio.',40),
('Comunidade','Como funcionam as contribuições?','O autor pode abrir uma obra para contribuições. Outros usuários enviam propostas; o autor revisa e decide se aceita, pede alterações ou rejeita.',50),
('Apoio','O Archive Nova fica com parte do PIX de um escritor?','Não. Quando o escritor informa um PIX ou link externo, o apoio é feito diretamente entre fã e autor. O Archive Nova não processa nem retém esse pagamento.',60),
('Publicidade','Como os anúncios funcionam?','Anúncios aparecem identificados como Patrocinado. Campanhas precisam ser aprovadas e não alteram o ranking orgânico das histórias.',70),
('Descoberta','Como funciona o feed Para você?','As recomendações usam sinais simples como fandoms e tags que você lê, autores que segue e atividade recente. O Archive Nova mostra o motivo da recomendação sempre que possível.',80)
on conflict(question) do nothing;

-- -----------------------------------------------------------------------------
-- Publicidade nativa
-- -----------------------------------------------------------------------------

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_name varchar(120) not null,
  title varchar(180) not null,
  body text not null default '',
  image_url text,
  target_url text not null,
  placement varchar(30) not null default 'FEED' check (placement in ('FEED','EXPLORE','READER','SIDEBAR')),
  status varchar(20) not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','PAUSED','ENDED')),
  starts_at timestamptz,
  ends_at timestamptz,
  weight integer not null default 1 check(weight between 1 and 100),
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ad_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references public.profiles(id) on delete set null,
  advertiser_name varchar(120) not null,
  contact_email varchar(320) not null,
  title varchar(180) not null,
  target_url text not null,
  placement varchar(30) not null default 'FEED' check (placement in ('FEED','EXPLORE','READER','SIDEBAR')),
  message text,
  status varchar(20) not null default 'OPEN' check(status in ('OPEN','CONTACTED','APPROVED','REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ad_campaigns enable row level security;
alter table public.ad_requests enable row level security;
drop policy if exists ad_campaigns_public_read on public.ad_campaigns;
create policy ad_campaigns_public_read on public.ad_campaigns for select to anon,authenticated using(
  (status='ACTIVE' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now())) or public.is_staff()
);
drop policy if exists ad_campaigns_staff_write on public.ad_campaigns;
create policy ad_campaigns_staff_write on public.ad_campaigns for all to authenticated using(public.is_staff()) with check(public.is_staff());
drop policy if exists ad_requests_insert on public.ad_requests;
create policy ad_requests_insert on public.ad_requests for insert to authenticated with check(requester_id=auth.uid());
drop policy if exists ad_requests_read on public.ad_requests;
create policy ad_requests_read on public.ad_requests for select to authenticated using(requester_id=auth.uid() or public.is_staff());
drop policy if exists ad_requests_staff_update on public.ad_requests;
create policy ad_requests_staff_update on public.ad_requests for update to authenticated using(public.is_staff()) with check(public.is_staff());
drop trigger if exists ad_campaigns_updated_at on public.ad_campaigns;
create trigger ad_campaigns_updated_at before update on public.ad_campaigns for each row execute function public.set_updated_at();
drop trigger if exists ad_requests_updated_at on public.ad_requests;
create trigger ad_requests_updated_at before update on public.ad_requests for each row execute function public.set_updated_at();

create or replace function public.get_active_ad(placement_name text default 'FEED')
returns jsonb language sql volatile security definer set search_path=public,pg_temp as $$
  select coalesce((
    select to_jsonb(a)
    from public.ad_campaigns a
    where a.status='ACTIVE'
      and a.placement=upper(placement_name)
      and (a.starts_at is null or a.starts_at<=now())
      and (a.ends_at is null or a.ends_at>=now())
    order by (-ln(greatest(random(),0.000001)) / greatest(a.weight,1)) asc
    limit 1
  ),'null'::jsonb);
$$;

create or replace function public.track_ad_event(target_ad uuid,event_type text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if event_type='IMPRESSION' then update public.ad_campaigns set impressions=impressions+1 where id=target_ad and status='ACTIVE';
  elsif event_type='CLICK' then update public.ad_campaigns set clicks=clicks+1 where id=target_ad and status='ACTIVE';
  else raise exception 'INVALID_EVENT'; end if;
end;$$;

-- -----------------------------------------------------------------------------
-- Feed de histórias: recentes + recomendação explicável
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
declare uid uuid:=auth.uid(); result jsonb; begin
  if upper(feed_mode)='RECENT' then
    select coalesce(jsonb_agg(jsonb_build_object('work',to_jsonb(x) || jsonb_build_object('bookmarked', uid is not null and exists(select 1 from public.bookmarks b where b.user_id=uid and b.work_id=x.id)),'reason','Recém-publicada') order by x.published_at desc),'[]'::jsonb) into result
    from (
      select wc.* from public.public_work_cards wc
      where wc.visibility='PUBLIC' and wc.status<>'DRAFT' and wc.published_at is not null and public.can_read_work(wc.id)
      order by wc.published_at desc
      limit greatest(1,least(limit_count,50)) offset greatest(0,offset_count)
    ) x;
    return result;
  end if;

  with interest_tags as (
    select wt.tag_id,count(*) weight
    from public.work_tags wt
    join (
      select b.work_id from public.bookmarks b where b.user_id=uid
      union all
      select rh.work_id from public.reading_history rh where rh.user_id=uid
    ) i on i.work_id=wt.work_id
    group by wt.tag_id
  ), interest_fandoms as (
    select wf.fandom_id,count(*) weight
    from public.work_fandoms wf
    join (
      select b.work_id from public.bookmarks b where b.user_id=uid
      union all
      select rh.work_id from public.reading_history rh where rh.user_id=uid
    ) i on i.work_id=wf.work_id
    group by wf.fandom_id
  ), scored as (
    select wc.*,
      (case when uid is not null and exists(select 1 from public.user_subscriptions us where us.subscriber_id=uid and us.author_id=wc.creator_id) then 90 else 0 end)
      + coalesce((select sum(it.weight)*12 from public.work_tags wt join interest_tags it on it.tag_id=wt.tag_id where wt.work_id=wc.id),0)
      + coalesce((select sum(ifd.weight)*16 from public.work_fandoms wf join interest_fandoms ifd on ifd.fandom_id=wf.fandom_id where wf.work_id=wc.id),0)
      + least(wc.kudos_count,500)::numeric*.08
      + least(wc.bookmarks_count,300)::numeric*.10
      + least(wc.comments_count,300)::numeric*.05
      + greatest(0,30-extract(epoch from (now()-coalesce(wc.published_at,wc.updated_at)))/86400)::numeric as score,
      case
        when uid is not null and exists(select 1 from public.user_subscriptions us where us.subscriber_id=uid and us.author_id=wc.creator_id) then 'De um autor que você segue'
        when exists(select 1 from public.work_tags wt join interest_tags it on it.tag_id=wt.tag_id where wt.work_id=wc.id) then 'Combina com tags que você costuma ler'
        when exists(select 1 from public.work_fandoms wf join interest_fandoms ifd on ifd.fandom_id=wf.fandom_id where wf.work_id=wc.id) then 'De um fandom que você acompanha'
        else 'Em destaque na comunidade'
      end as reason
    from public.public_work_cards wc
    where wc.visibility='PUBLIC' and wc.status<>'DRAFT' and public.can_read_work(wc.id)
      and (uid is null or not exists(select 1 from public.reading_history rh where rh.user_id=uid and rh.work_id=wc.id))
  )
  select coalesce(jsonb_agg(jsonb_build_object('work',(to_jsonb(x)-'score'-'reason') || jsonb_build_object('bookmarked', uid is not null and exists(select 1 from public.bookmarks b where b.user_id=uid and b.work_id=x.id)),'reason',x.reason) order by x.score desc,x.updated_at desc),'[]'::jsonb) into result
  from (
    select * from scored order by score desc,updated_at desc
    limit greatest(1,least(limit_count,50)) offset greatest(0,offset_count)
  ) x;
  return result;
end;$$;

-- -----------------------------------------------------------------------------
-- Storage para mídia dos posts
-- -----------------------------------------------------------------------------

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('post-media','post-media',true,10485760,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do nothing;

drop policy if exists "Post media are publicly readable" on storage.objects;
create policy "Post media are publicly readable" on storage.objects for select to anon,authenticated using(bucket_id='post-media');
drop policy if exists "Users upload own post media" on storage.objects;
create policy "Users upload own post media" on storage.objects for insert to authenticated with check(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Users update own post media" on storage.objects;
create policy "Users update own post media" on storage.objects for update to authenticated using(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Users delete own post media" on storage.objects;
create policy "Users delete own post media" on storage.objects for delete to authenticated using(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text);

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

revoke all on public.community_posts,public.post_poll_options,public.post_poll_votes,public.post_likes,public.post_comments,
  public.work_collaborators,public.work_contributions,public.contribution_reviews,
  public.creator_support_profiles,public.project_support_config,public.faq_items,public.ad_campaigns,public.ad_requests from anon,authenticated;

grant select on public.community_posts,public.post_poll_options,public.post_comments,public.creator_support_profiles,public.project_support_config,public.faq_items,public.ad_campaigns to anon,authenticated;
grant select on public.post_poll_votes,public.post_likes,public.work_collaborators,public.work_contributions,public.contribution_reviews,public.ad_requests to authenticated;
grant insert,update,delete on public.community_posts,public.post_poll_options,public.post_poll_votes,public.post_likes,public.post_comments,
  public.work_collaborators,public.work_contributions,public.contribution_reviews,public.creator_support_profiles,public.project_support_config,public.faq_items,public.ad_campaigns,public.ad_requests to authenticated;

grant execute on function public.can_read_post(uuid) to anon,authenticated;
grant execute on function public.create_community_post(text,text[],text,text,text[]) to authenticated;
grant execute on function public.toggle_post_like(uuid) to authenticated;
grant execute on function public.vote_post_poll(uuid,uuid) to authenticated;
grant execute on function public.community_post_feed(text,integer,integer) to anon,authenticated;
grant execute on function public.can_manage_collaboration(uuid) to authenticated;
grant execute on function public.set_work_contributions_open(uuid,boolean) to authenticated;
grant execute on function public.invite_work_collaborator(uuid,text,text) to authenticated;
grant execute on function public.respond_work_invitation(uuid,boolean) to authenticated;
grant execute on function public.submit_work_contribution(uuid,text,text,text,text,uuid,text) to authenticated;
grant execute on function public.review_work_contribution(uuid,text,text) to authenticated;
grant execute on function public.merge_work_contribution(uuid) to authenticated;
grant execute on function public.get_collaboration_hub(uuid) to anon,authenticated;
grant execute on function public.profile_contribution_calendar(text) to anon,authenticated;
grant execute on function public.get_active_ad(text) to anon,authenticated;
grant execute on function public.track_ad_event(uuid,text) to anon,authenticated;
grant execute on function public.discovery_feed(text,integer,integer) to anon,authenticated;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
