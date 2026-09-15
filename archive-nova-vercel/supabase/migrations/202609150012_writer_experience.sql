-- Archive Nova v4.9 — NovaDrop 03 / Writer Experience
-- Writer workspace, goals, planner, versions, beta reading and creator comments.

alter table public.drafts
  add column if not exists daily_word_goal integer not null default 1000,
  add column if not exists weekly_word_goal integer not null default 5000,
  add column if not exists project_word_goal integer;

alter table public.drafts drop constraint if exists drafts_daily_word_goal_check;
alter table public.drafts add constraint drafts_daily_word_goal_check check (daily_word_goal between 0 and 100000);
alter table public.drafts drop constraint if exists drafts_weekly_word_goal_check;
alter table public.drafts add constraint drafts_weekly_word_goal_check check (weekly_word_goal between 0 and 500000);
alter table public.drafts drop constraint if exists drafts_project_word_goal_check;
alter table public.drafts add constraint drafts_project_word_goal_check check (project_word_goal is null or project_word_goal between 1 and 10000000);

alter table public.draft_chapters
  add column if not exists stage varchar(24) not null default 'DRAFT',
  add column if not exists synopsis text,
  add column if not exists pov varchar(120),
  add column if not exists target_words integer,
  add column if not exists scheduled_for timestamptz;

alter table public.draft_chapters drop constraint if exists draft_chapters_stage_check;
alter table public.draft_chapters add constraint draft_chapters_stage_check check (stage in ('IDEA','DRAFT','REVISION','READY'));
alter table public.draft_chapters drop constraint if exists draft_chapters_target_words_check;
alter table public.draft_chapters add constraint draft_chapters_target_words_check check (target_words is null or target_words between 1 and 1000000);

create table if not exists public.writer_story_assets (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind varchar(24) not null check (kind in ('CHARACTER','LOCATION','TIMELINE','NOTE','SNIPPET')),
  title varchar(180) not null,
  body text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists writer_story_assets_draft_idx on public.writer_story_assets(draft_id,kind,sort_order,created_at);

create table if not exists public.writer_annotations (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  chapter_id uuid references public.draft_chapters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  anchor_text text,
  body text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(body) between 1 and 5000)
);
create index if not exists writer_annotations_draft_idx on public.writer_annotations(draft_id,resolved,created_at desc);

create table if not exists public.writer_draft_versions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  chapter_id uuid not null references public.draft_chapters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  revision bigint not null,
  title varchar(300),
  content_html text not null,
  content_json jsonb not null default '{}'::jsonb,
  word_count integer not null default 0,
  source varchar(24) not null default 'AUTO' check (source in ('AUTO','MANUAL','RESTORE','IMPORT')),
  created_at timestamptz not null default now()
);
create index if not exists writer_draft_versions_chapter_idx on public.writer_draft_versions(chapter_id,created_at desc);

create table if not exists public.writer_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  draft_id uuid not null references public.drafts(id) on delete cascade,
  activity_date date not null default current_date,
  words_added integer not null default 0,
  saves integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,draft_id,activity_date)
);
create index if not exists writer_activity_user_date_idx on public.writer_activity(user_id,activity_date desc);

create table if not exists public.writer_beta_invites (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  reader_id uuid references public.profiles(id) on delete set null,
  token uuid not null default gen_random_uuid() unique,
  label varchar(120),
  status varchar(16) not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);
create index if not exists writer_beta_invites_draft_idx on public.writer_beta_invites(draft_id,status,created_at desc);

create table if not exists public.writer_beta_feedback (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.writer_beta_invites(id) on delete cascade,
  draft_id uuid not null references public.drafts(id) on delete cascade,
  chapter_id uuid references public.draft_chapters(id) on delete cascade,
  reader_id uuid not null references public.profiles(id) on delete cascade,
  anchor_text text,
  body text not null,
  created_at timestamptz not null default now(),
  check (char_length(body) between 1 and 8000)
);
create index if not exists writer_beta_feedback_draft_idx on public.writer_beta_feedback(draft_id,created_at desc);

alter table public.writer_story_assets enable row level security;
alter table public.writer_annotations enable row level security;
alter table public.writer_draft_versions enable row level security;
alter table public.writer_activity enable row level security;
alter table public.writer_beta_invites enable row level security;
alter table public.writer_beta_feedback enable row level security;

