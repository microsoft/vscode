/**
 * DropGuideOverlay
 * ✅ Cursor 2.x完全準拠: ガイドラインの可視化
 *
 * 原則:
 * - ビューのみ（ロジックなし）
 * - スロット計算なし
 * - ツリーアクセスなし
 * - slot を pull する実装は禁止（push のみ）
 */

import { Slot } from '../dnd/DragSession';

/**
 * DropGuideOverlay: ドロップガイドの可視化
 * ✅ Cursor 2.x準拠: シングルトンで管理
 */
export class DropGuideOverlay {
  private static instance: DropGuideOverlay | null = null;
  private guideElement: HTMLElement | null;
  private previewRoot: HTMLElement | null;
  private isMounted: boolean;
  private guideRoot: HTMLElement | null; // ✅ PHASE12.9: Guide専用root（常に最前面）

  private constructor() {
    this.guideElement = null;
    this.previewRoot = null;
    this.isMounted = false;
    this.guideRoot = null;
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): DropGuideOverlay {
    if (!DropGuideOverlay.instance) {
      DropGuideOverlay.instance = new DropGuideOverlay();
    }
    return DropGuideOverlay.instance;
  }

  /**
   * オーバーレイをマウント
   * ✅ 必須: PreviewRoot に DOM をアタッチ
   * ✅ 必須: initPreviewRuntime のみで呼び出す
   *
   * @param previewRoot プレビュールート要素
   */
  mount(previewRoot: HTMLElement): void {
    if (!previewRoot) {
      throw new Error('[DropGuideOverlay] ❌ CRITICAL: mount() called with null previewRoot');
    }

    if (this.isMounted) {
      this.unmount();
    }

    this.previewRoot = previewRoot;

    // ✅ Ensure previewRoot can host absolute-positioned overlays
    const computed = window.getComputedStyle(previewRoot);
    if (computed.position === 'static') {
      previewRoot.style.position = 'relative';
    }
    if (computed.overflow === 'hidden' || computed.overflow === 'auto') {
      // overflow warning suppressed
    }

    // ✅ GUIDE_GLITCH_FIX: document.bodyのtransform影響を検証
    const bodyComputed = window.getComputedStyle(document.body);
    const bodyTransform = bodyComputed.transform;
    const bodyPerspective = bodyComputed.perspective;
    const bodyFilter = bodyComputed.filter;
    const bodyWillChange = bodyComputed.willChange;

    // ✅ position: fixedの基準がwindowでない可能性を検出
    const hasTransformLike = bodyTransform !== 'none' ||
                             bodyPerspective !== 'none' ||
                             bodyFilter !== 'none' ||
                             (bodyWillChange && bodyWillChange.includes('transform'));

    if (hasTransformLike) {
      console.warn('[DropGuideOverlay] ⚠️ GUIDE_GLITCH_FIX: document.body has transform-like styles', {
        transform: bodyTransform,
        perspective: bodyPerspective,
        filter: bodyFilter,
        willChange: bodyWillChange,
        note: 'position: fixed may not be relative to window viewport'
      });
    }

    // ✅ PHASE12.9: Guide専用rootを作成（Cursor方式 - 常に最前面）
    // DragOverlayが何回mount/unmountされても、Guideは常に最後に配置される
    this.guideRoot = document.getElementById('drop-guide-root') as HTMLElement;
    if (!this.guideRoot) {
      this.guideRoot = document.createElement('div');
      this.guideRoot.id = 'drop-guide-root';
      this.guideRoot.style.position = 'fixed';
      this.guideRoot.style.top = '0';
      this.guideRoot.style.left = '0';
      this.guideRoot.style.width = '0';
      this.guideRoot.style.height = '0';
      this.guideRoot.style.pointerEvents = 'none';
      this.guideRoot.style.zIndex = '2147483647'; // ✅ 最大値で確実に最前面
    }

    // ✅ PHASE12.9: guideRootが既にbodyにある場合は、最後に再配置（DOM順序で常に最前面）
    if (this.guideRoot.parentNode) {
      this.guideRoot.parentNode.removeChild(this.guideRoot);
    }
    // ✅ body直下の最後に追加（DOM順序で常に最前面）
    document.body.appendChild(this.guideRoot);

    // ✅ ガイド要素を作成
    this.guideElement = document.createElement('div');
    this.guideElement.setAttribute('data-ui-editor-overlay', 'guide');
    // ✅ FIX 3: position: fixed に変更（viewport座標に統一）
    this.guideElement.style.position = 'fixed';
    this.guideElement.style.left = '0px';
    this.guideElement.style.top = '0px';
    this.guideElement.style.pointerEvents = 'none';
    this.guideElement.style.backgroundColor = '#4DA3FF';
    this.guideElement.style.zIndex = '2147483647'; // ✅ PHASE12.9: 最大値で確実に最前面
    this.guideElement.style.display = 'none';
    this.guideElement.style.boxSizing = 'border-box';
    this.guideElement.style.transition = 'opacity 0.1s ease-in-out';

    // ✅ PHASE12.9: Guide専用rootに追加（常に最前面）
    this.guideRoot.appendChild(this.guideElement);
    this.isMounted = true;
  }

