ARCHIVENOVA v3.0.0 — FASE FINAL
Writer Cloud + autosave sincronizado + rascunhos multi-capítulo

O QUE FOI ADICIONADO
- Rascunhos reais no Supabase vinculados ao usuário.
- /write agora migra automaticamente o rascunho local antigo para a nuvem quando o usuário está logado.
- Nova rota /write/[draftId].
- Autosave com debounce e cópia local de segurança.
- Indicadores: Salvando, Salvo, Alterações pendentes, Sem conexão e Conflito de versão.
- Continuidade entre PC/celular usando a mesma conta.
- Proteção contra sobrescrever uma versão mais nova de outro dispositivo.
- Resolução explícita de conflito: usar nuvem ou manter versão local.
- Escrita offline do capítulo atual e sincronização automática quando a conexão voltar.
- Rascunhos com múltiplos capítulos.
- Adicionar, alternar e excluir capítulos no Writer.
- Creator Studio agora possui aba Rascunhos.
- Renomear, duplicar, excluir e continuar rascunhos pelo Studio.
- Nova rota /publish/[draftId].
- Publicação transacional de todos os capítulos do rascunho.
- Após publicar, o rascunho é removido da área de rascunhos.
- RLS garante que somente o dono veja ou altere seus rascunhos.

ORDEM PARA INSTALAR
1. No Supabase, abra SQL Editor > New query.
2. Execute somente o arquivo ArchiveNova_Final_Supabase.sql / migration 202609140003_cloud_drafts.sql.
3. NÃO execute novamente as migrations antigas.
4. Substitua archive-nova-vercel/ no GitHub pela pasta do ZIP COMPLETO.
5. Commit sugerido: ArchiveNova v3.0.0 - Writer Cloud Final
6. Aguarde o deploy da Vercel.

BUILD ESPERADO
> archive-nova@3.0.0 build
> next build

ROTAS NOVAS
/write/[draftId]
/publish/[draftId]

TESTE RECOMENDADO
1. Entre na conta e abra /write.
2. Escreva algo e aguarde “Salvo”.
3. Abra o mesmo rascunho no celular/segunda aba e confirme o conteúdo.
4. Teste ficar offline, escrever e voltar online.
5. Adicione um segundo capítulo.
6. Abra Studio > Rascunhos.
7. Teste renomear e duplicar.
8. Publique o rascunho e confirme que todos os capítulos foram publicados.
