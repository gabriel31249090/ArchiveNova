-- ArchiveNova v4.7 — NovaDrop hardening

create index if not exists platform_feature_flags_updated_by_idx
  on public.platform_feature_flags(updated_by)
  where updated_by is not null;

drop policy if exists platform_feature_flags_admin_read on public.platform_feature_flags;
create policy platform_feature_flags_admin_read
on public.platform_feature_flags
for select to authenticated
using (public.is_admin());

-- Direct table grants remain revoked. Admin access is intentionally exposed
-- through audited RPCs, while this policy keeps the RLS posture explicit.
