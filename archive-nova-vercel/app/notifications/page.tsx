import type { Metadata } from 'next'
import { NotificationsCenter } from '@/components/notifications/notifications-center'
export const metadata: Metadata = { title: 'Notificações', robots: { index: false, follow: false } }
export default function NotificationsPage() { return <NotificationsCenter /> }
