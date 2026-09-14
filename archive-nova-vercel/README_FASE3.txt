ARCHIVE NOVA v3 — FASE 3
Publicação em etapas + gerenciamento de obras e capítulos

NOVAS ROTAS
- /publish
- /works/[id]/manage

NOVAS FUNÇÕES
- Publicação em 4 etapas (informações, fandoms/tags, classificação, revisão)
- Fandoms e tags com chips e autocomplete
- Edição de obra depois de publicada
- Alteração de título, resumo, rating, status, visibilidade, idioma e comentários
- Edição rica de capítulos
- Novo capítulo pelo painel de gerenciamento
- Reordenação de capítulos
- Exclusão de capítulos
- Exclusão de obra com confirmação pelo título
- Leitor compatível com conteúdo rico do TipTap

IMPORTANTE — SUPABASE
Antes de usar as funções de edição/exclusão, execute no SQL Editor do Supabase o arquivo:

supabase/migrations/202609140001_work_management.sql

Ele adiciona os RPCs update_work, update_chapter, delete_chapter, reorder_chapters e delete_work.

Não execute novamente a migration inicial.
