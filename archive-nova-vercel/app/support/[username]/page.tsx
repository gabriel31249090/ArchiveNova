import { SupportPage } from '@/components/support/support-page'
export default async function Page({ params }: { params: Promise<{ username: string }> }) { const { username } = await params; return <SupportPage username={username} /> }
