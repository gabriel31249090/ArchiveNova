import type { Metadata } from 'next'
import Link from 'next/link'
import '../../novadrop-v48.css'
import { NovaHeader } from '@/components/shared/nova-header'
import { JsonLd } from '@/components/seo/json-ld'
import { getClassicBook,getClassicChapter } from '@/lib/classics'
import { absoluteUrl } from '@/lib/site'

type Props={params:Promise<{slug:string}>;searchParams:Promise<{chapter?:string}>}

export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {slug}=await params
  const data=await getClassicBook(slug)
  if(!data)return{title:'Clássico indisponível',robots:{index:false,follow:false}}
  const book=data.book
  return{
    title:book.title,
    description:book.summary||('Leia '+book.title+', de '+book.author_name+', no ArchiveNova Classics.'),
    alternates:{canonical:'/classics/'+encodeURIComponent(book.slug)},
    openGraph:{type:'book',title:book.title,description:book.summary,url:'/classics/'+encodeURIComponent(book.slug)},
    robots:{index:true,follow:true},
  }
}

export default async function ClassicBookPage({params,searchParams}:Props){
  const {slug}=await params
  const query=await searchParams
  const bookData=await getClassicBook(slug)
  if(!bookData)return <><NovaHeader title="Classics"/><main className="classics-page"><div className="profile-not-found"><span>✦</span><h1>Livro não encontrado.</h1><Link className="primary-button" href="/classics">Voltar à coleção</Link></div></main></>
  const chapterNumber=Math.max(1,Math.min(Number(query.chapter||1)||1,Math.max(1,bookData.book.chapter_count)))
  const chapterData=await getClassicChapter(slug,chapterNumber)
  const book=bookData.book
  const chapter=chapterData?.chapter
  const paragraphs=(chapter?.content_text||'').split(/\n\s*\n/g).map(value=>value.trim()).filter(Boolean)

  const jsonLd={'@context':'https://schema.org','@type':'Book',name:book.title,author:{'@type':'Person',name:book.author_name},inLanguage:book.language,url:absoluteUrl('/classics/'+encodeURIComponent(book.slug)),isAccessibleForFree:true,publisher:{'@type':'Organization',name:'Archive Nova'},sameAs:book.source_url}

  return <>
    <JsonLd value={jsonLd}/>
    <NovaHeader title="Classics"/>
    <main className="classic-reader-page">
      <aside className="classic-reader-sidebar">
        <Link href="/classics" className="classic-back">← Classics</Link>
        <p className="eyebrow">Livro</p><h1>{book.title}</h1><p className="classic-author">{book.author_name}</p>
        <nav aria-label="Capítulos">{bookData.chapters.map(item=><Link className={item.chapter_number===chapterNumber?'active':''} key={item.id} href={'/classics/'+encodeURIComponent(slug)+'?chapter='+item.chapter_number}><span>{item.chapter_number}</span>{item.title||('Capítulo '+item.chapter_number)}</Link>)}</nav>
      </aside>
      <article className="classic-reader">
        <header><div><p className="eyebrow">{'Capítulo '+chapterNumber+' de '+book.chapter_count}</p><h2>{chapter?.title||('Capítulo '+chapterNumber)}</h2></div><span>{new Intl.NumberFormat('pt-BR').format(chapter?.word_count||0)} palavras</span></header>
        <div className="classic-prose">{paragraphs.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>
        <nav className="classic-reader-nav">{chapterNumber>1?<Link href={'/classics/'+encodeURIComponent(slug)+'?chapter='+(chapterNumber-1)}>← Capítulo anterior</Link>:<span/>}{chapterNumber<book.chapter_count?<Link href={'/classics/'+encodeURIComponent(slug)+'?chapter='+(chapterNumber+1)}>Próximo capítulo →</Link>:<Link href="/classics">Fim · voltar à coleção</Link>}</nav>
        <footer className="classic-source"><strong>Fonte e direitos</strong><p>{book.copyright_note}</p><a href={book.source_url} target="_blank" rel="noreferrer noopener">{book.source_name}{book.source_id?' · '+book.source_id:''} ↗</a></footer>
      </article>
    </main>
  </>
}
