ARCHIVE NOVA v3 — FASE 2: WRITER

O que entra nesta fase
- Nova rota /write
- Editor rico com Tiptap
- Negrito, itálico, sublinhado, tachado
- H1/H2, listas, citação, separador e alinhamento
- Desfazer/refazer e limpar formatação
- Contagem de palavras e caracteres
- Autosave local com restauração automática do rascunho
- Tela cheia
- Importação inicial de TXT, Markdown e HTML
- Botões da landing e do Explore apontando para /write

IMPORTANTE
O rascunho desta fase é salvo no localStorage do navegador. Ele ainda NÃO está sincronizado com a conta Supabase.
A próxima fase cria a tabela de rascunhos, autosave em nuvem e o fluxo /publish.

Arquivos alterados/adicionados
- package.json
- app/globals.css
- app/write/page.tsx
- components/editor/story-editor.tsx
- components/landing/landing-page.tsx
- components/archive-nova-app.tsx

Dependências adicionadas
- @tiptap/react 3.31.3
- @tiptap/starter-kit 3.31.3
- @tiptap/extension-placeholder 3.31.3
- @tiptap/extension-text-align 3.31.3

Como instalar pelo GitHub
Copie os arquivos do patch respeitando os caminhos acima para dentro de archive-nova-vercel/.
Não envie a pasta do patch inteira para a raiz do repositório.

A Vercel instalará as novas dependências automaticamente no próximo deploy.
