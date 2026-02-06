/**
 * SelectionController
 * ✅ Cursor 2.x準拠: 選択制御
 *
 * 原則:
 * - hitTest は registry → DOM fallback
 * - null selection を許容しない（空文字列を使用）
 * - DOM操作を一切行わない
 */

import { ElementId } from '../core/ElementId';
import { ElementRegistry } from '../core/ElementRegistry';
import { SelectionState, createEmptySelectionState, createSelectionState } from './SelectionState';

/**
 * SelectionController: 選択制御
 * ✅ Cursor 2.x準拠: シングルトンで管理
 */
export class SelectionController {
  private static instance: SelectionController | null = null;
  private currentState: SelectionState;
  private onSelectionChangeCallbacks: Set<(state: SelectionState) => void>;
  private elementRegistry: ElementRegistry | null;
  private hasListeners: boolean;

  private constructor() {
    this.currentState = createEmptySelectionState();
    this.onSelectionChangeCallbacks = new Set();
    this.elementRegistry = null;
    this.hasListeners = false;
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): SelectionController {
    if (!SelectionController.instance) {
      SelectionController.instance = new SelectionController();
    }
    return SelectionController.instance;
  }

  /**
   * 初期化
   *
   * @param onSelectionChange 選択状態変更時のコールバック
   */
  init(onSelectionChange?: (state: SelectionState) => void): void {
    // ✅ コールバックを追加（複数コールバック対応）
    if (onSelectionChange) {
      this.onSelectionChangeCallbacks.add(onSelectionChange);
    }

    // ✅ ElementRegistry を取得
    if (typeof window !== 'undefined' && typeof (window as any).getElementRegistry === 'function') {
      this.elementRegistry = (window as any).getElementRegistry();
    }

    // ✅ イベントリスナーを設定（重複登録を防ぐ）
    if (!this.hasListeners) {
      this.setupListeners();
      this.hasListeners = true;
    }
  }

  /**
   * イベントリスナーを設定
   */
  private setupListeners(): void {
    // ✅ pointerdown イベントを使用（click より確実）
    const doc = document;
    const pointerdownHandler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Drag 中は selection 更新しない
      if (target.closest('[data-dragging="true"]')) {
        return;
      }

      this.onClick(e);
    };

    doc.addEventListener('pointerdown', pointerdownHandler as EventListener, true);

