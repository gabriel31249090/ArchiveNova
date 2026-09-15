import type { Metadata } from 'next'
import '../novadrop-v48.css'
import { NovaCareCenter } from '@/components/support/novacare-center'

export const metadata: Metadata = {
  title: 'NovaCare — SAC',
  description: 'Central de atendimento e suporte do Archive Nova.',
  robots: { index: false, follow: false },
}

export default function SacPage(){ return <NovaCareCenter/> }