revoke all on public.writer_story_assets from anon,authenticated;
revoke all on public.writer_annotations from anon,authenticated;
revoke all on public.writer_draft_versions from anon,authenticated;
revoke all on public.writer_activity from anon,authenticated;
revoke all on public.writer_beta_invites from anon,authenticated;
revoke all on public.writer_beta_feedback from anon,authenticated;

create or replace function public.get_writer_draft(target_draft uuid)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select jsonb_build_object(
    'id',d.id,'title',d.title,'revision',d.revision,'created_at',d.created_at,'updated_at',d.updated_at,
    'daily_word_goal',d.daily_word_goal,'weekly_word_goal',d.weekly_word_goal,'project_word_goal',d.project_word_goal,
    'chapters',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'title',coalesce(c.title,''),'content_html',c.content_html,'content_json',c.content_json,
      'word_count',c.word_count,'position',c.position,'revision',c.revision,'stage',c.stage,
      'synopsis',coalesce(c.synopsis,''),'pov',coalesce(c.pov,''),'target_words',c.target_words,
      'scheduled_for',c.scheduled_for,'updated_at',c.updated_at
    ) order by c.position) from public.draft_chapters c where c.draft_id=d.id),'[]'::jsonb)
  ) into result from public.drafts d where d.id=target_draft and d.user_id=uid;
  if result is null then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002'; end if;
  return result;
end $$;

create or replace function public.my_writer_drafts()
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',d.id,'title',d.title,'revision',d.revision,'created_at',d.created_at,'updated_at',d.updated_at,
      'chapter_count',(select count(*) from public.draft_chapters c where c.draft_id=d.id),
      'word_count',(select coalesce(sum(c.word_count),0) from public.draft_chapters c where c.draft_id=d.id),
      'first_chapter_title',(select coalesce(c.title,'') from public.draft_chapters c where c.draft_id=d.id order by c.position limit 1),
      'daily_word_goal',d.daily_word_goal,'weekly_word_goal',d.weekly_word_goal,'project_word_goal',d.project_word_goal,
      'today_words',(select coalesce(sum(a.words_added),0) from public.writer_activity a where a.draft_id=d.id and a.user_id=uid and a.activity_date=current_date),
      'week_words',(select coalesce(sum(a.words_added),0) from public.writer_activity a where a.draft_id=d.id and a.user_id=uid and a.activity_date>=current_date-6)
    ) order by d.updated_at desc)
    from public.drafts d where d.user_id=uid
  ),'[]'::jsonb);
end $$;

create or replace function public.save_writer_draft(
  target_draft uuid,target_chapter uuid,next_title text,next_chapter_title text,
  next_content_html text,next_content_json jsonb,next_word_count integer,
  expected_draft_revision bigint,expected_chapter_revision bigint
)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); d public.drafts%rowtype; c public.draft_chapters%rowtype; now_value timestamptz:=now(); delta integer:=0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into d from public.drafts where id=target_draft and user_id=uid for update;
  if not found then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002'; end if;
  select * into c from public.draft_chapters where id=target_chapter and draft_id=target_draft for update;
  if not found then raise exception 'CHAPTER_NOT_FOUND' using errcode='P0002'; end if;
  if d.revision<>expected_draft_revision or c.revision<>expected_chapter_revision then
    return jsonb_build_object('ok',false,'conflict',true,'draft_revision',d.revision,'chapter_revision',c.revision,
      'updated_at',greatest(d.updated_at,c.updated_at),'remote',jsonb_build_object(
        'title',d.title,'chapter_title',coalesce(c.title,''),'content_html',c.content_html,'content_json',c.content_json,'word_count',c.word_count));
  end if;

  if c.content_html is distinct from coalesce(nullif(next_content_html,''),'<p></p>')
     and not exists(select 1 from public.writer_draft_versions v where v.chapter_id=c.id and v.created_at>now_value-interval '15 minutes') then
    insert into public.writer_draft_versions(draft_id,chapter_id,user_id,revision,title,content_html,content_json,word_count,source)
    values(target_draft,c.id,uid,c.revision,c.title,c.content_html,c.content_json,c.word_count,'AUTO');
  end if;

  delta:=greatest(0,greatest(0,coalesce(next_word_count,0))-c.word_count);
  update public.drafts set title=left(coalesce(next_title,''),300),revision=revision+1,updated_at=now_value where id=target_draft;
  update public.draft_chapters set
    title=nullif(left(btrim(coalesce(next_chapter_title,'')),300),''),
    content_html=coalesce(nullif(next_content_html,''),'<p></p>'),
    content_json=coalesce(next_content_json,content_json),
    word_count=greatest(0,coalesce(next_word_count,0)),revision=revision+1,updated_at=now_value
  where id=target_chapter;

  insert into public.writer_activity(user_id,draft_id,activity_date,words_added,saves,updated_at)
  values(uid,target_draft,current_date,delta,1,now_value)
  on conflict(user_id,draft_id,activity_date) do update
    set words_added=public.writer_activity.words_added+excluded.words_added,
        saves=public.writer_activity.saves+1,updated_at=excluded.updated_at;

  return jsonb_build_object('ok',true,'conflict',false,'draft_revision',d.revision+1,'chapter_revision',c.revision+1,'updated_at',now_value);