    // ✅ SCROLL_SYNC: スクロール時に選択状態のboundsを再計算
    // スクロール責任者（[data-scroll-container="true"]）を監視
    const scrollContainer = document.querySelector('[data-scroll-container="true"]') as HTMLElement;
    if (scrollContainer) {
      let rafId: number | null = null;
      const scrollHandler = () => {
        // ✅ requestAnimationFrameでスロットリング（パフォーマンス最適化）
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        rafId = requestAnimationFrame(() => {
          this.updateBoundsOnScroll();
          rafId = null;
        });
      };

      // ✅ capture + passive でスクロールイベントを監視
      scrollContainer.addEventListener('scroll', scrollHandler, { capture: true, passive: true });

      // ✅ resize イベントも監視（コンテナサイズ変化時）
      window.addEventListener('resize', scrollHandler, { passive: true });
    }
  }

  /**
   * スクロール時に選択状態のboundsを再計算
   * ✅ SCROLL_SYNC: 選択中の要素のboundsを再取得して更新
   */
  private updateBoundsOnScroll(): void {
    // ✅ 選択されていない場合は何もしない
    if (!this.currentState.selectedElementId || this.currentState.selectedElementId === '') {
      return;
    }

    const elementId = this.currentState.selectedElementId;

    // ✅ 要素の境界情報を再取得
    let bounds: DOMRect | null = null;

    // ✅ ElementRegistry から取得
    if (this.elementRegistry) {
      const element = this.elementRegistry.get(elementId);
      if (element) {
        bounds = element.getBoundingClientRect();
      }
    }

    // ✅ DOM fallback
    if (!bounds) {
      const element = document.querySelector<HTMLElement>(`[data-element-id="${elementId}"]`);
      if (element) {
        bounds = element.getBoundingClientRect();
      }
    }

    // ✅ bounds が取得できた場合、選択状態を更新
    if (bounds) {
      this.currentState = createSelectionState(elementId, bounds);

      // ✅ すべてのコールバックを呼び出し（SelectionOverlayに通知）
      this.onSelectionChangeCallbacks.forEach((callback) => {
        try {
          callback(this.currentState);
        } catch (error) {
          // Silent error handling
        }
      });
    }
  }

  /**
   * クリックイベントを処理
   * ✅ 検証: click → elementId が必ず出ること
   * ✅ STEP 5: DnD中は選択を更新しない（下の要素が青く囲まれるのを防ぐ）
   *
   * @param event PointerEvent
   */
  onClick(event: PointerEvent): void {
    // ✅ STEP 5: DnD中は選択を更新しない（SelectionOverlay を DnD 中に更新してはならない）
    if (typeof window !== 'undefined' && typeof (window as any).getDragController === 'function') {
      const dragController = (window as any).getDragController();
      if (dragController && dragController.isDragging && dragController.isDragging()) {
        return; // ✅ DnD中は選択を更新しない
      }
    }

    if (!event.target) {
      return;
    }

    // ✅ hitTest: registry → DOM fallback
    const elementId = this.hitTest(event.target as HTMLElement);

    if (elementId) {
      // ✅ 選択を設定
      this.setSelected(elementId);
    } else {
      // ✅ 選択をクリア（null selection を許容しない）
      this.setSelected('');
    }
  }

  /**
   * hitTest: 要素からIDを取得
   * ✅ registry → DOM fallback
   *
   * @param target ターゲット要素
   * @returns elementId または null
   */
  private hitTest(target: HTMLElement): string | null {
    // ✅ 1. ElementRegistry から取得（優先）
    if (this.elementRegistry) {
      // ✅ target から親方向に elementId を探す
      let current: HTMLElement | null = target;
      while (current) {
        const elementId = this.elementRegistry.getIdFromElement(current);
        if (elementId && this.elementRegistry.has(elementId)) {
          return elementId;
        }
        current = current.parentElement;
      }
    }

    // ✅ 2. DOM fallback: data-element-id を直接読む
    let current: HTMLElement | null = target;
    while (current) {
      const elementId = ElementId.fromElement(current);
      if (elementId) {
        try {
          ElementId.assertValid(elementId);
          return elementId;
        } catch {
          // 無効なIDはスキップ
        }
      }
      current = current.parentElement;
    }

    return null;
  }

  /**
   * 選択を設定
   * ✅ null selection を許容しない（空文字列を使用）
   *
   * @param elementId 要素ID（空文字列でクリア）
   */
  setSelected(elementId: string): void {
    if (!elementId || elementId === '') {
      // ✅ 選択をクリア
      this.currentState = createEmptySelectionState();
    } else {
      // ✅ 要素の境界情報を取得
      let bounds: DOMRect | null = null;

      // ✅ ElementRegistry から取得
      if (this.elementRegistry) {
        const element = this.elementRegistry.get(elementId);
        if (element) {
          bounds = element.getBoundingClientRect();
        }
      }

      // ✅ DOM fallback
      if (!bounds) {
        const element = document.querySelector<HTMLElement>(`[data-element-id="${elementId}"]`);
        if (element) {
          bounds = element.getBoundingClientRect();
      }
    }

      // ✅ bounds は viewport 座標のまま保持
      //    SelectionOverlay 側で previewRoot 相対座標に変換する

      this.currentState = createSelectionState(elementId, bounds);
    }

    // ✅ すべてのコールバックを呼び出し
    this.onSelectionChangeCallbacks.forEach((callback) => {
      try {
        callback(this.currentState);
      } catch (error) {
        // Silent error handling
      }
    });
  }

  /**
   * 選択されたIDを取得
   * ✅ null selection を許容しない（空文字列を返す）
   *
   * @returns elementId（選択されていない場合は空文字列）
   */
  getSelected(): string {
    return this.currentState.selectedElementId || '';
  }

  /**
   * 選択状態を取得
   *
   * @returns SelectionState
   */
  getState(): SelectionState {
    return { ...this.currentState };
  }

  /**
   * 選択が有効か確認
   *
   * @returns boolean
   */
  hasSelection(): boolean {
    return this.currentState.selectedElementId !== '';
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  const selectionController = SelectionController.getInstance();

  (window as any).SelectionController = SelectionController;
  (window as any).getSelectionController = function() {
    return selectionController;
  };
}
