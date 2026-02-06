/**
 * DragOverlay
 * ✅ Cursor 2.x準拠: ドラッグアバター（カーソル追従）
 *
 * 原則:
 * - position: fixed（viewport座標）
 * - pointer-events: none（クリックをブロックしない）
 * - z-index: 2000（SelectionOverlay: 1000 < DragOverlay: 2000 < DropGuideOverlay: 3000）
 * - drag中のみ表示、drag終了で必ず非表示
 */

export class DragOverlay {
  private static instance: DragOverlay | null = null;
  private overlayElement: HTMLElement | null;
  private isVisible: boolean;
  private offsetX: number;
  private offsetY: number;
  private hasMoved: boolean; // ✅ STEP 1: 初回pointerMoveを受け取ったか
  private frameCount: number; // ✅ STEP 1: フレームカウント（transition制御用）

  private constructor() {
    this.overlayElement = null;
    this.isVisible = false;
    this.offsetX = 0;
    this.offsetY = 0;
    this.hasMoved = false;
    this.frameCount = 0;
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): DragOverlay {
    if (!DragOverlay.instance) {
      DragOverlay.instance = new DragOverlay();
    }
    return DragOverlay.instance;
  }

  /**
   * ドラッグアバターを準備（非表示のまま）
   * ✅ STEP 1: dragStartでは overlayを生成するが display:none のまま
   * ✅ STEP 2: pointer-origin で offsetX/Y を保存
   *
   * @param element ドラッグ中の要素
   * @param pointerX ポインターX座標（viewport座標）
   * @param pointerY ポインターY座標（viewport座標）
   */
  prepare(element: HTMLElement, pointerX: number, pointerY: number): void {
    if (!element) {
      return;
    }

    // ✅ 既存のオーバーレイをクリア
    this.hide();

    // ✅ 要素の境界を取得（viewport座標）
    const elementRect = element.getBoundingClientRect();

    // ✅ STEP 2: pointer-origin で offsetX/Y を計算（要素の左上角ではなく、pointer位置から）
    this.offsetX = pointerX - elementRect.left;
    this.offsetY = pointerY - elementRect.top;

    // ✅ 要素をクローン（深いコピー）
    const clonedElement = element.cloneNode(true) as HTMLElement;

    // ✅ オーバーレイ要素を作成
    this.overlayElement = document.createElement('div');
    this.overlayElement.setAttribute('data-ui-editor-overlay', 'drag');
    this.overlayElement.style.position = 'fixed';
    this.overlayElement.style.pointerEvents = 'none';
    this.overlayElement.style.zIndex = '2000'; // ✅ FIX 2: z-index: 2000 (SelectionOverlay: 1000 < DragOverlay: 2000 < DropGuideOverlay: 3000)
    this.overlayElement.style.visibility = 'hidden'; // ✅ STEP 1: startDrag時点ではvisibility: hiddenを維持
    this.overlayElement.style.display = 'block'; // ✅ displayはblock（visibilityで制御）
    this.overlayElement.style.boxSizing = 'border-box';
    this.overlayElement.style.transformOrigin = 'top left';
    this.overlayElement.style.transition = 'none'; // ✅ STEP 1: 初回表示時はtransition無効

    // ✅ STEP 2: クローンした要素をスタイル調整して追加（Cursor風）
    clonedElement.style.width = `${elementRect.width}px`;
    clonedElement.style.height = `${elementRect.height}px`;
    clonedElement.style.margin = '0';
    clonedElement.style.padding = '0';
    clonedElement.style.opacity = '0.85'; // ✅ STEP 2: opacity/scaleをCursor風に調整（例: opacity 0.85）
    clonedElement.style.transform = 'scale(0.98)';
    clonedElement.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.1)';
    clonedElement.style.borderRadius = '4px';
    clonedElement.style.overflow = 'hidden';

    this.overlayElement.appendChild(clonedElement);

    // ✅ Body に追加（非表示のまま）
    document.body.appendChild(this.overlayElement);

