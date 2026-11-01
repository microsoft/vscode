// Claude's starburst mark, used as the logo and (animated) as the working indicator.
const RAYS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2
  const r = i % 2 ? 7.2 : 9.6
  return { x: 12 + Math.cos(a) * r, y: 12 + Math.sin(a) * r }
})

export function Spark({ size = 20, animate = false, className = '' }: { size?: number; animate?: boolean; className?: string }) {
  return (
    <svg
      className={'spark-svg' + (animate ? ' animate' : '') + (className ? ' ' + className : '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
    >
      {RAYS.map((p, i) => (
        <line key={i} x1="12" y1="12" x2={p.x} y2={p.y} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      ))}
    </svg>
  )
}