end $$;

create or replace function public.writer_workspace_state(target_draft uuid)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid();
begin
  if uid is null or not exists(select 1 from public.drafts where id=target_draft and user_id=uid) then
    raise exception 'NOT_OWNER' using errcode='42501';
  end if;
  return jsonb_build_object(
    'assets',coalesce((select jsonb_agg(to_jsonb(a) order by a.kind,a.sort_order,a.created_at) from public.writer_story_assets a where a.draft_id=target_draft),'[]'::jsonb),
    'annotations',coalesce((select jsonb_agg(to_jsonb(n) order by n.resolved,n.created_at desc) from public.writer_annotations n where n.draft_id=target_draft),'[]'::jsonb),
    'versions',coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc) from (select * from public.writer_draft_versions where draft_id=target_draft order by created_at desc limit 100) v),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.activity_date) from public.writer_activity a where a.draft_id=target_draft and a.activity_date>=current_date-120),'[]'::jsonb),
    'beta_invites',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from public.writer_beta_invites i where i.draft_id=target_draft),'[]'::jsonb),
    'beta_feedback',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc) from public.writer_beta_feedback f where f.draft_id=target_draft),'[]'::jsonb)
  );
end $$;

create or replace function public.writer_update_goals(target_draft uuid,daily_goal integer,weekly_goal integer,project_goal integer)
returns void language plpgsql security definer
set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  update public.drafts set daily_word_goal=greatest(0,least(coalesce(daily_goal,0),100000)),
    weekly_word_goal=greatest(0,least(coalesce(weekly_goal,0),500000)),
    project_word_goal=case when project_goal is null then null else greatest(1,least(project_goal,10000000)) end,
    updated_at=now()
  where id=target_draft and user_id=auth.uid();
  if not found then raise exception 'NOT_OWNER' using errcode='42501'; end if;
end $$;

create or replace function public.writer_update_chapter_meta(
  target_chapter uuid,next_stage text,next_synopsis text,next_pov text,next_target_words integer,next_scheduled_for timestamptz
)
returns void language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare did uuid; normalized text:=upper(coalesce(next_stage,'DRAFT'));
begin
  select c.draft_id into did from public.draft_chapters c join public.drafts d on d.id=c.draft_id
  where c.id=target_chapter and d.user_id=auth.uid();
  if did is null then raise exception 'NOT_OWNER' using errcode='42501'; end if;
  if normalized not in ('IDEA','DRAFT','REVISION','READY') then raise exception 'INVALID_STAGE'; end if;
  update public.draft_chapters set stage=normalized,synopsis=nullif(left(coalesce(next_synopsis,''),12000),''),
    pov=nullif(left(btrim(coalesce(next_pov,'')),120),''),
    target_words=case when next_target_words is null then null else greatest(1,least(next_target_words,1000000)) end,
    scheduled_for=next_scheduled_for,updated_at=now()
  where id=target_chapter;
end $$;

create or replace function public.reorder_writer_draft_chapters(target_draft uuid,ordered_chapter_ids uuid[])
returns void language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare expected_count integer; supplied_count integer; item uuid; pos integer:=0;
begin
  if auth.uid() is null or not exists(select 1 from public.drafts where id=target_draft and user_id=auth.uid()) then raise exception 'NOT_OWNER' using errcode='42501'; end if;
  select count(*) into expected_count from public.draft_chapters where draft_id=target_draft;
  supplied_count:=coalesce(cardinality(ordered_chapter_ids),0);
  if supplied_count<>expected_count or (select count(distinct x) from unnest(ordered_chapter_ids) x)<>expected_count then raise exception 'INVALID_ORDER'; end if;
  if exists(select 1 from unnest(ordered_chapter_ids) x where not exists(select 1 from public.draft_chapters c where c.id=x and c.draft_id=target_draft)) then raise exception 'FOREIGN_CHAPTER'; end if;
  update public.draft_chapters set position=position+1000000 where draft_id=target_draft;
  foreach item in array ordered_chapter_ids loop pos:=pos+1; update public.draft_chapters set position=pos where id=item; end loop;
  update public.drafts set revision=revision+1,updated_at=now() where id=target_draft;
