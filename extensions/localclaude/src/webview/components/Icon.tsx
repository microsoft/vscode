// Small line icons for tool steps (stroke = currentColor).
const PATHS: Record<string, string> = {
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5',
  pencil: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  terminal: 'M4 17l6-6-6-6 M12 19h8',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  agent: 'M12 8V4H8 M5 8h14v11H5z M2 13h3 M19 13h3 M9.5 12.5v2 M14.5 12.5v2',
  list: 'M10 6h10 M10 12h10 M10 18h10 M4 6l1 1 2-2 M4 12l1 1 2-2 M4 18l1 1 2-2',
  bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
  monitor: 'M3 4h18v12H3z M8 20h8 M12 16v4',
  plug: 'M9 2v6 M15 2v6 M6 8h12v3a6 6 0 0 1-12 0z M12 17v5',
  question: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  sidebar: 'M4 4h16v16H4z M9.5 4v16',
  compose: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  rewind: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5',
  retry: 'M21 12a9 9 0 1 1-3-6.7L21 8 M21 3v5h-5',
  chevron: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  project: 'M3 7h18v4H3z M5 11v8h14v-8 M10 15h4',
  sliders: 'M4 7h9 M17 7h3 M4 12h3 M11 12h9 M4 17h11 M19 17h1 M15 5v4 M9 10v4 M17 15v4',
  memory: 'M6 3h12v18l-6-4-6 4z',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  upload: 'M12 16V5 M7 10l5-5 5 5 M5 20h14',
  edit: 'M4 20h4l10-10-4-4L4 16z M13 7l4 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  menu: 'M4 7h16 M4 12h16 M4 17h10',
  back: 'M19 12H5 M12 19l-7-7 7-7',
  forward: 'M5 12h14 M12 5l7 7-7 7',
  plus: 'M12 5v14 M5 12h14',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  pin: 'M12 17v5 M8 3h8l-1 7 3 3v1H6v-1l3-3z',
  laptop: 'M4 6h16v10H4z M2 19h20',
  enter: 'M20 5v7a3 3 0 0 1-3 3H5 M9 11l-4 4 4 4',
  arrowDown: 'M12 5v14 M6 13l6 6 6-6',
  arrowUp: 'M12 19V5 M6 11l6-6 6 6',
  stop: 'M7 7h10v10H7z',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  check: 'M5 12l5 5 9-10',
  grid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  chat: 'M21 12a8 8 0 0 1-11.7 7.1L4 20l1-4.4A8 8 0 1 1 21 12z',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2',
  shapes: 'M7 3l4.5 7.5h-9z M17 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M8.5 14h7v7h-7z',
  branch: 'M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M15.5 9.5h.01',
  x: 'M6 6l12 12 M18 6L6 18',
  // design
  penTool: 'M12 19l7-7 3 3-7 7z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z M2 2l7.586 7.586 M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  cursor: 'M5 3l14 7-6 2-2 6z M13 13l5 5',
  slides: 'M3 4h18 M4 4v11h16V4 M12 15v5 M8 20h8',
  layout: 'M4 4h16v16H4z M4 9h16 M9 9v11',
  tablet: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2',
  comment: 'M21 12a8 8 0 0 1-11.7 7.1L4 20l1-4.4A8 8 0 1 1 21 12z M8.5 10.5h7 M8.5 13.5h4',
  expand: 'M14 4h6v6 M20 4l-7 7 M10 20H4v-6 M4 20l7-7',
  play: 'M7 4.5v15l12-7.5z',
  hand: 'M18 11V6a2 2 0 0 0-4 0v5 M14 10V4a2 2 0 0 0-4 0v6 M10 10.5V6a2 2 0 0 0-4 0v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16a2 2 0 0 1 3.2-2.4L8 15'
}

export function Icon({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={'icon ' + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name] ?? PATHS.sparkle} />
    </svg>
  )
}
