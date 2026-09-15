import type { Metadata } from 'next'
import '../../novadrop-v48.css'
import { NovaCareStaff } from '@/components/support/novacare-staff'

export const metadata: Metadata = {
  title: 'NovaCare Staff',
  robots: { index: false, follow: false },
}

export default function NovaCareStaffPage(){ return <NovaCareStaff/> }
