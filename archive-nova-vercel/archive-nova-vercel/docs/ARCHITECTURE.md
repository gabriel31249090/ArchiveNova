# Arquitetura

## Fluxo principal

```text
Browser
  │
  ├── Next.js / Vercel ────────────────┐
  │      ├─ App Router                  │
  │      ├─ SSR/session proxy           │
  │      └─ /api/works/:id/hit          │ server-only secret key
  │                                      ▼
  └── Supabase JS ─────────────────> Supabase
                                         ├─ Auth
                                         ├─ Postgres + RLS
                                         ├─ RPCs
                                         └─ Storage
```

A maior parte das ações do usuário vai diretamente do browser ao Supabase usando a publishable key. Isso é seguro somente porque grants e RLS definem exatamente quais operações cada usuário pode realizar.

A Vercel não mantém um servidor Java residente. Next.js fornece as páginas e apenas os endpoints server-side necessários.

## Sessão

Supabase Auth emite a sessão. `@supabase/ssr` armazena/atualiza a sessão em cookies. `proxy.ts` mantém os cookies sincronizados durante navegação/SSR.

## Escritas transacionais

A publicação de uma obra envolve obra + pseud + fandom + tags + relações + capítulo. Isso é realizado pela função PostgreSQL `publish_work`, evitando registros incompletos se uma etapa falhar.

## Hits

Visualizações não usam a publishable key para inserir em `work_hits`. O browser chama `/api/works/[id]/hit`. O Route Handler gera um hash diário e usa `SUPABASE_SECRET_KEY` no servidor. A constraint única impede múltiplos hits do mesmo fingerprint no mesmo dia para a mesma obra.
