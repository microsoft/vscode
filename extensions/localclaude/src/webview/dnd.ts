// Dragging chats (one, or everything selected) onto a project.
import type { DragEvent } from 'react'

export const CHAT_DRAG = 'application/x-localclaude-chats'

export function startChatDrag(e: DragEvent, ids: string[]): void {
  e.dataTransfer.setData(CHAT_DRAG, JSON.stringify(ids))
  e.dataTransfer.effectAllowed = 'move'
}

/** While dragging over a target only the kind of data is known, not the chats. */
export const isChatDrag = (e: DragEvent): boolean => e.dataTransfer.types.includes(CHAT_DRAG)

/** The chats dropped, or null when the drop isn't chats. */
export function droppedChats(e: DragEvent): string[] | null {
  if (!isChatDrag(e)) return null
  try {
    const ids = JSON.parse(e.dataTransfer.getData(CHAT_DRAG)) as unknown
    return Array.isArray(ids) && ids.every((x) => typeof x === 'string') ? ids : null
  } catch {
    return null
  }
}
