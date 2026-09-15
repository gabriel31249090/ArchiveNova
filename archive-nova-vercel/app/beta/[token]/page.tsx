import type { Metadata } from 'next'
import { BetaReader } from '@/components/editor/beta-reader'
export const metadata: Metadata = { title: 'Leitura beta', robots: { index: false, follow: false } }
export default async function BetaPage({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; return <BetaReader token={token} /> }
