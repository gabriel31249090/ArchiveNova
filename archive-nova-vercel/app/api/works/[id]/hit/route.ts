import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_work_id' }, { status: 400 })

  const admin = createAdminClient()
  const salt = process.env.HIT_HASH_SALT
  if (!admin || !salt) {
    // The reader must still work even if analytics are not configured yet.
    return new NextResponse(null, { status: 204 })
  }

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown'
  const ua = request.headers.get('user-agent') || 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  const visitorHash = createHash('sha256')
    .update(`${salt}|${day}|${ip}|${ua}`)
    .digest('hex')

  const { error } = await admin
    .from('work_hits')
    .upsert(
      { work_id: id, visitor_hash: visitorHash, hit_day: day },
      { onConflict: 'work_id,visitor_hash,hit_day', ignoreDuplicates: true },
    )

  if (error) {
    console.error('Archive Nova hit tracking failed:', error.message)
  }

  return new NextResponse(null, { status: 204 })
}
