ArchiveNova v3 — Fase 1: Landing page + navegação

Arquivos alterados:
- app/page.tsx
- app/layout.tsx
- app/globals.css
- app/explore/page.tsx (NOVO)
- components/archive-nova-app.tsx
- components/landing/landing-page.tsx (NOVO)

Como aplicar no GitHub:
1. Mantenha o Root Directory da Vercel em archive-nova-vercel.
2. Substitua os arquivos acima pelos equivalentes deste patch.
3. Crie as duas pastas novas se necessário: app/explore e components/landing.
4. Faça commit. A Vercel deve fazer o deploy automaticamente.

O que muda:
- / agora é uma landing page dedicada.
- /explore abre o ArchiveNova funcional diretamente na busca/exploração.
- A landing usa platform_stats e active_fandoms do banco real; não há obras/fandoms fake.
- O app antigo continua intacto dentro de /explore.
- A marca e o botão Início do app apontam para a nova landing page.

Esta fase NÃO troca ainda o editor/publicador antigo. Isso será a Fase 2.
