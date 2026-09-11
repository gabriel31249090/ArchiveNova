# Banco de dados

## Identidade

`auth.users` pertence ao Supabase Auth. Não existe tabela própria de senhas.

`profiles.id` referencia `auth.users.id`. Um trigger cria automaticamente:

- `profiles`;
- `user_preferences`;
- pseud padrão em `pseuds`.

## Conteúdo

Principais tabelas:

- `works`
- `work_authors`
- `chapters`
- `fandoms`
- `tags`
- `tag_aliases`
- `work_fandoms`
- `work_tags`

## Interações

- `kudos`
- `bookmarks`
- `comments`
- `reading_history`
- `work_subscriptions`
- `work_hits`

## Organização e comunidade

- `series`
- `series_works`
- `series_subscriptions`
- `user_subscriptions`
- `collections`
- `collection_works`
- `notifications`
- `user_blocks`
- `reports`
- `audit_log`

## Contadores

`works` mantém contadores materializados para evitar `COUNT(*)` caro em cada card:

- `word_count`
- `chapter_count`
- `kudos_count`
- `bookmarks_count`
- `comments_count`
- `hits_count`

Triggers mantêm esses valores atualizados.

## API de leitura

`public_work_cards` é uma view `security_invoker`, portanto continua respeitando RLS das tabelas base.

A busca usa `search_works(...)` e retorna também `kudosed`, `bookmarked` e `total_count` para paginação.
