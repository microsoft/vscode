/**
 * DragOverlayRenderer.tsx
 *
 * Drag & Drop の描画専用コンポーネント（Cursor 2.2 準拠）
 *
 * 責務:
 * - DragStateStore の状態を購読して描画するだけ
 * - DOM を一切変更しない
 * - previewService.ts とは完全独立
 */

import React from 'react';
import { dragStateStore, DragState } from './DragStateStore';

export function DragOverlayRenderer() {
  const [state, setState] = React.useState<DragState>(dragStateStore.getState());

  React.useEffect(() => {
    const unsubscribe = dragStateStore.subscribe(setState);
    return unsubscribe;
  }, []);

  if (!state.isDragging) {
    return null;
  }

  return React.createElement(React.Fragment, null, [
    // Ghost（半透明の青い枠）
    state.ghostRect && React.createElement('div', {
      key: 'ghost',
      className: 'drag-ghost',
      style: {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 10001,
        left: state.ghostRect.left + 'px',
        top: state.ghostRect.top + 'px',
        width: state.ghostRect.width + 'px',
        height: state.ghostRect.height + 'px',
        opacity: 0.6,
        background: 'rgba(59, 130, 246, 0.2)',
        border: '2px dashed rgba(59, 130, 246, 0.8)',
        boxSizing: 'border-box',
        transition: 'none',
      },
    }),

    // Slot Preview（青い線）
    state.slotPreviewRect && React.createElement('div', {
      key: 'slot-preview',
      className: 'slot-preview',
      style: {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 10000,
        left: state.slotPreviewRect.left + 'px',
        top: state.slotPreviewRect.top + 'px',
        width: state.slotPreviewRect.width + 'px',
        height: state.slotPreviewRect.height + 'px',
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        boxSizing: 'border-box',
      },
    }),
  ]);
}