end $$;

create or replace function public.writer_upsert_asset(target_draft uuid,asset_id uuid,asset_kind text,asset_title text,asset_body text,asset_metadata jsonb)
returns uuid language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); aid uuid:=asset_id; k text:=upper(coalesce(asset_kind,'NOTE'));
begin
  if uid is null or not exists(select 1 from public.drafts where id=target_draft and user_id=uid) then raise exception 'NOT_OWNER' using errcode='42501'; end if;
  if k not in ('CHARACTER','LOCATION','TIMELINE','NOTE','SNIPPET') then raise exception 'INVALID_KIND'; end if;
  if char_length(btrim(coalesce(asset_title,'')))<1 then raise exception 'TITLE_REQUIRED'; end if;
  if aid is null then
    insert into public.writer_story_assets(draft_id,user_id,kind,title,body,metadata,sort_order)
    values(target_draft,uid,k,left(btrim(asset_title),180),coalesce(asset_body,''),coalesce(asset_metadata,'{}'::jsonb),
      coalesce((select max(sort_order)+1 from public.writer_story_assets where draft_id=target_draft and kind=k),1))
    returning id into aid;
  else
    update public.writer_story_assets set kind=k,title=left(btrim(asset_title),180),body=coalesce(asset_body,''),
      metadata=coalesce(asset_metadata,'{}'::jsonb),updated_at=now()
    where id=aid and draft_id=target_draft and user_id=uid;
    if not found then raise exception 'ASSET_NOT_FOUND'; end if;
  end if;
  return aid;
end $$;

create or replace function public.writer_delete_asset(asset_id uuid)
returns void language plpgsql security definer
set search_path=public,auth,pg_temp as $$
begin
  delete from public.writer_story_assets where id=asset_id and user_id=auth.uid();
  if not found then raise exception 'ASSET_NOT_FOUND'; end if;
end $$;

create or replace function public.writer_add_annotation(target_draft uuid,target_chapter uuid,note_body text,note_anchor text)
returns uuid language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); nid uuid;
begin
  if uid is null or not exists(select 1 from public.drafts where id=target_draft and user_id=uid) then raise exception 'NOT_OWNER' using errcode='42501'; end if;
  if target_chapter is not null and not exists(select 1 from public.draft_chapters where id=target_chapter and draft_id=target_draft) then raise exception 'CHAPTER_NOT_FOUND'; end if;
  insert into public.writer_annotations(draft_id,chapter_id,user_id,anchor_text,body)
  values(target_draft,target_chapter,uid,nullif(left(btrim(coalesce(note_anchor,'')),2000),''),left(btrim(note_body),5000))
  returning id into nid;
  return nid;
end $$;

create or replace function public.writer_set_annotation_resolved(note_id uuid,next_resolved boolean)
returns void language plpgsql security definer
set search_path=public,auth,pg_temp as $$
begin
  update public.writer_annotations set resolved=coalesce(next_resolved,false),updated_at=now() where id=note_id and user_id=auth.uid();
  if not found then raise exception 'NOTE_NOT_FOUND'; end if;
end $$;

create or replace function public.writer_create_snapshot(target_chapter uuid)
returns uuid language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); c public.draft_chapters%rowtype; vid uuid;
begin
  select c0.* into c from public.draft_chapters c0 join public.drafts d on d.id=c0.draft_id where c0.id=target_chapter and d.user_id=uid;
  if not found then raise exception 'NOT_OWNER' using errcode='42501'; end if;
  insert into public.writer_draft_versions(draft_id,chapter_id,user_id,revision,title,content_html,content_json,word_count,source)
  values(c.draft_id,c.id,uid,c.revision,c.title,c.content_html,c.content_json,c.word_count,'MANUAL') returning id into vid;
  return vid;
end $$;

