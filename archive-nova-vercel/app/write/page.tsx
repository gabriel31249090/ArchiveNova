import type { Metadata } from 'next'
import { StoryEditor } from '../../components/editor/story-editor'

export const metadata: Metadata = {
  title: 'Writer Pro — Archive Nova',
  description: 'Editor avançado do Archive Nova com formatação rica e importação de documentos.',
}

export default function WritePage() {
  return <StoryEditor />
}
