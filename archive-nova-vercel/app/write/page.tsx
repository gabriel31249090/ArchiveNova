import type { Metadata } from 'next'
import { WriterStart } from '@/components/editor/writer-start'
export const metadata: Metadata = { title: 'Writer', robots: { index: false, follow: false } }
export default function WritePage() { return <WriterStart /> }
