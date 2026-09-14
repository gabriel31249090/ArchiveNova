import type { Metadata } from 'next'
import { LibraryStudio } from '@/components/library/library-studio'
export const metadata: Metadata={title:'Library Studio',robots:{index:false,follow:false}}
export default function Page(){return <LibraryStudio/>}