  /**
   * スロットを更新
   * ✅ ビューのみ（ロジックなし）
   * ✅ Cursor 2.x完全準拠: 表示条件を完全一致させる
   *
   * ドロップガイドを更新
   * ✅ Cursor 2.x完全準拠: PURE VIEW - 判断を一切行わない
   * ✅ Controllerから「出せ」「消せ」だけを受け取る
   *
   * @param slot ドロップスロット（null の場合は非表示）
   */
  update(slot: Slot | null): void {
    // ✅ Cursor 2.x完全準拠: null の場合は hide() を呼び出す
    if (!slot) {
      this.hide();
      return;
    }

    // ✅ BUG-001 FIX: renderGuideRectがない場合でも、show()を呼び出してエラーハンドリングを統一
    // ✅ show()内で適切にエラーハンドリングされる
    this.show(slot);
  }

  /**
   * ドロップガイドを表示
   * ✅ Cursor 2.x完全準拠: Controllerからの明示的な「出せ」コマンド
   * ✅ 判断を一切行わない（PURE VIEW）
   *
   * @param slot ドロップスロット
   */
  show(slot: Slot): void {
    // ✅ FIX 3: position: fixed なので previewRoot の接続チェックは不要（document.body に追加されているため）
    // ✅ ただし、guideElement の存在チェックは必要

    const guideStyle = slot.guideStyle || (slot.kind === 'before' || slot.kind === 'after' || slot.kind === 'between' ? 'line' : slot.kind === 'empty' ? 'dashed' : 'outline');

    // ✅ 必須: マウント状態チェック
    if (!this.guideElement || !this.isMounted || !this.previewRoot) {
      return;
    }

    // ✅ Cursor 2.x完全準拠: renderGuideRect がない場合は非表示（fallback: 静かに非表示）
    if (!slot.renderGuideRect) {
      this.hide();
      return;
    }

    const rect = slot.renderGuideRect;

    const hasFiniteSize = Number.isFinite(rect.width) && Number.isFinite(rect.height);

    // ✅ BUG-001 FIX: isValidSize チェックを緩和（より寛容なチェック）
    // ✅ 最小サイズチェック（0より大きい値）、NaN/Infinityチェック
    const isValidSize = hasFiniteSize && (
      // 最小サイズチェック（0より大きい値）
      (rect.width > 0 || rect.height > 0) &&
      // NaN/Infinityチェック
      Number.isFinite(rect.width) && Number.isFinite(rect.height) &&
      Number.isFinite(rect.left) && Number.isFinite(rect.top)
    );

    if (!isValidSize) {
      this.hide();
      return;
    }

    // ✅ FIX 3: position: fixed なので viewport座標をそのまま使う（previewRoot相対座標に変換しない）
    const left = rect.left;
    const top = rect.top;

    // ✅ viewport座標が有効かチェック
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      this.hide();
      return;
    }

