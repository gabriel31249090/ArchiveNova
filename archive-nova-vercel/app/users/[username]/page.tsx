import { PublicProfilePage } from '@/components/profile/public-profile-page'

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return <PublicProfilePage username={username} />
}