create or replace function public.writer_restore_snapshot(version_id uuid)
returns void language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); v public.writer_draft_versions%rowtype; c public.draft_chapters%rowtype;
begin
  select * into v from public.writer_draft_versions where id=version_id and user_id=uid;
  if not found then raise exception 'VERSION_NOT_FOUND'; end if;
  select * into c from public.draft_chapters where id=v.chapter_id and draft_id=v.draft_id for update;
  if not found then raise exception 'CHAPTER_NOT_FOUND'; end if;
  insert into public.writer_draft_versions(draft_id,chapter_id,user_id,revision,title,content_html,content_json,word_count,source)
  values(c.draft_id,c.id,uid,c.revision,c.title,c.content_html,c.content_json,c.word_count,'RESTORE');
  update public.draft_chapters set title=v.title,content_html=v.content_html,content_json=v.content_json,
    word_count=v.word_count,revision=revision+1,updated_at=now() where id=c.id;
  update public.drafts set revision=revision+1,updated_at=now() where id=c.draft_id;
end $$;

create or replace function public.writer_search_draft(target_draft uuid,search_text text)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare q text:=lower(btrim(coalesce(search_text,'')));
begin
  if q='' then return '[]'::jsonb; end if;
  if auth.uid() is null or not exists(select 1 from public.drafts where id=target_draft and user_id=auth.uid()) then raise exception 'NOT_OWNER' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('chapter_id',c.id,'title',coalesce(c.title,''),'position',c.position,'matches',
    ((length(lower(regexp_replace(c.content_html,'<[^>]+>',' ','g')))-length(replace(lower(regexp_replace(c.content_html,'<[^>]+>',' ','g')),q,'')))/greatest(length(q),1))
  ) order by c.position) from public.draft_chapters c where c.draft_id=target_draft and lower(regexp_replace(c.content_html,'<[^>]+>',' ','g')) like '%'||q||'%'),'[]'::jsonb);
end $$;

create or replace function public.writer_replace_draft(target_draft uuid,find_text text,replacement_text text,apply_changes boolean default false)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); q text:=coalesce(find_text,''); c public.draft_chapters%rowtype; chapter_hits integer:=0; replacements integer:=0; occurrences integer;
begin
  if uid is null or not exists(select 1 from public.drafts where id=target_draft and user_id=uid) then raise exception 'NOT_OWNER' using errcode='42501'; end if;
  if q='' then return jsonb_build_object('chapters',0,'replacements',0); end if;
  for c in select * from public.draft_chapters where draft_id=target_draft and content_html like '%'||q||'%' order by position loop
    occurrences:=(length(c.content_html)-length(replace(c.content_html,q,'')))/greatest(length(q),1);
    chapter_hits:=chapter_hits+1; replacements:=replacements+occurrences;
    if coalesce(apply_changes,false) then
      insert into public.writer_draft_versions(draft_id,chapter_id,user_id,revision,title,content_html,content_json,word_count,source)
      values(c.draft_id,c.id,uid,c.revision,c.title,c.content_html,c.content_json,c.word_count,'MANUAL');
      update public.draft_chapters set content_html=replace(c.content_html,q,coalesce(replacement_text,'')),content_json='{}'::jsonb,
        word_count=public.count_words(regexp_replace(replace(c.content_html,q,coalesce(replacement_text,'')),'<[^>]+>',' ','g')),
        revision=revision+1,updated_at=now() where id=c.id;
    end if;
  end loop;
  if coalesce(apply_changes,false) and chapter_hits>0 then update public.drafts set revision=revision+1,updated_at=now() where id=target_draft; end if;
  return jsonb_build_object('chapters',chapter_hits,'replacements',replacements);
end $$;

create or replace function public.writer_import_chapters(target_draft uuid,imported_chapters jsonb)
returns integer language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); item jsonb; pos integer; inserted_count integer:=0; html text; ttl text;
begin
  if uid is null or not exists(select 1 from public.drafts where id=target_draft and user_id=uid) then raise exception 'NOT_OWNER' using errcode='42501'; end if;
  if jsonb_typeof(imported_chapters)<>'array' then raise exception 'INVALID_IMPORT'; end if;
  select coalesce(max(position),0) into pos from public.draft_chapters where draft_id=target_draft;
  for item in select value from jsonb_array_elements(imported_chapters) loop
    html:=coalesce(item->>'html',''); ttl:=left(coalesce(item->>'title',''),300);
    if btrim(regexp_replace(html,'<[^>]+>',' ','g'))<>'' then
      pos:=pos+1;
      insert into public.draft_chapters(draft_id,title,content_html,content_json,word_count,position,stage)
      values(target_draft,nullif(btrim(ttl),''),html,'{}'::jsonb,public.count_words(regexp_replace(html,'<[^>]+>',' ','g')),pos,'DRAFT');
      inserted_count:=inserted_count+1;
    end if;
  end loop;
  if inserted_count>0 then update public.drafts set revision=revision+1,updated_at=now() where id=target_draft; end if;
  return inserted_count;
