import type { Metadata } from 'next'
import { NotificationsCenter } from '@/components/notifications/notifications-center'
import '../novadrop-v47-shared.css'
export const metadata: Metadata = { title: 'Notificações', robots: { index: false, follow: false } }
export default function NotificationsPage() { return <NotificationsCenter /> }
