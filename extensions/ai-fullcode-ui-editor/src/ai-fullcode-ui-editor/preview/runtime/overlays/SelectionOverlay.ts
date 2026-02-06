/**
 * SelectionOverlay
 * ✅ Cursor 2.x完全準拠: 選択の可視化
 *
 * 原則:
 * - ビューのみ（ロジックなし）
 * - hitTest なし
 * - DOM クエリはレンダリングのみ
 * - ドラッグロジックなし
 * - state を pull する実装は禁止（push のみ）
 */

import { SelectionState } from '../selection/SelectionState';

/**
 * SelectionOverlay: 選択の可視化
 * ✅ Cursor 2.x準拠: シングルトンで管理
 */
export class SelectionOverlay {
  private static instance: SelectionOverlay | null = null;
  private overlayElement: HTMLElement | null;
  private previewRoot: HTMLElement | null;
  private isMounted: boolean;

  private constructor() {
    this.overlayElement = null;
    this.previewRoot = null;
    this.isMounted = false;
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): SelectionOverlay {
    if (!SelectionOverlay.instance) {
      SelectionOverlay.instance = new SelectionOverlay();
    }
    return SelectionOverlay.instance;
  }

  /**
   * オーバーレイをマウント
   * ✅ 必須: document.body に DOM をアタッチし、position: fixed で表示
   * ✅ 必須: initPreviewRuntime のみで呼び出す
   *
   * @param previewRoot プレビュールート要素（現在は参照のみ）
   */
  mount(previewRoot: HTMLElement): void {
    if (!previewRoot) {
      throw new Error('[SelectionOverlay] ❌ CRITICAL: mount() called with null previewRoot');
    }

    if (this.isMounted) {
      this.unmount();
    }

    this.previewRoot = previewRoot;

    // ✅ オーバーレイ要素を作成
    this.overlayElement = document.createElement('div');
    this.overlayElement.setAttribute('data-ui-editor-overlay', 'selection');
    // Use viewport coordinate space (getBoundingClientRect) to avoid root-relative offset bugs
    this.overlayElement.style.position = 'fixed';
    this.overlayElement.style.pointerEvents = 'none';
    this.overlayElement.style.border = '2px solid #4DA3FF';
    this.overlayElement.style.backgroundColor = 'rgba(77, 163, 255, 0.08)';
    this.overlayElement.style.zIndex = '1000'; // ✅ STEP 6: Z-Index階層を固定（DropGuideOverlay: 3000 > DragOverlay: 2000 > SelectionOverlay: 1000）
    this.overlayElement.style.display = 'none';
    this.overlayElement.style.boxSizing = 'border-box';
    this.overlayElement.style.transition = 'opacity 0.1s ease-in-out';
    this.overlayElement.style.opacity = '0';

    // ✅ Body に追加（fixed overlay は viewport 基準）
    document.body.appendChild(this.overlayElement);
    this.isMounted = true;
  }

  /**
   * 選択状態を更新
   * ✅ Cursor 2.x完全準拠: PURE VIEW - 判断を一切行わない
   * ✅ Controllerから「出せ」「消せ」だけを受け取る
   *
   * @param selectionState 選択状態（null の場合は非表示）
   */
  update(selectionState: SelectionState | null): void {
    // ✅ Cursor 2.x完全準拠: null の場合は hide() を呼び出す
    if (!selectionState) {
      this.hide();
      return;
    }

    // ✅ Cursor 2.x完全準拠: selectedElementId が空文字列の場合は hide()
    if (!selectionState.selectedElementId || selectionState.selectedElementId === '') {
      this.hide();
      return;
    }

    // ✅ Cursor 2.x完全準拠: bounds がない場合は hide()
    if (!selectionState.bounds) {
      this.hide();
      return;
    }

    // ✅ show() を呼び出して表示
    this.show(selectionState);
  }

  /**
   * 選択オーバーレイを表示
   * ✅ Cursor 2.x完全準拠: Controllerからの明示的な「出せ」コマンド
   * ✅ 判断を一切行わない（PURE VIEW）
   *
   * @param selectionState 選択状態
   */
  show(selectionState: SelectionState): void {
    // ✅ 必須: マウント状態チェック
    if (!this.overlayElement || !this.isMounted || !this.previewRoot) {
      return;
    }

    const bounds = selectionState.bounds!;

    // ✅ Cursor 2.x準拠: bounds の数値が壊れている場合は非表示
    const isFiniteRect =
      Number.isFinite(bounds.left) &&
      Number.isFinite(bounds.top) &&
      Number.isFinite(bounds.width) &&
      Number.isFinite(bounds.height);

    if (!isFiniteRect) {
      this.hide();
      return;
    }

    // ✅ Cursor 2.x完全準拠: width > 0 かつ height > 0 でない場合は非表示
    if (bounds.width <= 0 || bounds.height <= 0) {
      this.hide();
      return;
    }

    // ✅ 座標系の一致:
    // SelectionState.bounds は getBoundingClientRect() の結果（viewport 座標）を前提とする。
    // overlay は position: fixed で viewport 座標に直接描画する。
    const left = bounds.left;
    const top = bounds.top;

    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      this.hide();
      return;
    }

    // ✅ 選択矩形を描画（判断なし、Controllerからの命令のみ）
    this.overlayElement.style.opacity = '1';
    this.overlayElement.style.display = 'block';
    this.overlayElement.style.left = `${left}px`;
    this.overlayElement.style.top = `${top}px`;
    this.overlayElement.style.width = `${bounds.width}px`;
    this.overlayElement.style.height = `${bounds.height}px`;
  }

  /**
   * オーバーレイを非表示
   * ✅ Cursor 2.x完全準拠: Controllerからの明示的な「消せ」コマンド
   * ✅ 判断を一切行わない（PURE VIEW）
   */
  hide(): void {
    if (this.overlayElement) {
      this.overlayElement.style.opacity = '0';
      this.overlayElement.style.display = 'none';
    }
  }

  /**
   * オーバーレイをアンマウント
   */
  unmount(): void {
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
    this.overlayElement = null;
    this.previewRoot = null;
    this.isMounted = false;
  }

  /**
   * マウント済みか確認
   */
  getMounted(): boolean {
    return this.isMounted;
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開（デバッグ用のみ）
 */
if (typeof window !== 'undefined') {
  const selectionOverlay = SelectionOverlay.getInstance();

  (window as any).SelectionOverlay = SelectionOverlay;
  (window as any).getSelectionOverlay = function() {
    return selectionOverlay;
  };
}
