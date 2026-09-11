import type { Metadata } from 'next'
import { StoryEditor } from '../../components/editor/story-editor'

export const metadata: Metadata = {
  title: 'Escrever — Archive Nova',
  description: 'Editor de histórias do Archive Nova.',
}

export default function WritePage() {
  return <StoryEditor />
}
