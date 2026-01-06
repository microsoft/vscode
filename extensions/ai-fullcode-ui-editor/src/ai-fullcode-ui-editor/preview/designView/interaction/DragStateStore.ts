/**
 * DragStateStore.ts
 *
 * Drag & Drop の状態管理専用ストア（Cursor 2.2 準拠）
 *
 * 責務:
 * - Drag 状態の保持のみ
 * - 描画ロジックは一切含まない
 * - previewService.ts の AST ロジックとは完全独立
 */

export type DragState = {
  isDragging: boolean;
  draggedElementId: string | null;
  ghostRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  slotPreviewRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  slotPosition: 'before' | 'after' | 'inside' | null;
};

export class DragStateStore {
  private state: DragState = {
    isDragging: false,
    draggedElementId: null,
    ghostRect: null,
    slotPreviewRect: null,
    slotPosition: null,
  };

  private listeners = new Set<(s: DragState) => void>();

  /**
   * 状態変更を購読
   */
  subscribe(fn: (state: DragState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * 現在の状態を取得
   */
  getState(): DragState {
    return { ...this.state };
  }

  /**
   * 状態を更新（部分更新可）
   */
  set(partial: Partial<DragState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(l => l(this.state));
  }

  /**
   * 状態をリセット
   */
  reset(): void {
    this.set({
      isDragging: false,
      draggedElementId: null,
      ghostRect: null,
      slotPreviewRect: null,
      slotPosition: null,
    });
  }
}

// グローバルシングルトンインスタンス
export const dragStateStore = new DragStateStore();

