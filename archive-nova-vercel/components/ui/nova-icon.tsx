import type { ReactNode, SVGProps } from 'react'

export type NovaIconName =
  | 'archive' | 'search' | 'feed' | 'posts' | 'studio' | 'bell' | 'user'
  | 'write' | 'book' | 'history' | 'help' | 'heart' | 'branch' | 'cloud'
  | 'check' | 'menu' | 'arrowRight' | 'share' | 'filter' | 'grid' | 'list'
  | 'sun' | 'moon'

type Props = SVGProps<SVGSVGElement> & {
  name: NovaIconName
  size?: number
  strokeWidth?: number
}

const paths: Record<NovaIconName, ReactNode> = {
  archive: <><path d="M12 3 9.7 8.1 4 10.4l5.7 2.3L12 18l2.3-5.3 5.7-2.3-5.7-2.3L12 3Z"/><path d="M5 3v3M3.5 4.5h3M19 17v4M17 19h4"/></>,
  search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2"/></>,
  feed: <><path d="M5 7.5a11.5 11.5 0 0 1 11.5 11.5"/><path d="M5 12.5A6.5 6.5 0 0 1 11.5 19"/><circle cx="6" cy="19" r="1.5"/></>,
  posts: <><path d="M5 5h14v10H9l-4 4V5Z"/><path d="M8 9h8M8 12h5"/></>,
  studio: <><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
  write: <><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"/></>,
  history: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 7v5l3 2"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 4.4 1.7c-1.2 1-2.1 1.5-2.1 3.3"/><path d="M12 18h.01"/></>,
  heart: <path d="M20.8 8.8c0 5.4-8.8 10.2-8.8 10.2S3.2 14.2 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z"/>,
  branch: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 7c0 5 10 2 10 10"/></>,
  cloud: <path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.3 8.5 4.8 4.8 0 0 0 7 18Z"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  arrowRight: <path d="M5 12h14M14 7l5 5-5 5"/>,
  share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>,
  filter: <path d="M4 6h16M7 12h10M10 18h4"/>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
}

export function NovaIcon({ name, size = 20, strokeWidth = 1.8, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props['aria-label'] ? undefined : true}
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
