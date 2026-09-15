import type { Metadata } from 'next'
import { ProfileSettings } from '@/components/profile/profile-settings'
import '../../novadrop-v47-shared.css'
export const metadata: Metadata = { title: 'Configurações do perfil', robots: { index: false, follow: false } }
export default function ProfileSettingsPage() { return <ProfileSettings /> }