    switch (slot.kind) {
      case 'before':
      case 'after':
        // ✅ STEP 3: before/after + line: 細いライン（axis依存）
        if (slot.axis === 'row') {
          // ✅ 縦線（width=2px）
          this.guideElement.style.display = 'block';
          this.guideElement.style.left = `${left}px`;
          this.guideElement.style.top = `${top}px`;
          this.guideElement.style.width = '2px';
          this.guideElement.style.height = `${rect.height}px`;
          this.guideElement.style.border = 'none';
          this.guideElement.style.backgroundColor = '#4DA3FF';
          this.guideElement.style.boxShadow = '0 0 4px rgba(77, 163, 255, 0.5)';
        } else {
          // ✅ 横線（height=2px）
          this.guideElement.style.display = 'block';
          this.guideElement.style.left = `${left}px`;
          this.guideElement.style.top = `${top}px`;
          this.guideElement.style.width = `${rect.width}px`;
          this.guideElement.style.height = '2px';
          this.guideElement.style.border = 'none';
          this.guideElement.style.backgroundColor = '#4DA3FF';
          this.guideElement.style.boxShadow = '0 0 4px rgba(77, 163, 255, 0.5)';
        }
        break;

      case 'inside':
        // ✅ STEP 3: inside + outline: container全体を囲う枠
        this.guideElement.style.display = 'block';
        this.guideElement.style.left = `${left}px`;
        this.guideElement.style.top = `${top}px`;
        this.guideElement.style.width = `${rect.width}px`;
        this.guideElement.style.height = `${rect.height}px`;
        this.guideElement.style.border = '2px solid #4DA3FF';
        this.guideElement.style.backgroundColor = 'rgba(77, 163, 255, 0.08)';
        this.guideElement.style.boxShadow = 'none';
        break;

      case 'empty':
        // ✅ STEP 3: empty + dashed: 中央にdashed box
        this.guideElement.style.display = 'block';
        this.guideElement.style.left = `${left}px`;
        this.guideElement.style.top = `${top}px`;
        this.guideElement.style.width = `${rect.width}px`;
        this.guideElement.style.height = `${rect.height}px`;
        this.guideElement.style.border = '2px dashed #4DA3FF';
        this.guideElement.style.backgroundColor = 'rgba(77, 163, 255, 0.05)';
        this.guideElement.style.boxShadow = 'none';
        break;

      case 'between':
        // ✅ 後方互換性: between + line: 2pxライン（axis依存）
        if (slot.axis === 'row') {
          // ✅ 縦線（width=2px）
          this.guideElement.style.display = 'block';
          this.guideElement.style.left = `${left}px`;
          this.guideElement.style.top = `${top}px`;
          this.guideElement.style.width = '2px';
          this.guideElement.style.height = `${rect.height}px`;
          this.guideElement.style.border = 'none';
          this.guideElement.style.backgroundColor = '#4DA3FF';
          this.guideElement.style.boxShadow = '0 0 4px rgba(77, 163, 255, 0.5)';
        } else {
          // ✅ 横線（height=2px）
          this.guideElement.style.display = 'block';
          this.guideElement.style.left = `${left}px`;
          this.guideElement.style.top = `${top}px`;
          this.guideElement.style.width = `${rect.width}px`;
          this.guideElement.style.height = '2px';
          this.guideElement.style.border = 'none';
          this.guideElement.style.backgroundColor = '#4DA3FF';
          this.guideElement.style.boxShadow = '0 0 4px rgba(77, 163, 255, 0.5)';
        }
        break;

      case 'outside':
        // ✅ STEP 5: outside: 親containerのslotを再解決して描画
        // 親コンテナのガイドが既に計算されているので、それを表示
        if (slot.axis === 'row') {
          this.guideElement.style.display = 'block';
          this.guideElement.style.left = `${left}px`;
          this.guideElement.style.top = `${top}px`;
          this.guideElement.style.width = '2px';
          this.guideElement.style.height = `${rect.height}px`;
          this.guideElement.style.border = 'none';
          this.guideElement.style.backgroundColor = '#4DA3FF';
          this.guideElement.style.boxShadow = '0 0 4px rgba(77, 163, 255, 0.5)';
        } else if (slot.axis === 'column') {
          this.guideElement.style.display = 'block';
          this.guideElement.style.left = `${left}px`;
          this.guideElement.style.top = `${top}px`;
          this.guideElement.style.width = `${rect.width}px`;
          this.guideElement.style.height = '2px';
          this.guideElement.style.border = 'none';
          this.guideElement.style.backgroundColor = '#4DA3FF';
          this.guideElement.style.boxShadow = '0 0 4px rgba(77, 163, 255, 0.5)';
        } else {
          // ✅ フォールバック: 矩形を表示
          this.guideElement.style.display = 'block';
          this.guideElement.style.left = `${left}px`;
          this.guideElement.style.top = `${top}px`;
          this.guideElement.style.width = `${rect.width}px`;
          this.guideElement.style.height = `${rect.height}px`;
          this.guideElement.style.border = '2px solid #4DA3FF';
          this.guideElement.style.backgroundColor = 'rgba(77, 163, 255, 0.08)';
          this.guideElement.style.boxShadow = 'none';
        }
        break;

      case 'flex-row':
        // ✅ 後方互換性: 横方向のガイド線（縦線）
        this.guideElement.style.display = 'block';
        this.guideElement.style.left = `${left}px`;
        this.guideElement.style.top = `${top}px`;
        this.guideElement.style.width = '2px';
        this.guideElement.style.height = `${rect.height}px`;
        this.guideElement.style.border = 'none';
        this.guideElement.style.backgroundColor = '#4DA3FF';
        this.guideElement.style.boxShadow = 'none';
        break;

      case 'flex-column':
        // ✅ 後方互換性: 縦方向のガイド線（横線）
        this.guideElement.style.display = 'block';
        this.guideElement.style.left = `${left}px`;
        this.guideElement.style.top = `${top}px`;
        this.guideElement.style.width = `${rect.width}px`;
        this.guideElement.style.height = '2px';
        this.guideElement.style.border = 'none';
        this.guideElement.style.backgroundColor = '#4DA3FF';
        this.guideElement.style.boxShadow = 'none';
        break;

      case 'grid':
        // ✅ Grid の場合は矩形を表示
        this.guideElement.style.display = 'block';
        this.guideElement.style.left = `${left}px`;
        this.guideElement.style.top = `${top}px`;
        this.guideElement.style.width = `${rect.width}px`;
        this.guideElement.style.height = `${rect.height}px`;
        this.guideElement.style.border = '2px solid #4DA3FF';
        this.guideElement.style.backgroundColor = 'rgba(77, 163, 255, 0.1)';
        this.guideElement.style.boxShadow = 'none';
        break;

      case 'absolute':
      case 'map':
        // ✅ Absolute/Map の場合は矩形を表示
        this.guideElement.style.display = 'block';
        this.guideElement.style.left = `${left}px`;
        this.guideElement.style.top = `${top}px`;
        this.guideElement.style.width = `${rect.width}px`;
        this.guideElement.style.height = `${rect.height}px`;
        this.guideElement.style.border = '2px solid #4DA3FF';
        this.guideElement.style.backgroundColor = 'rgba(77, 163, 255, 0.1)';
        this.guideElement.style.boxShadow = 'none';
        break;

      default:
        this.guideElement.style.display = 'none';
        return;
    }

  }

  /**
   * ガイドを非表示
   * ✅ Cursor 2.x完全準拠: Controllerからの明示的な「消せ」コマンド
   * ✅ 判断を一切行わない（PURE VIEW）
   */
  hide(): void {
    if (this.guideElement) {
      this.guideElement.style.display = 'none';
    }
  }

  /**
   * オーバーレイをアンマウント
   * ✅ PHASE12.9: Guide専用rootから削除
   */
  unmount(): void {
    if (this.guideElement && this.guideElement.parentNode) {
      this.guideElement.parentNode.removeChild(this.guideElement);
    }
    // ✅ PHASE12.9: Guide専用rootは残す（次回のmountで再利用）
    // guideRootは削除しない（他のインスタンスが使用する可能性があるため）
    this.guideElement = null;
    this.previewRoot = null;
    this.isMounted = false;
    // ✅ guideRootは保持（次回mount時に再利用）
  }

  /**
   * マウント済みか確認
   */
  getMounted(): boolean {
    return this.isMounted;
  }

  debugFlash(): void {
    if (!this.guideElement) return;
    this.guideElement.style.display = 'block';
    this.guideElement.style.left = '10px';
    this.guideElement.style.top = '10px';
    this.guideElement.style.width = '100px';
    this.guideElement.style.height = '4px';
    this.guideElement.style.backgroundColor = 'red';
    setTimeout(() => this.hide(), 500);
  }
}

/**
 * グローバルスコープへの公開
 * ✅ STEP 7: TestOverlayPanel用（debug only）
 */
if (typeof window !== 'undefined') {
  const dropGuideOverlay = DropGuideOverlay.getInstance();

  (window as any).DropGuideOverlay = DropGuideOverlay;
  (window as any).getDropGuideOverlay = function() {
    return dropGuideOverlay;
  };
  (window as any).debugDropGuideFlash = () => dropGuideOverlay.debugFlash();
}
