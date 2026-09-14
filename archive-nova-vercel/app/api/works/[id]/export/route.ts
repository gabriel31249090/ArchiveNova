import { NextResponse, type NextRequest } from 'next/server'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function textFromHtml(html:string){
  return html
    .replace(/<\s*br\s*\/?>/gi,'\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi,'\n')
    .replace(/<li[^>]*>/gi,'• ')
    .replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\n{3,}/g,'\n\n').trim()
}

function safeName(value:string){
  return (value||'archive-nova').normalize('NFKD').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-').slice(0,80)||'archive-nova'
}

function wrap(text:string,max=88){
  const out:string[]=[]
  for(const paragraph of text.split(/\n/)){
    if(!paragraph.trim()){out.push('');continue}
    let line=''
    for(const word of paragraph.split(/\s+/)){
      const next=line?line+' '+word:word
      if(next.length>max&&line){out.push(line);line=word}else line=next
    }
    if(line)out.push(line)
  }
  return out
}

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params
  if(!UUID_RE.test(id))return NextResponse.json({error:'invalid_work_id'},{status:400})
  const format=(request.nextUrl.searchParams.get('format')||'txt').toLowerCase()
  if(!['txt','docx','pdf','epub'].includes(format))return NextResponse.json({error:'unsupported_format'},{status:400})

  const supabase=await createClient()
  const user=(await supabase.auth.getUser()).data.user
  if(!user)return NextResponse.json({error:'auth_required'},{status:401})

  const {data:work,error:workError}=await supabase.from('works').select('id,title,summary,language,creator_id').eq('id',id).maybeSingle()
  if(workError||!work||work.creator_id!==user.id)return NextResponse.json({error:'not_owner'},{status:403})
  const {data:chapters,error:chapterError}=await supabase.from('chapters').select('chapter_number,title,content,notes_before,notes_after').eq('work_id',id).order('chapter_number')
  if(chapterError)return NextResponse.json({error:'load_failed'},{status:500})

  const chapterList=(chapters||[]).map(ch=>({
    number:Number(ch.chapter_number),
    title:String(ch.title||('Capítulo '+ch.chapter_number)),
    text:textFromHtml(String(ch.content||'')),
    before:String(ch.notes_before||''),
    after:String(ch.notes_after||''),
  }))
  const file=safeName(String(work.title))

  if(format==='txt'){
    const body=[
      String(work.title),'','Resumo',String(work.summary||''),'',
      ...chapterList.flatMap(ch=>['='.repeat(72),'Capítulo '+ch.number+' — '+ch.title,'',ch.before?('Nota do autor: '+ch.before):'',ch.text,ch.after?('Nota final: '+ch.after):'',''])
    ].join('\n')
    return new NextResponse(body,{headers:{'content-type':'text/plain; charset=utf-8','content-disposition':'attachment; filename="'+file+'.txt"'}})
  }

  if(format==='docx'){
    const children:Paragraph[]=[
      new Paragraph({text:String(work.title),heading:HeadingLevel.TITLE}),
      new Paragraph({text:String(work.summary||'')}),
    ]
    for(const ch of chapterList){
      children.push(new Paragraph({text:'Capítulo '+ch.number+' — '+ch.title,heading:HeadingLevel.HEADING_1}))
      if(ch.before)children.push(new Paragraph({children:[new TextRun({text:'Nota do autor: '+ch.before,italics:true})]}))
      for(const p of ch.text.split(/\n+/).filter(Boolean))children.push(new Paragraph({text:p}))
      if(ch.after)children.push(new Paragraph({children:[new TextRun({text:'Nota final: '+ch.after,italics:true})]}))
    }
    const doc=new Document({sections:[{properties:{},children}]})
    const bytes=await Packer.toBuffer(doc)
    return new NextResponse(new Uint8Array(bytes),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','content-disposition':'attachment; filename="'+file+'.docx"'}})
  }

  if(format==='pdf'){
    const pdf=await PDFDocument.create()
    const font=await pdf.embedFont(StandardFonts.TimesRoman)
    const bold=await pdf.embedFont(StandardFonts.TimesRomanBold)
    const margin=54
    let page=pdf.addPage([595.28,841.89]);let y=787
    const addLine=(line:string,size=11,isBold=false)=>{
      if(y<60){page=pdf.addPage([595.28,841.89]);y=787}
      page.drawText(line,{x:margin,y,size,font:isBold?bold:font,maxWidth:487})
      y-=size*1.55
    }
    addLine(String(work.title),22,true);y-=8
    for(const line of wrap(String(work.summary||''),76))addLine(line,11)
    for(const ch of chapterList){
      y-=18;addLine('Capítulo '+ch.number+' — '+ch.title,16,true);y-=4
      if(ch.before)for(const line of wrap('Nota do autor: '+ch.before,80))addLine(line,10)
      for(const line of wrap(ch.text,86))addLine(line,11)
      if(ch.after){y-=5;for(const line of wrap('Nota final: '+ch.after,80))addLine(line,10)}
    }
    const bytes=await pdf.save()
    return new NextResponse(bytes,{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="'+file+'.pdf"'}})
  }

  const zip=new JSZip()
  zip.file('mimetype','application/epub+zip',{compression:'STORE'})
  zip.file('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const manifest=chapterList.map((_,i)=>'<item id="c'+(i+1)+'" href="chapter-'+(i+1)+'.xhtml" media-type="application/xhtml+xml"/>').join('')
  const spine=chapterList.map((_,i)=>'<itemref idref="c'+(i+1)+'"/>').join('')
  zip.file('OEBPS/content.opf','<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">'+id+'</dc:identifier><dc:title>'+esc(String(work.title))+'</dc:title><dc:language>'+esc(String(work.language||'pt-BR'))+'</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'+manifest+'</manifest><spine>'+spine+'</spine></package>')
  const navItems=chapterList.map((ch,i)=>'<li><a href="chapter-'+(i+1)+'.xhtml">'+esc('Capítulo '+ch.number+' — '+ch.title)+'</a></li>').join('')
  zip.file('OEBPS/nav.xhtml','<!doctype html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Sumário</title></head><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><h1>Sumário</h1><ol>'+navItems+'</ol></nav></body></html>')
  chapterList.forEach((ch,i)=>zip.file('OEBPS/chapter-'+(i+1)+'.xhtml','<!doctype html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+esc(ch.title)+'</title></head><body><h1>'+esc('Capítulo '+ch.number+' — '+ch.title)+'</h1>'+ch.text.split(/\n+/).filter(Boolean).map(p=>'<p>'+esc(p)+'</p>').join('')+'</body></html>'))
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})
  return new NextResponse(bytes,{headers:{'content-type':'application/epub+zip','content-disposition':'attachment; filename="'+file+'.epub"'}})
}
