# Segurança antes de produção

## Já implementado

- RLS ativado em todas as tabelas de aplicação;
- grants explícitos para `anon` e `authenticated`;
- publishable key no browser;
- secret key restrita ao servidor;
- senhas exclusivamente no Supabase Auth;
- sessão SSR em cookies;
- publicação transacional;
- `auth.uid()` validado em RPCs privilegiadas;
- IP não é armazenado no sistema de hits: é transformado em hash diário com salt;
- buckets de Storage limitam escrita a uma pasta cujo primeiro segmento é o UUID do usuário.

## Antes de abrir ao público

1. Ative proteção contra abuso/bots no cadastro.
2. Configure SMTP próprio no Supabase para e-mails transacionais.
3. Revise políticas de conteúdo e moderação.
4. Adicione rate limiting a comentários, publicação, busca e endpoint de hits.
5. Configure CSP e demais headers de segurança.
6. Faça testes automatizados das políticas RLS usando usuários anon/authenticated diferentes.
7. Restrinja ações administrativas a endpoints server-side auditados.
8. Configure backups/PITR conforme o plano do Supabase.
9. Configure domínio próprio e URLs de autenticação definitivas.
10. Nunca copie `SUPABASE_SECRET_KEY` para código client-side ou Git.
