ArchiveNova v3 — Fase 5: Writer Pro + Importação + UI/UX

VERSÃO
- package.json: 3.0.0-beta.5
- Node.js fixado em 22.x para estabilidade no deploy.

O QUE ENTROU
- Editor Writer Pro redesenhado para desktop e celular.
- Fontes, tamanho de texto, cores, marca-texto, H1/H2/H3.
- Negrito, itálico, sublinhado, tachado, subscrito e sobrescrito.
- Alinhamento esquerda/centro/direita/justificado.
- Espaçamento entre linhas e recuo de primeira linha.
- Listas, citações, linhas divisórias, links e tabelas.
- Quebra de página visível no editor e preparada para impressão/PDF.
- Localizar/substituir, modo foco, modo leitura e tela cheia.
- Contagem de palavras/caracteres e tempo estimado de leitura.
- Atalhos Ctrl/Cmd+S, Ctrl/Cmd+F e Ctrl/Cmd+K.
- Importação com prévia e opção de substituir ou anexar conteúdo.
- Formatos: DOCX, PDF, TXT, Markdown, HTML e RTF.
- .DOC legado exibe orientação para converter para DOCX.
- Arrastar e soltar arquivos sobre /write.
- Sanitização de HTML importado e do conteúdo enviado à publicação.
- Toolbar compacta, bottom dock e modal bottom-sheet no celular.
- Animações e feedbacks sutis, respeitando prefers-reduced-motion.
- Melhorias de responsividade também em cards, leitura, publicação e gerenciamento.

IMPORTANTE
- Não há SQL novo nesta fase.
- O autosave continua local no navegador, como combinado. Rascunhos no Supabase ficam para a fase final.
- PDF é importado principalmente como texto; layouts complexos podem perder formatação.
- DOCX preserva estrutura semântica (títulos, parágrafos, negrito etc.) quando possível.

COMO SUBIR
1. No github.dev, substitua a pasta archive-nova-vercel pela pasta desta versão.
2. Commit sugerido: ArchiveNova v3 - Fase 5 Writer Pro
3. A Vercel deve mostrar: archive-nova@3.0.0-beta.5 build
4. Teste /write no desktop e no celular e experimente importar DOCX/PDF/TXT.
