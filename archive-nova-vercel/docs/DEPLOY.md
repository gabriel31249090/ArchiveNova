# Deploy Vercel + Supabase

## Supabase

```bash
supabase login
supabase link
supabase db push
```

Depois configure Site URL, Redirect URLs e template de confirmação de e-mail conforme o README.

## Vercel

Importe o repositório e adicione:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `HIT_HASH_SALT`

A Vercel usa `npm run build` automaticamente.

## Ambientes

Use projetos Supabase separados para produção e desenvolvimento quando o projeto crescer. Na Vercel, mantenha variáveis diferentes para Preview e Production.