end $$;

create or replace function public.writer_consistency_report(target_draft uuid)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from public.drafts where id=target_draft and user_id=auth.uid()) then raise exception 'NOT_OWNER' using errcode='42501'; end if;
  return jsonb_build_object(
    'missing_titles',coalesce((select jsonb_agg(jsonb_build_object('chapter_id',id,'position',position)) from public.draft_chapters where draft_id=target_draft and nullif(btrim(coalesce(title,'')),'') is null),'[]'::jsonb),
    'short_chapters',coalesce((select jsonb_agg(jsonb_build_object('chapter_id',id,'position',position,'word_count',word_count)) from public.draft_chapters where draft_id=target_draft and word_count between 1 and 199),'[]'::jsonb),
    'empty_chapters',coalesce((select jsonb_agg(jsonb_build_object('chapter_id',id,'position',position)) from public.draft_chapters where draft_id=target_draft and word_count=0),'[]'::jsonb),
    'ready_without_target',coalesce((select jsonb_agg(jsonb_build_object('chapter_id',id,'position',position)) from public.draft_chapters where draft_id=target_draft and stage='READY' and target_words is null),'[]'::jsonb),
    'duplicate_titles',coalesce((select jsonb_agg(jsonb_build_object('title',title_key,'count',cnt)) from (
      select lower(btrim(title)) title_key,count(*) cnt from public.draft_chapters where draft_id=target_draft and nullif(btrim(coalesce(title,'')),'') is not null group by lower(btrim(title)) having count(*)>1
    ) x),'[]'::jsonb)
  );
end $$;

create or replace function public.writer_create_beta_invite(target_draft uuid,invite_label text,valid_days integer default 30)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); iid uuid; tok uuid; expiry timestamptz;
begin
  if uid is null or not exists(select 1 from public.drafts where id=target_draft and user_id=uid) then raise exception 'NOT_OWNER' using errcode='42501'; end if;
  expiry:=now()+(greatest(1,least(coalesce(valid_days,30),90))||' days')::interval;
  insert into public.writer_beta_invites(draft_id,owner_id,label,expires_at)
  values(target_draft,uid,nullif(left(btrim(coalesce(invite_label,'')),120),''),expiry)
  returning id,token into iid,tok;
  return jsonb_build_object('id',iid,'token',tok,'expires_at',expiry);
end $$;

create or replace function public.writer_revoke_beta_invite(invite_id uuid)
returns void language plpgsql security definer
set search_path=public,auth,pg_temp as $$
begin
  update public.writer_beta_invites set status='REVOKED' where id=invite_id and owner_id=auth.uid();
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
end $$;

create or replace function public.writer_claim_beta_invite(invite_token uuid)
returns boolean language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); inv public.writer_beta_invites%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into inv from public.writer_beta_invites where token=invite_token and status='ACTIVE' and expires_at>now() for update;
  if not found then raise exception 'INVITE_INVALID'; end if;
  if inv.owner_id=uid then return true; end if;
  if inv.reader_id is null then update public.writer_beta_invites set reader_id=uid where id=inv.id; return true; end if;
  if inv.reader_id<>uid then raise exception 'INVITE_ALREADY_CLAIMED' using errcode='42501'; end if;
  return true;
end $$;

create or replace function public.writer_beta_preview(invite_token uuid)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); inv public.writer_beta_invites%rowtype; result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into inv from public.writer_beta_invites where token=invite_token and status='ACTIVE' and expires_at>now()
    and (owner_id=uid or reader_id=uid);
  if not found then raise exception 'INVITE_NOT_CLAIMED' using errcode='42501'; end if;
  select jsonb_build_object('invite_id',inv.id,'draft_id',d.id,'title',d.title,
    'chapters',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',coalesce(c.title,''),'position',c.position,'content_html',c.content_html,'word_count',c.word_count) order by c.position)
      from public.draft_chapters c where c.draft_id=d.id),'[]'::jsonb))
  into result from public.drafts d where d.id=inv.draft_id;
  return result;
end $$;

