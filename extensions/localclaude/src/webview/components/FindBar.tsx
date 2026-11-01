import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icon } from './Icon'

/** Text nodes inside the chat that can match (not the find box itself, not inputs). */
function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const el = n.parentElement
      if (!el || !n.nodeValue?.trim() || el.closest('.find-bar, textarea, input, script, style')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text)
  return out
}

/** Every case-insensitive occurrence of `query` as a DOM Range. */
export function findRanges(root: HTMLElement, query: string): Range[] {
  const q = query.toLowerCase()
  if (!q) return []
  const ranges: Range[] = []
  for (const node of textNodes(root)) {
    const text = node.nodeValue!.toLowerCase()
    for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) {
      const r = document.createRange()
      r.setStart(node, i)
      r.setEnd(node, i + q.length)
      ranges.push(r)
    }
  }
  return ranges
}

const supported = typeof CSS !== 'undefined' && 'highlights' in CSS

/**
 * Ctrl+F for the open chat: highlights matches with the CSS Highlight API (the page isn't modified),
 * Enter / Shift+Enter to move between them, Esc to close.
 */
export function FindBar(props: { container: RefObject<HTMLElement | null>; initial: string; refreshKey: unknown; focusKey: unknown; onClose: () => void }) {
  const [query, setQuery] = useState(props.initial)
  const [ranges, setRanges] = useState<Range[]>([])
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [props.focusKey])

  useEffect(() => setQuery(props.initial), [props.initial])

  // find again when the query or the chat changes
  useEffect(() => {
    const root = props.container.current
    const found = root ? findRanges(root, query.trim()) : []
    setRanges(found)
    setIndex((i) => (found.length ? Math.min(i, found.length - 1) : 0))
  }, [query, props.refreshKey, props.container])

  useEffect(() => {
    if (!supported) return
    if (ranges.length) CSS.highlights.set('lc-find', new Highlight(...ranges))
    else CSS.highlights.delete('lc-find')
    const cur = ranges[index]
    if (cur) {
      CSS.highlights.set('lc-find-current', new Highlight(cur))
      cur.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } else CSS.highlights.delete('lc-find-current')
  }, [ranges, index])

  useEffect(
    () => () => {
      if (!supported) return
      CSS.highlights.delete('lc-find')
      CSS.highlights.delete('lc-find-current')
    },
    []
  )

  const step = (d: 1 | -1): void => {
    if (ranges.length) setIndex((i) => (i + d + ranges.length) % ranges.length)
  }

  return (
    <div className="find-bar" role="search">
      <Icon name="search" size={14} />
      <input
        ref={input}
        className="find-input"
        placeholder="Find in chat"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIndex(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            props.onClose()
          }
        }}
      />
      <span className="find-count muted small">{query.trim() ? (ranges.length ? `${index + 1}/${ranges.length}` : 'No results') : ''}</span>
      <button className="icon-btn" title="Previous (Shift+Enter)" disabled={!ranges.length} onClick={() => step(-1)}>
        <Icon name="arrowUp" size={14} />
      </button>
      <button className="icon-btn" title="Next (Enter)" disabled={!ranges.length} onClick={() => step(1)}>
        <Icon name="arrowDown" size={14} />
      </button>
      <button className="icon-btn" title="Close (Esc)" onClick={props.onClose}>
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
