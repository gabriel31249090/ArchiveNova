import type { Metadata } from 'next'
import { NotificationSettings } from '@/components/notifications/notification-settings'
export const metadata:Metadata={title:'Preferências de notificações',robots:{index:false,follow:false}}
export default function Page(){return <NotificationSettings/>}