create or replace function public.writer_beta_leave_feedback(invite_token uuid,target_chapter uuid,feedback_body text,feedback_anchor text)
returns uuid language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); inv public.writer_beta_invites%rowtype; fid uuid;
begin
  select * into inv from public.writer_beta_invites where token=invite_token and status='ACTIVE' and expires_at>now() and reader_id=uid;
  if not found then raise exception 'INVITE_NOT_CLAIMED' using errcode='42501'; end if;
  if target_chapter is not null and not exists(select 1 from public.draft_chapters where id=target_chapter and draft_id=inv.draft_id) then raise exception 'CHAPTER_NOT_FOUND'; end if;
  insert into public.writer_beta_feedback(invite_id,draft_id,chapter_id,reader_id,anchor_text,body)
  values(inv.id,inv.draft_id,target_chapter,uid,nullif(left(btrim(coalesce(feedback_anchor,'')),2000),''),left(btrim(feedback_body),8000))
  returning id into fid;
  return fid;
end $$;

create or replace function public.creator_comment_center(limit_count integer default 300)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select cm.id,cm.chapter_id,cm.parent_id,cm.body,cm.created_at,w.id work_id,w.title work_title,
      ch.chapter_number,coalesce(ch.title,'') chapter_title,cm.user_id,p.username,coalesce(p.display_name,p.username) display_name
    from public.comments cm
    join public.chapters ch on ch.id=cm.chapter_id
    join public.works w on w.id=ch.work_id and w.creator_id=uid and w.deleted_at is null
    join public.profiles p on p.id=cm.user_id
    where cm.status='VISIBLE'
    order by cm.created_at desc
    limit greatest(1,least(coalesce(limit_count,300),1000))
  ) x),'[]'::jsonb);
end $$;

create or replace function public.creator_reply_comment(target_comment uuid,reply_body text)
returns uuid language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); cid uuid; chapter uuid;
begin
  select cm.chapter_id into chapter from public.comments cm join public.chapters ch on ch.id=cm.chapter_id
    join public.works w on w.id=ch.work_id where cm.id=target_comment and w.creator_id=uid and w.deleted_at is null and cm.status='VISIBLE';
  if chapter is null then raise exception 'COMMENT_NOT_FOUND' using errcode='42501'; end if;
  if char_length(btrim(coalesce(reply_body,''))) not between 1 and 10000 then raise exception 'INVALID_REPLY'; end if;
  insert into public.comments(chapter_id,user_id,parent_id,body,status) values(chapter,uid,target_comment,btrim(reply_body),'VISIBLE') returning id into cid;
  return cid;
end $$;

create or replace function public.publish_writer_draft(
  target_draft uuid,work_title text,work_summary text,work_rating text,work_status text,
  fandom_names text[],tag_names text[],expected_chapter_count integer default null,
  work_language text default 'pt-BR',allow_comments_input boolean default true
)
returns uuid language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); first_chapter public.draft_chapters%rowtype; chapter_row public.draft_chapters%rowtype; wid uuid; cid uuid; publish_now boolean;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.drafts where id=target_draft and user_id=uid) then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002'; end if;
  select * into first_chapter from public.draft_chapters where draft_id=target_draft order by position limit 1;
  if first_chapter.id is null or public.count_words(regexp_replace(first_chapter.content_html,'<[^>]+>',' ','g'))=0 then raise exception 'EMPTY_CHAPTER'; end if;

  wid:=public.publish_work(work_title,work_summary,work_rating,work_status,fandom_names,tag_names,
    first_chapter.title,first_chapter.content_html,expected_chapter_count,work_language,allow_comments_input);

  for chapter_row in select * from public.draft_chapters where draft_id=target_draft and id<>first_chapter.id order by position loop
    if public.count_words(regexp_replace(chapter_row.content_html,'<[^>]+>',' ','g'))>0 then
      publish_now:=upper(coalesce(work_status,'ONGOING'))<>'DRAFT' and not (chapter_row.scheduled_for is not null and chapter_row.scheduled_for>now());
      cid:=public.add_chapter(wid,chapter_row.title,chapter_row.content_html,publish_now);
      if upper(coalesce(work_status,'ONGOING'))<>'DRAFT' and chapter_row.scheduled_for is not null and chapter_row.scheduled_for>now() then
        perform public.schedule_chapter(cid,chapter_row.scheduled_for);
      end if;
    end if;
  end loop;

  delete from public.drafts where id=target_draft and user_id=uid;
  return wid;
