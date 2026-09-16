-- ArchiveNova v4.9.1 — final stabilization
-- Cover Writer Experience foreign keys that are used by ownership checks,
-- cascades and workspace queries. Tables remain RPC-only by design.

create index if not exists writer_activity_draft_idx
  on public.writer_activity(draft_id);

create index if not exists writer_annotations_chapter_idx
  on public.writer_annotations(chapter_id);

create index if not exists writer_annotations_user_idx
  on public.writer_annotations(user_id);

create index if not exists writer_beta_feedback_chapter_idx
  on public.writer_beta_feedback(chapter_id);

create index if not exists writer_beta_feedback_invite_idx
  on public.writer_beta_feedback(invite_id);

create index if not exists writer_beta_feedback_reader_idx
  on public.writer_beta_feedback(reader_id);

create index if not exists writer_beta_invites_owner_idx
  on public.writer_beta_invites(owner_id);

create index if not exists writer_beta_invites_reader_idx
  on public.writer_beta_invites(reader_id);

create index if not exists writer_draft_versions_draft_idx
  on public.writer_draft_versions(draft_id);

create index if not exists writer_draft_versions_user_idx
  on public.writer_draft_versions(user_id);

create index if not exists writer_story_assets_user_idx
  on public.writer_story_assets(user_id);
