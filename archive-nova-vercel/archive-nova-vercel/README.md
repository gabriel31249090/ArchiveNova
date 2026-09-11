# Archive Nova v2 — Vercel + Supabase

Archive Nova é uma base funcional para um arquivo comunitário de histórias inspirado em sistemas de arquivo como o AO3, mantendo o redesign visual criado na v1, mas substituindo completamente a arquitetura Java/Spring por uma arquitetura adequada à Vercel e ao Supabase.

**Não há dados falsos ou seeds de demonstração.** Um banco novo começa com 0 usuários, 0 obras, 0 fandoms, 0 tags, 0 kudos e 0 comentários.

## Stack

- Next.js 16.3.4 (App Router)
- React 19.3
- TypeScript
- Vercel para frontend, SSR e Route Handlers
- Supabase Auth para cadastro/login/sessões
- Supabase PostgreSQL para dados
- Row Level Security (RLS) para autorização
- Supabase Storage para avatares e capas
- Supabase migrations para versionamento do banco

A antiga stack Spring Boot/PostgreSQL local/Docker foi removida. O PostgreSQL continua existindo, mas agora é administrado pelo Supabase.

## Estrutura

```text
archive-nova/
├─ app/
│  ├─ api/works/[id]/hit/route.ts   # contabilização de hits no servidor
│  ├─ auth/confirm/route.ts         # confirmação de e-mail Supabase
│  ├─ auth/error/page.tsx
│  ├─ globals.css                   # layout visual preservado
│  ├─ layout.tsx
│  └─ page.tsx
├─ components/
│  ├─ archive-nova-app.tsx
│  └─ work-card.tsx
├─ lib/
│  ├─ supabase/client.ts
│  ├─ supabase/server.ts
│  ├─ supabase/admin.ts
│  ├─ supabase/proxy.ts
│  ├─ format.ts
│  └─ types.ts
├─ supabase/
│  ├─ migrations/202609100001_initial_schema.sql
│  ├─ config.toml
│  └─ seed.sql                      # vazio de propósito
├─ proxy.ts                         # renovação da sessão em cookies
├─ .env.example
├─ package.json
└─ vercel.json
```

## 1. Criar o projeto no Supabase

Crie um projeto vazio no Supabase. Depois instale a Supabase CLI e, dentro desta pasta:

```bash
supabase login
supabase link
supabase db push
```

A migration cria as tabelas, índices, funções RPC, triggers, RLS e os buckets `avatars` e `work-covers`.

Não adicione dados de exemplo. `supabase/seed.sql` é vazio deliberadamente.

## 2. Configurar autenticação no Supabase

Em **Authentication → URL Configuration**:

- Site URL local: `http://localhost:3000`
- Adicione `http://localhost:3000/**` aos Redirect URLs
- Depois do deploy, adicione também `https://SEU-DOMINIO.vercel.app/**` e seu domínio final.

Para confirmação de e-mail por SSR, em **Authentication → Email Templates → Confirm signup**, use um link no formato:

```text
{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

## 3. Configurar variáveis locais

Copie `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

Preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
HIT_HASH_SALT=uma-string-aleatoria-bem-grande
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` pode ficar no browser porque o acesso real é controlado por grants + RLS.

`SUPABASE_SECRET_KEY` **nunca** deve usar prefixo `NEXT_PUBLIC_`. Ela ignora RLS e é usada apenas no Route Handler de hits.

## 4. Rodar localmente

Requer Node.js 20.9 ou superior.

```bash
npm install
npm run dev
```

Abra:

```text
http://localhost:3000
```

## 5. Publicar na Vercel

1. Envie a pasta para um repositório GitHub/GitLab/Bitbucket.
2. Importe o repositório na Vercel.
3. A Vercel detectará Next.js automaticamente.
4. Em **Project → Settings → Environment Variables**, adicione as cinco variáveis do `.env.local`.
5. Faça o deploy.
6. Copie a URL final da Vercel para os Redirect URLs do Supabase.

Não é necessário Docker, VPS, Java, Maven ou configurar um servidor separado.

## Funcionalidades já conectadas ao banco real

- cadastro com Supabase Auth;
- confirmação de e-mail compatível com SSR;
- login/logout e sessão em cookies;
- perfis ligados a `auth.users`;
- publicação de obra e primeiro capítulo em transação RPC;
- novos capítulos;
- fandoms e tags persistidos no Postgres;
- busca avançada e paginação;
- filtros por fandom, rating, status, palavras e tags;
- kudos;
- bookmarks e biblioteca;
- comentários;
- histórico de leitura;
- contadores de palavras/capítulos/kudos/bookmarks/comentários/hits;
- obra aleatória;
- estatísticas reais da home;
- Storage estruturado para avatares e capas;
- tabelas preparadas para séries, coleções, subscriptions, notificações, bloqueios, denúncias e auditoria.

## Segurança

O navegador usa somente a publishable key. Toda tabela exposta possui RLS. Operações complexas usam funções PostgreSQL com validação de `auth.uid()`. O endpoint de hits usa a secret key somente no servidor e armazena um hash diário de IP + user-agent + salt, não o IP bruto.

Leia `docs/SECURITY.md` antes de colocar o site em produção pública.

## Observação sobre a v1

Esta versão não tenta executar Spring Boot na Vercel. Isso seria uma arquitetura ruim para o objetivo do projeto. Os conceitos do banco da v1 foram preservados e remodelados para o Supabase, enquanto autenticação/sessões próprias foram substituídas por Supabase Auth.