end $$;

revoke execute on function public.get_writer_draft(uuid) from public;
revoke execute on function public.my_writer_drafts() from public;
revoke execute on function public.save_writer_draft(uuid,uuid,text,text,text,jsonb,integer,bigint,bigint) from public;
revoke execute on function public.writer_workspace_state(uuid) from public;
revoke execute on function public.writer_update_goals(uuid,integer,integer,integer) from public;
revoke execute on function public.writer_update_chapter_meta(uuid,text,text,text,integer,timestamptz) from public;
revoke execute on function public.reorder_writer_draft_chapters(uuid,uuid[]) from public;
revoke execute on function public.writer_upsert_asset(uuid,uuid,text,text,text,jsonb) from public;
revoke execute on function public.writer_delete_asset(uuid) from public;
revoke execute on function public.writer_add_annotation(uuid,uuid,text,text) from public;
revoke execute on function public.writer_set_annotation_resolved(uuid,boolean) from public;
revoke execute on function public.writer_create_snapshot(uuid) from public;
revoke execute on function public.writer_restore_snapshot(uuid) from public;
revoke execute on function public.writer_search_draft(uuid,text) from public;
revoke execute on function public.writer_replace_draft(uuid,text,text,boolean) from public;
revoke execute on function public.writer_import_chapters(uuid,jsonb) from public;
revoke execute on function public.writer_consistency_report(uuid) from public;
revoke execute on function public.writer_create_beta_invite(uuid,text,integer) from public;
revoke execute on function public.writer_revoke_beta_invite(uuid) from public;
revoke execute on function public.writer_claim_beta_invite(uuid) from public;
revoke execute on function public.writer_beta_preview(uuid) from public;
revoke execute on function public.writer_beta_leave_feedback(uuid,uuid,text,text) from public;
revoke execute on function public.creator_comment_center(integer) from public;
revoke execute on function public.creator_reply_comment(uuid,text) from public;
revoke execute on function public.publish_writer_draft(uuid,text,text,text,text,text[],text[],integer,text,boolean) from public;

grant execute on function public.get_writer_draft(uuid) to authenticated;
grant execute on function public.my_writer_drafts() to authenticated;
grant execute on function public.save_writer_draft(uuid,uuid,text,text,text,jsonb,integer,bigint,bigint) to authenticated;
grant execute on function public.writer_workspace_state(uuid) to authenticated;
grant execute on function public.writer_update_goals(uuid,integer,integer,integer) to authenticated;
grant execute on function public.writer_update_chapter_meta(uuid,text,text,text,integer,timestamptz) to authenticated;
grant execute on function public.reorder_writer_draft_chapters(uuid,uuid[]) to authenticated;
grant execute on function public.writer_upsert_asset(uuid,uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.writer_delete_asset(uuid) to authenticated;
grant execute on function public.writer_add_annotation(uuid,uuid,text,text) to authenticated;
grant execute on function public.writer_set_annotation_resolved(uuid,boolean) to authenticated;
grant execute on function public.writer_create_snapshot(uuid) to authenticated;
grant execute on function public.writer_restore_snapshot(uuid) to authenticated;
grant execute on function public.writer_search_draft(uuid,text) to authenticated;
grant execute on function public.writer_replace_draft(uuid,text,text,boolean) to authenticated;
grant execute on function public.writer_import_chapters(uuid,jsonb) to authenticated;
grant execute on function public.writer_consistency_report(uuid) to authenticated;
grant execute on function public.writer_create_beta_invite(uuid,text,integer) to authenticated;
grant execute on function public.writer_revoke_beta_invite(uuid) to authenticated;
grant execute on function public.writer_claim_beta_invite(uuid) to authenticated;
grant execute on function public.writer_beta_preview(uuid) to authenticated;
grant execute on function public.writer_beta_leave_feedback(uuid,uuid,text,text) to authenticated;
grant execute on function public.creator_comment_center(integer) to authenticated;
grant execute on function public.creator_reply_comment(uuid,text) to authenticated;
grant execute on function public.publish_writer_draft(uuid,text,text,text,text,text[],text[],integer,text,boolean) to authenticated;


create or replace function public.writer_consume_import_rate_limit()
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform public.consume_rate_limit(uid,'DOCUMENT_IMPORT',6,600,null);
end $$;

revoke execute on function public.writer_consume_import_rate_limit() from public,anon;
grant execute on function public.writer_consume_import_rate_limit() to authenticated;
