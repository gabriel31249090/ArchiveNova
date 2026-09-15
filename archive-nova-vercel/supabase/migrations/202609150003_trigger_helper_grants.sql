-- ArchiveNova v4.6.1 — Trigger helper grants
-- Trigger functions run without caller EXECUTE privileges, but security-invoker
-- triggers may call helper functions that still require EXECUTE for authenticated.

grant execute on function public.slugify(text) to authenticated;
grant execute on function public.count_words(text) to authenticated;
