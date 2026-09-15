-- ArchiveNova v4.8 — Trust foundation hardening

create index if not exists moderation_scan_hits_rule_idx
  on public.moderation_scan_hits(rule_id);

create index if not exists moderation_scans_requested_by_idx
  on public.moderation_scans(requested_by)
  where requested_by is not null;

create index if not exists moderation_scans_reviewed_by_idx
  on public.moderation_scans(reviewed_by)
  where reviewed_by is not null;

create index if not exists support_ticket_messages_author_idx
  on public.support_ticket_messages(author_id)
  where author_id is not null;

-- Defense-in-depth policies. Direct authenticated table grants remain revoked;
-- staff access is expected through the audited RPC surface.
drop policy if exists moderation_rules_staff_read on public.moderation_scan_rules;
create policy moderation_rules_staff_read
on public.moderation_scan_rules for select to authenticated
using (public.is_staff());

drop policy if exists moderation_scans_staff_read on public.moderation_scans;
create policy moderation_scans_staff_read
on public.moderation_scans for select to authenticated
using (public.is_staff());

drop policy if exists moderation_hits_staff_read on public.moderation_scan_hits;
create policy moderation_hits_staff_read
on public.moderation_scan_hits for select to authenticated
using (
  public.is_staff()
  and exists(
    select 1 from public.moderation_scans s
    where s.id=scan_id
  )
);
