import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { api } from '../api'

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as { props: { children?: ReactNode } }).props.children)
  return ''
}

function CodeBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const lang = /language-(\S+)/.exec(className ?? '')?.[1]
  return (
    <div className="codeblock">
      <div className="codeblock-tools">
        {lang && <span className="codeblock-lang">{lang}</span>}
        <button
          className="icon-btn"
          title="Copy"
          onClick={() => {
            void navigator.clipboard.writeText(textOf(children))
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href) void api.openExternal(href)
              }}
            >
              {children}
            </a>
          ),
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children
            const props = (child as { props?: { className?: string; children?: ReactNode } })?.props ?? {}
            return <CodeBlock className={props.className}>{props.children}</CodeBlock>
          },
          table: ({ children }) => (
            <div className="table-wrap">
              <table>{children}</table>
            </div>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
