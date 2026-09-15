-- ArchiveNova v4.8 — Allow trusted internal moderation reports
-- User-created reports remain rate-limited. System reports have reporter_id = null.

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
  elsif tg_table_name='reports' and new.reporter_id is not null then
    perform public.consume_rate_limit(
      new.reporter_id,'REPORT',6,3600,
      coalesce(new.reason,'')||' '||coalesce(new.details,'')
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_archive_writes() from public,anon,authenticated;
