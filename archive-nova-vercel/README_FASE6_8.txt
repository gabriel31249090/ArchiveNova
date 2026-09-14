ArchiveNova v3 — Fases 6, 7 e 8
================================

Este pacote parte da Fase 5 (Writer Pro) e adiciona:

FASE 6 — CREATOR STUDIO
- /dashboard com visão geral do autor
- totais de obras, palavras, leituras, kudos, bookmarks, comentários e seguidores
- ranking das obras com melhor desempenho
- atividade recente de comentários
- busca e filtros nas próprias obras
- acesso rápido para escrever, gerenciar e visualizar
- UI mobile dedicada + navegação inferior

FASE 7 — PERFIS E PÁGINAS PÚBLICAS
- /users/[username] perfil público do autor
- seguir/deixar de seguir autor
- bloquear/desbloquear usuário
- estatísticas e biblioteca pública do autor
- /settings/profile para editar nome de exibição e bio
- /works/[id] página pública completa da obra
- reader dedicado com capítulos, tamanho de fonte, notas, kudos, bookmark e acompanhamento
- comentários e respostas
- links públicos de autor/obra integrados ao restante do site

FASE 8 — COMUNIDADE, NOTIFICAÇÕES E MODERAÇÃO
- /notifications
- notificações para kudos, comentários, respostas, seguidores e novos capítulos
- acompanhamento de obra para receber novos capítulos
- denúncias de obras e comentários
- /moderation para MODERATOR/ADMIN
- fila de denúncias, revisão, resolução, descarte e ocultação de conteúdo
- bloqueios afetam a leitura das obras entre usuários autenticados

IMPORTANTE — SUPABASE
Execute no SQL Editor o arquivo:
  supabase/migrations/202609140002_creator_social.sql

ou o arquivo avulso fornecido junto ao ZIP:
  ArchiveNova_Fase6_8_Supabase.sql

Não apague as migrations anteriores.

VERSÃO ESPERADA NO BUILD
  archive-nova@3.0.0-beta.8

ROTAS NOVAS
  /dashboard
  /users/[username]
  /works/[id]
  /settings/profile
  /notifications
  /moderation

O passo de rascunhos sincronizados no Supabase permanece separado, conforme a decisão anterior de deixá-lo para o final.
