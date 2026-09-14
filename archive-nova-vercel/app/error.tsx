'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { NovaHeader } from '@/components/shared/nova-header'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <>
      <NovaHeader title="Algo deu errado" />
      <main className="support-page">
        <section className="profile-not-found">
          <span>!</span>
          <h1>O Archive Nova encontrou um problema.</h1>
          <p>Você pode tentar carregar esta parte novamente sem perder o restante do site.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={reset}>Tentar novamente</button>
            <Link className="secondary-button" href="/home">Ir para o início</Link>
          </div>
        </section>
      </main>
    </>
  )
}
