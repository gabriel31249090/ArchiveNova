-- ArchiveNova v4.6.1 — Security & RLS cleanup

-- -----------------------------------------------------------------------------
-- 1. Remove anonymous execution from authenticated-only SECURITY DEFINER RPCs
-- -----------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname = any(array[
        'add_draft_inline_comment',
        'can_edit_draft',
        'can_manage_collaboration',
        'can_review_draft',
        'continue_reading',
        'create_collection',
        'create_community_post',
        'create_library_shelf',
        'create_series',
        'create_shelf',
        'creator_analytics',
        'creator_studio_timeseries',
        'delete_collection',
        'delete_series',
        'delete_shelf',
        'get_collaboration_hub',
        'get_draft_review',
        'get_reading_progress',
        'has_active_restriction',
        'invite_beta_reader',
        'invite_draft_collaborator',
        'invite_work_collaborator',
        'merge_work_contribution',
        'my_draft_collaborations',
        'my_library',
        'my_series_and_collections',
        'remove_from_library',
        'reorder_series_works',
        'reorder_shelf_works',
        'request_work_export',
        'resolve_draft_inline_comment',
        'respond_beta_reader_invite',
        'respond_draft_invite',
        'respond_work_invitation',
        'restore_chapter_version',
        'review_work_contribution',
        'save_reader_preferences',
        'save_reading_progress',
        'schedule_chapter',
        'set_collection_work',
        'set_library_state',
        'set_series_work',
        'set_shelf_work',
        'set_work_contributions_open',
        'submit_work_contribution',
        'toggle_post_like',
        'toggle_shelf_work',
        'update_collection_info',
        'update_series_info',
        'update_shelf_info',
        'vote_post_poll'
      ]::text[])
  loop
    execute format('revoke execute on function %s from public, anon',r.signature);
    execute format('grant execute on function %s to authenticated',r.signature);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Rate-limit storage is private; admins can inspect it for abuse debugging
-- -----------------------------------------------------------------------------

alter table public.rate_limit_events enable row level security;

drop policy if exists rate_limit_events_admin_read on public.rate_limit_events;
create policy rate_limit_events_admin_read
on public.rate_limit_events for select to authenticated
using (public.is_admin());

revoke insert,update,delete on public.rate_limit_events from anon,authenticated;

-- -----------------------------------------------------------------------------
-- 3. Remaining index cleanup from the schema reconciliation
-- -----------------------------------------------------------------------------

drop index if exists public.library_shelf_items_work_idx;

create index if not exists reading_history_chapter_work_idx
  on public.reading_history(chapter_id,work_id);

-- -----------------------------------------------------------------------------
-- 4. Split permissive ALL write policies away from SELECT
--    This keeps the exact USING/WITH CHECK expressions while preventing the
--    owner/admin write policy from also acting as a second SELECT policy.
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
  roles_sql text;
  insert_name text;
  update_name text;
  delete_name text;
begin
  for r in
    select p.schemaname,p.tablename,p.policyname,p.roles,p.qual,p.with_check
    from pg_policies p
    where p.schemaname='public'
      and p.cmd='ALL'
      and exists(
        select 1
        from pg_policies s
        where s.schemaname=p.schemaname
          and s.tablename=p.tablename
          and s.cmd='SELECT'
          and s.policyname<>p.policyname
      )
  loop
    select string_agg(quote_ident(role_name),',')
    into roles_sql
    from unnest(r.roles) role_name;

    insert_name:=left(r.policyname||'_insert',63);
    update_name:=left(r.policyname||'_update',63);
    delete_name:=left(r.policyname||'_delete',63);

    execute format(
      'drop policy if exists %I on %I.%I',
      r.policyname,r.schemaname,r.tablename
    );

    if r.with_check is not null then
      execute format(
        'create policy %I on %I.%I for insert to %s with check (%s)',
        insert_name,r.schemaname,r.tablename,roles_sql,r.with_check
      );
    end if;

    if r.qual is not null then
      if r.with_check is not null then
        execute format(
          'create policy %I on %I.%I for update to %s using (%s) with check (%s)',
          update_name,r.schemaname,r.tablename,roles_sql,r.qual,r.with_check
        );
      else
        execute format(
          'create policy %I on %I.%I for update to %s using (%s)',
          update_name,r.schemaname,r.tablename,roles_sql,r.qual
        );
      end if;

      execute format(
        'create policy %I on %I.%I for delete to %s using (%s)',
        delete_name,r.schemaname,r.tablename,roles_sql,r.qual
      );
    end if;
  end loop;
end;
$$;
