# Migração da v1 (Spring Boot) para a v2 (Vercel + Supabase)

## Removido

- `pom.xml`
- Spring Boot
- Spring Security
- Spring Session JDBC
- controllers/repositories/services Java
- Flyway
- `Dockerfile`
- `docker-compose.yml`
- tabela `users.password_hash`
- tabelas de tokens de confirmação/reset próprias
- tabelas `spring_session*`

## Substituído por

- Next.js App Router na Vercel
- Supabase Auth
- `auth.users` + `public.profiles`
- `@supabase/ssr` para cookies
- Supabase migrations
- PostgreSQL RLS
- Supabase Storage
- Route Handlers da Vercel para ações que realmente exigem segredo de servidor

## Preservado conceitualmente

- obras e autores;
- capítulos;
- fandoms/tags/aliases;
- kudos;
- bookmarks;
- comentários;
- histórico;
- subscriptions;
- séries;
- coleções;
- notificações;
- bloqueios;
- denúncias;
- auditoria.

## Dados

A v1 distribuída nesta conversa já foi construída para começar vazia, portanto a v2 não inclui importação automática de conteúdo de demonstração. Se um banco real da v1 for populado no futuro, crie uma migration/ETL separada para mapear IDs de usuário antigos para IDs de `auth.users`; não copie hashes de senha para o Supabase.
