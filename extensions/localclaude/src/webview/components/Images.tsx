// Images in the conversation: thumbnails of what you attached and what tools returned
// (screenshots), opening a full-size viewer with copy and save.
import { createContext, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ImageRef } from '../../shared/types'
import { api } from '../api'
import { Icon } from './Icon'
import { imageUrl as serverImageUrl } from '../vscode/urls'

/** Address of a chat image (served by the extension); `width` asks for a smaller copy. */
export function imageUrl(sessionId: string, img: ImageRef, width?: number): string {
  return serverImageUrl(sessionId, img.id, width)
}

/** Which chat the images belong to and how to open the viewer (provided by the chat view). */
export const ImagesContext = createContext<{ sessionId: string; open: (images: ImageRef[], index: number) => void } | null>(null)

const THUMB_HEIGHT = { normal: 200, small: 140 }

function Thumb({ sessionId, img, height, onOpen }: { sessionId: string; img: ImageRef; height: number; onOpen: () => void }) {
  const [failed, setFailed] = useState(false)
  // reserve the space before the image loads (no jump when it appears)
  const h = Math.min(height, img.height ?? height)
  const ratio = img.width && img.height ? img.width / img.height : undefined
  if (failed)
    return (
      <div className="thumb missing" style={{ height: h, width: ratio ? Math.min(h * ratio, 320) : h }} title="This image isn’t available">
        <Icon name="image" size={20} />
      </div>
    )
  return (
    <button className="thumb" onClick={onOpen} title="Open image">
      <img
        src={imageUrl(sessionId, img, 480)}
        alt=""
        draggable={false}
        loading="lazy"
        style={{ height: h, aspectRatio: ratio ? String(ratio) : undefined }}
        onError={() => setFailed(true)}
      />
    </button>
  )
}

/** A row of thumbnails; click one to view it full size. */
export function ImageStrip({ images, size = 'normal', className = '' }: { images: ImageRef[]; size?: 'normal' | 'small'; className?: string }) {
  const ctx = useContext(ImagesContext)
  if (!ctx || !images.length) return null
  return (
    <div className={'image-strip ' + size + ' ' + className}>
      {images.map((img, i) => (
        <Thumb key={img.id} sessionId={ctx.sessionId} img={img} height={THUMB_HEIGHT[size]} onOpen={() => ctx.open(images, i)} />
      ))}
    </div>
  )
}

/** Full-size viewer: ← → between images, Esc or a click outside to close. */
export function Lightbox(props: { sessionId: string; images: ImageRef[]; index: number; onClose: () => void }) {
  const { images, onClose } = props
  const [i, setI] = useState(props.index)
  const [note, setNote] = useState('')
  const img = images[Math.min(i, images.length - 1)]

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setI((x) => Math.min(images.length - 1, x + 1))
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      else return
      // the viewer has the keyboard while it's open
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [images.length, onClose])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 1800)
    return () => clearTimeout(t)
  }, [note])

  if (!img) return null
  const copy = async (): Promise<void> => setNote((await api.copyImage(props.sessionId, img.id)) ? 'Copied' : 'Can’t copy this image')
  const save = async (): Promise<void> => {
    const r = await api.saveImage(props.sessionId, img.id)
    if (r.ok) setNote('Saved')
  }
  const stop = (e: { stopPropagation: () => void }): void => e.stopPropagation()

  return createPortal(
    <div className="lightbox" role="dialog" aria-label="Image viewer" onClick={onClose}>
      <img className="lightbox-img" src={imageUrl(props.sessionId, img)} alt="" draggable={false} onClick={stop} />
      {i > 0 && (
        <button className="lightbox-nav prev" title="Previous (←)" onClick={(e) => (stop(e), setI(i - 1))}>
          <Icon name="back" size={20} />
        </button>
      )}
      {i < images.length - 1 && (
        <button className="lightbox-nav next" title="Next (→)" onClick={(e) => (stop(e), setI(i + 1))}>
          <Icon name="forward" size={20} />
        </button>
      )}
      <div className="lightbox-bar" onClick={stop}>
        {images.length > 1 && (
          <span className="muted small">
            {i + 1} / {images.length}
          </span>
        )}
        {img.width && img.height ? (
          <span className="muted small">
            {img.width} × {img.height}
          </span>
        ) : null}
        {note && <span className="small lightbox-note">{note}</span>}
        <button className="icon-btn" title="Copy image" onClick={() => void copy()}>
          <Icon name="copy" size={16} />
        </button>
        <button className="icon-btn" title="Save image…" onClick={() => void save()}>
          <Icon name="download" size={16} />
        </button>
        <button className="icon-btn" title="Close (Esc)" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>,
    document.body
  )
}
