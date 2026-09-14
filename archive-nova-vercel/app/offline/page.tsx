import Link from 'next/link'
export default function OfflinePage(){
 return <main className="offline-page"><section><span>✦</span><p className="eyebrow">Modo offline</p><h1>Você está sem conexão.</h1><p>As páginas públicas abertas recentemente ainda podem estar disponíveis. Seus rascunhos do Writer também mantêm uma cópia local de segurança.</p><div><Link className="primary-button" href="/">Início</Link><Link className="secondary-button" href="/library">Biblioteca</Link></div></section></main>
}
