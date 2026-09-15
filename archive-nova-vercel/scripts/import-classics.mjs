import { createClient } from '@supabase/supabase-js'

const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL
const key=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!key) throw new Error('Defina SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})

const books=[
['dom-casmurro','Dom Casmurro','55752','H. Garnier, 1899/1900','Bento Santiago reconstrói a juventude, o seminário, o casamento com Capitu e a suspeita que corrói sua memória, numa narrativa marcada pela ambiguidade.','dom'],
['memorias-postumas-de-bras-cubas','Memórias Póstumas de Brás Cubas','54829','Rio de Janeiro: Typographia Nacional, 1881','Brás Cubas narra a própria vida depois da morte, revendo ambições, amores, privilégios e fracassos com ironia e pessimismo.','bras'],
['quincas-borba','Quincas Borba','55682','Rio de Janeiro: B. L. Garnier, 1891','Rubião herda a fortuna e as ideias de Quincas Borba e se muda para o Rio de Janeiro, onde amizade, ambição e delírio se entrelaçam.','quincas'],
['helena','Helena','67162','Rio de Janeiro: B. L. Garnier, 1876','Após a morte do Conselheiro Vale, Helena é reconhecida por testamento e entra numa família que desconhecia, cercada por afeto, segredo e conflito.','helena'],
]
const rights='Obra de Machado de Assis (1839–1908), em domínio público no Brasil. Edição digital indicada pelo Project Gutenberg, classificada por ele como domínio público nos Estados Unidos. Autoria e fonte preservadas pelo Archive Nova.'

function clean(raw){
  let text=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n')
  const start=text.search(/\*\*\*\s*START OF (?:THE )?PROJECT GUTENBERG EBOOK/i)
  if(start>=0){const nl=text.indexOf('\n',start);text=text.slice(nl+1)}
  const end=text.search(/\*\*\*\s*END OF (?:THE )?PROJECT GUTENBERG EBOOK/i)
  if(end>=0)text=text.slice(0,end)
  return text
}
function chapters(kind,raw){
  const lines=clean(raw).split('\n')
  let h=lines.map((line,index)=>({line:line.trim(),index}))
  if(kind==='dom')h=h.filter(x=>/^[IVXLCDM]{1,8}\.?$/.test(x.line))
  else if(kind==='bras')h=h.filter(x=>/^CAP[IÍ]TULO\s+(?:PRIMEIRO|[IVXLCDM]+)\s*\//i.test(x.line))
  else h=h.filter(x=>/^CAPITULO\s+(?:PRIMEIRO|[IVXLCDM]+)\.?$/i.test(x.line))
  if(kind==='helena'&&h.length>28)h=h.slice(-28)
  return h.map((x,i)=>{
    const end=h[i+1]?.index??lines.length
    let start=x.index+1,title=null
    if(kind==='dom'){while(start<end&&!lines[start].trim())start++;title=(lines[start]?.trim()||'').replace(/\.$/,'')||null;start++}
    if(kind==='bras')title=x.line.replace(/^CAP[IÍ]TULO\s+(?:PRIMEIRO|[IVXLCDM]+)\s*\/\s*/i,'').trim()||null
    const body=lines.slice(start,end).join('\n').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim()
    return {chapter_number:i+1,title,content_text:body,word_count:(body.match(/\S+/g)||[]).length}
  })
}
for(const [slug,title,id,original,summary,kind] of books){
  console.log('→ '+title)
  const response=await fetch('https://www.gutenberg.org/ebooks/'+id+'.txt.utf-8',{headers:{'User-Agent':'ArchiveNova-Classics-Importer/1.0'},redirect:'follow'})
  if(!response.ok)throw new Error(title+': HTTP '+response.status)
  const list=chapters(kind,await response.text())
  const {data:book,error}=await supabase.from('classic_books').upsert({
    slug,title,author_name:'Machado de Assis',language:'pt-BR',summary,original_publication:original,
    source_name:'Project Gutenberg',source_url:'https://www.gutenberg.org/ebooks/'+id,source_id:'eBook #'+id,
    copyright_note:rights,published:false,updated_at:new Date().toISOString()
  },{onConflict:'slug'}).select('id').single()
  if(error)throw error
  const del=await supabase.from('classic_chapters').delete().eq('book_id',book.id);if(del.error)throw del.error
  for(let i=0;i<list.length;i+=25){
    const ins=await supabase.from('classic_chapters').insert(list.slice(i,i+25).map(c=>({...c,book_id:book.id})))
    if(ins.error)throw ins.error
  }
  const words=list.reduce((n,c)=>n+c.word_count,0)
  const pub=await supabase.from('classic_books').update({chapter_count:list.length,word_count:words,published:true,updated_at:new Date().toISOString()}).eq('id',book.id)
  if(pub.error)throw pub.error
  console.log('  ✓ '+list.length+' capítulos · '+words.toLocaleString('pt-BR')+' palavras')
}
