ArchiveNova v3 — Fase 4: Explorar e filtros

O que mudou:
- Busca principal do /explore redesenhada.
- Debounce de 260 ms para evitar uma requisição ao Supabase a cada tecla.
- Contagem visual de resultados e estado de carregamento.
- Filtros rápidos: concluídas, em andamento, 50 mil+ palavras e ocultar Explicit.
- Painel de filtros redesenhado sem selects feios para fandom, rating e status.
- Fandoms ativos com contagem de obras.
- Presets de tamanho (1k+, 10k+, 50k+, 100k+).
- Tags de inclusão/exclusão mantidas.
- Chips de filtros ativos removíveis individualmente.
- Ordenação mais clara: recentes, em alta e mais longas.
- Grade/lista preservadas.
- Drawer de filtros no celular.
- Skeleton durante o primeiro carregamento.
- Estado vazio mais útil.
- Paginação redesenhada.

Banco de dados:
Nenhuma migration nova é necessária nesta fase. A Fase 4 usa a RPC search_works já existente.

Versão esperada no log da Vercel:
archive-nova@3.0.0-beta.4
