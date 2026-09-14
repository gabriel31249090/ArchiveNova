import Link from 'next/link'
import { NovaHeader } from '@/components/shared/nova-header'

export default function NotFound() {
  return (
    <>
      <NovaHeader title="Página não encontrada" />
      <main className="support-page">
        <section className="profile-not-found">
          <span>✦</span>
          <h1>Este caminho não existe no arquivo.</h1>
          <p>O link pode ter mudado, sido removido ou nunca ter existido.</p>
          <Link className="primary-button" href="/home">Voltar ao início</Link>
        </section>
      </main>
    </>
  )
}