    // ✅ 初期位置を設定（非表示のまま）
    this.update(pointerX, pointerY);
    this.isVisible = false; // ✅ STEP 1: まだ表示しない
    this.hasMoved = false;
    this.frameCount = 0;
  }

  /**
   * ドラッグアバターを表示
   * ✅ STEP 1: 初回pointerMoveでのみ呼び出される
   *
   * @param element ドラッグ中の要素（後方互換性のため保持）
   * @param pointerX ポインターX座標（viewport座標）
   * @param pointerY ポインターY座標（viewport座標）
   * @deprecated prepare() + update() を使用
   */
  show(element: HTMLElement, pointerX: number, pointerY: number): void {
    // ✅ 後方互換性: prepare() を呼び出し
    this.prepare(element, pointerX, pointerY);
    // ✅ 初回表示
    this.reveal();
  }

  /**
   * ドラッグアバターを初回表示
   * ✅ STEP 1: 初回pointerMoveで呼び出される
   * ✅ STEP 1: 「描画はmoveイベントから」というルールを徹底
   */
  reveal(): void {
    if (!this.overlayElement) {
      return;
    }

    // ✅ STEP 1: 初回表示時は transition を無効化（0ms）
    this.overlayElement.style.transition = 'none';
    this.overlayElement.style.visibility = 'visible'; // ✅ STEP 1: visibilityをvisibleに変更
    this.isVisible = true;
    this.hasMoved = true;
    this.frameCount = 0;

    // ✅ STEP 1: 2フレーム目から transition を有効化
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.overlayElement) {
          this.overlayElement.style.transition = 'opacity 0.15s ease-out, transform 0.15s ease-out';
        }
      });
    });
  }

  /**
   * ドラッグアバターの位置を更新
   * ✅ STEP 2: pointer-origin で位置を計算
   * ✅ STEP 1: 初回pointerMoveで reveal() を呼び出す
   *
   * @param pointerX ポインターX座標（viewport座標）
   * @param pointerY ポインターY座標（viewport座標）
   */
  update(pointerX: number, pointerY: number): void {
    if (!this.overlayElement) {
      return;
    }

    // ✅ STEP 1: 初回pointerMoveで reveal() を呼び出す
    if (!this.hasMoved) {
      this.reveal();
    }

    // ✅ STEP 2: pointer-origin で位置を計算
    const left = pointerX - this.offsetX;
    const top = pointerY - this.offsetY;

    // ✅ STEP 1: transform: translate3d(x, y, 0) を使用（Cursor 2.x準拠）
    this.overlayElement.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    this.overlayElement.style.left = '0';
    this.overlayElement.style.top = '0';

    this.frameCount++;
  }

  /**
   * ドラッグアバターを非表示
   * ✅ 必ず呼び出す（finally相当）
   */
  hide(): void {
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
    this.overlayElement = null;
    this.isVisible = false;
    this.offsetX = 0;
    this.offsetY = 0;
    this.hasMoved = false;
    this.frameCount = 0;
  }

  /**
   * 表示中か確認
   */
  isShowing(): boolean {
    return this.isVisible;
  }

  /**
   * オフセットXを取得
   * ✅ STEP 5: debugMode用
   */
  getOffsetX(): number {
    return this.offsetX;
  }

  /**
   * オフセットYを取得
   * ✅ STEP 5: debugMode用
   */
  getOffsetY(): number {
    return this.offsetY;
  }

  /**
   * プレビュー矩形を取得
   * ✅ STEP 5: debugMode用
   */
  getPreviewRect(): DOMRect | null {
    if (!this.overlayElement) {
      return null;
    }
    return this.overlayElement.getBoundingClientRect();
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開（デバッグ用のみ）
 */
if (typeof window !== 'undefined') {
  const dragOverlay = DragOverlay.getInstance();

  (window as any).DragOverlay = DragOverlay;
  (window as any).getDragOverlay = function() {
    return dragOverlay;
  };
}
