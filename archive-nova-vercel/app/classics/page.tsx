import type { Metadata } from 'next'
import Link from 'next/link'
import '../novadrop-v48.css'
import { NovaHeader } from '@/components/shared/nova-header'
import { JsonLd } from '@/components/seo/json-ld'
import { getClassicsCatalog } from '@/lib/classics'
import { absoluteUrl } from '@/lib/site'

export const metadata:Metadata={
  title:'ArchiveNova Classics',
  description:'Clássicos em domínio público, com autoria e fonte preservadas, para leitura gratuita no Archive Nova.',
  alternates:{canonical:'/classics'},
  openGraph:{title:'ArchiveNova Classics',description:'Clássicos em domínio público para leitura gratuita.',url:'/classics'},
  robots:{index:true,follow:true},
}

export default async function ClassicsPage(){
  const books=await getClassicsCatalog()
  const jsonLd={
    '@context':'https://schema.org','@type':'CollectionPage',
    name:'ArchiveNova Classics',url:absoluteUrl('/classics'),
    hasPart:books.map(book=>({'@type':'Book',name:book.title,author:{'@type':'Person',name:book.author_name},url:absoluteUrl('/classics/'+encodeURIComponent(book.slug))}))
  }
  return <>
    <JsonLd value={jsonLd}/>
    <NovaHeader title="Classics"/>
    <main className="classics-page">
      <section className="classics-hero nova-aurora-surface">
        <div><p className="eyebrow">ArchiveNova Classics</p><h1>Livros que sobreviveram ao tempo.</h1><p>Uma biblioteca curada de obras em domínio público. A autoria original, a fonte digital e a nota de direitos ficam sempre visíveis.</p></div>
        <div className="classics-seal"><span>✦</span><strong>Domínio público</strong><small>fonte verificada</small></div>
      </section>
      <section className="classics-grid">
        {books.map((book,index)=><Link href={'/classics/'+encodeURIComponent(book.slug)} className="classic-card nova-spotlight-card" key={book.id}>
          <div className="classic-cover"><span>{String(index+1).padStart(2,'0')}</span><strong>{book.title}</strong><small>{book.author_name}</small></div>
          <div className="classic-card-copy"><p className="eyebrow">{book.original_publication||'Clássico'}</p><h2>{book.title}</h2><p>{book.summary}</p><footer><span>{book.chapter_count} capítulos</span><span>{new Intl.NumberFormat('pt-BR',{notation:'compact'}).format(book.word_count)} palavras</span></footer></div>
        </Link>)}
        {!books.length?<div className="studio-empty large"><span>✦</span><h2>A coleção está sendo preparada</h2><p>Os primeiros clássicos aparecerão aqui assim que a importação editorial terminar.</p></div>:null}
      </section>
    </main>
  </>
}
