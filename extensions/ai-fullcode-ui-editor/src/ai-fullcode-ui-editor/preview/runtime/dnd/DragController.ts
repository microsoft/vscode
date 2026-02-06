/**
 * DragController
 * ✅ Cursor 2.x準拠: ドラッグ制御
 *
 * 原則:
 * - dragStart で tree を rebuild
 * - tree に存在しない要素は drag 不可
 * - resolveSlot が null を返す設計は禁止
 */

import { SelectionController } from '../selection/SelectionController';
import { LayoutTree } from '../tree/LayoutTree';
import { ElementRegistry } from '../core/ElementRegistry';
import { PreviewRoot } from '../core/PreviewRoot';
import { DragSession, createDragSession, Slot } from './DragSession';
import { DropResolver } from './DropResolver';
import { PreviewApplyLayer, MoveElementAction } from '../apply/PreviewApplyLayer';
import { DragOverlay } from '../overlays/DragOverlay';
import { DropGuideOverlay } from '../overlays/DropGuideOverlay';

/**
 * ✅ STEP 2: ドラッグ開始時の一瞬のちらつき防止
 * この期間中は SelectionOverlay を非表示にし、DragPreview を表示しない
 */
const DRAG_START_GRACE_MS = 40;

/**
 * ✅ CRITICAL FIX: ドラッグ開始の閾値（ピクセル）
 * pointerdown から pointermove までの距離がこの値以上の場合のみドラッグを開始
 */
const DRAG_THRESHOLD_PX = 5;

/**
 * ✅ PHASE5: 意図ロックの設定
 * drag開始から数pxは「意図を固定」
 * 最初にverticalと判断したら、途中で横に行きづらい
 */
const INTENT_LOCK_CONFIG = {
  // ✅ 意図ロックの距離（ピクセル）
  intentLockDistance: 10, // drag開始から10pxまでは意図を固定
} as const;

/**
 * DragController: ドラッグ制御
 * ✅ Cursor 2.x準拠: シングルトンで管理
 */
export class DragController {
  private static instance: DragController | null = null;
  private currentSession: DragSession | null;
  private onDragStart: ((session: DragSession) => void) | null;
  private onDragUpdate: ((session: DragSession) => void) | null;
  private onDragEnd: ((session: DragSession) => void) | null;
  private selectionController: SelectionController | null;
  private layoutTree: LayoutTree | null;
  private elementRegistry: ElementRegistry | null;
  private previewRoot: PreviewRoot | null;
  private dropResolver: DropResolver | null;
  private previewApplyLayer: PreviewApplyLayer | null;
  private draggedElement: HTMLElement | null;
  private lastResolvedSlot: Slot | null = null; // ✅ Slot安定化レイヤ: 前回のSlotを保持
  private originalStyles: {
    opacity: string | null;
    pointerEvents: string | null;
  } | null;
  private dragOverlay: DragOverlay | null;
  private dragStartTime: number; // ✅ STEP 2: ドラッグ開始時刻
  private gracePeriodEnded: boolean; // ✅ STEP 2: グレース期間終了フラグ
  private hasListeners: boolean; // ✅ イベントリスナーの重複登録を防ぐ
  private dragCandidate: { elementId: string; startX: number; startY: number } | null; // ✅ CRITICAL FIX: ドラッグ候補
  // ✅ PHASE5: 意図ロック用の状態
  private dragIntent: 'row' | 'column' | null = null; // ドラッグ開始時の意図
  private dragStartDistance: number = 0; // ドラッグ開始からの累積距離

  private constructor() {
    this.currentSession = null;
    this.onDragStart = null;
    this.onDragUpdate = null;
    this.onDragEnd = null;
    this.selectionController = null;
    this.layoutTree = null;
    this.dragStartTime = 0;
    this.gracePeriodEnded = false;
    this.elementRegistry = null;
    this.previewRoot = null;
    this.dropResolver = null;
    this.previewApplyLayer = null;
    this.draggedElement = null;
    this.originalStyles = null;
    this.dragOverlay = null;
    this.hasListeners = false;
    this.dragCandidate = null;
    this.dragIntent = null;
    this.dragStartDistance = 0;
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): DragController {
    if (!DragController.instance) {
      DragController.instance = new DragController();
    }
    return DragController.instance;
  }

  /**
   * 初期化
   */
  init(
    onDragStart?: (session: DragSession) => void,
    onDragUpdate?: (session: DragSession) => void,
    onDragEnd?: (session: DragSession) => void
  ): void {
    this.onDragStart = onDragStart || null;
    this.onDragUpdate = onDragUpdate || null;
    this.onDragEnd = onDragEnd || null;

    // ✅ 依存サービスを取得
    if (typeof window !== 'undefined') {
      if (typeof (window as any).getSelectionController === 'function') {
        this.selectionController = (window as any).getSelectionController();
      }
      if (typeof (window as any).getLayoutTree === 'function') {
        this.layoutTree = (window as any).getLayoutTree();
      }
      if (typeof (window as any).getElementRegistry === 'function') {
        this.elementRegistry = (window as any).getElementRegistry();
      }
      if (typeof (window as any).getPreviewRoot === 'function') {
        this.previewRoot = (window as any).getPreviewRoot();
      }
      if (typeof (window as any).getDropResolver === 'function') {
        this.dropResolver = (window as any).getDropResolver();
        this.dropResolver?.init();
      }
      if (typeof (window as any).getPreviewApplyLayer === 'function') {
        this.previewApplyLayer = (window as any).getPreviewApplyLayer();
        this.previewApplyLayer?.init();
      }
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
    const doc = document;

    // ✅ pointerdown: ドラッグ開始の候補
    const pointerdownHandler = (e: PointerEvent) => {
      if (e.button !== 0) {
        return; // 左クリックのみ
      }

      const selectedId = this.selectionController?.getSelected();

      // ✅ CRITICAL FIX: pointerdown ではドラッグ候補を保存するだけ
      // ✅ pointermove で閾値を超えた場合のみドラッグを開始
      if (selectedId && selectedId !== '') {
        this.dragCandidate = {
          elementId: selectedId,
          startX: e.clientX,
          startY: e.clientY,
        };
      } else {
        this.dragCandidate = null;
      }
    };

    // ✅ pointermove: ドラッグ更新
    const pointermoveHandler = (e: PointerEvent) => {
      // ✅ CRITICAL FIX: ドラッグ候補がある場合、閾値を超えたらドラッグを開始
      if (this.dragCandidate && !this.currentSession) {
        const distance = Math.sqrt(
          Math.pow(e.clientX - this.dragCandidate.startX, 2) +
          Math.pow(e.clientY - this.dragCandidate.startY, 2)
        );
        if (distance >= DRAG_THRESHOLD_PX) {
          this.startDrag(this.dragCandidate.elementId, this.dragCandidate.startX, this.dragCandidate.startY);
          this.dragCandidate = null; // ✅ ドラッグ開始後は候補をクリア
        }
      }

      if (this.currentSession) {
        this.updateDrag(e.clientX, e.clientY);
      }
    };

    // ✅ pointerup: ドラッグ終了
    const pointerupHandler = () => {
      // ✅ CRITICAL FIX: ドラッグ候補をクリア（クリックのみの場合）
      if (this.dragCandidate && !this.currentSession) {
        this.dragCandidate = null;
      }

      if (this.currentSession) {
        this.endDrag();
      }
    };

    doc.addEventListener('pointerdown', pointerdownHandler as EventListener, true);
    doc.addEventListener('pointermove', pointermoveHandler as EventListener, true);
    doc.addEventListener('pointerup', pointerupHandler as EventListener, true);

    // ✅ SCROLL_SYNC: スクロール時にガイドを再計算
    // スクロール責任者（[data-scroll-container="true"]）を監視
    const scrollContainer = document.querySelector('[data-scroll-container="true"]') as HTMLElement;
    if (scrollContainer) {
      let rafId: number | null = null;
      const scrollHandler = () => {
        // ✅ ドラッグ中の場合のみガイドを再計算
        if (this.currentSession && this.lastResolvedSlot) {
          // ✅ requestAnimationFrameでスロットリング（パフォーマンス最適化）
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
          }
          rafId = requestAnimationFrame(() => {
            // ✅ 現在のマウス位置でスロットを再解決
            if (this.currentSession && this.dropResolver) {
              // ✅ PHASE5: 意図ロックの距離チェック
              const effectiveDragIntent = this.dragStartDistance <= INTENT_LOCK_CONFIG.intentLockDistance
                ? this.dragIntent
                : null;
              const slot = this.dropResolver.resolveSlot(
                this.currentSession.draggedElementId,
                this.currentSession.currentX,
                this.currentSession.currentY,
                effectiveDragIntent // ✅ PHASE5: 意図ロックを考慮
              );
              if (slot) {
                this.lastResolvedSlot = slot;
                const dropGuideOverlay = DropGuideOverlay.getInstance();
                dropGuideOverlay.update(slot);
              }
            }
            rafId = null;
          });
        }
      };

      // ✅ capture + passive でスクロールイベントを監視
      scrollContainer.addEventListener('scroll', scrollHandler, { capture: true, passive: true });
    }
  }

  /**
   * ドラッグを開始
   * ✅ 必須: dragStart で tree を rebuild
   * ✅ 必須: tree に存在しない要素は drag 不可
   *
   * @param elementId 要素ID
   * @param startX 開始X座標
   * @param startY 開始Y座標
   */
  startDrag(elementId: string, startX: number, startY: number): void {
    if (!this.layoutTree || !this.elementRegistry || !this.previewRoot) {
      return;
    }

    // ✅ STEP 9: drag開始時に tree を rebuild（drag中はrebuild禁止）
    const root = this.previewRoot.get();
    this.layoutTree.rebuild(root, this.elementRegistry);

    // ✅ treeSize === 0 → drag abort
    if (this.layoutTree.size() === 0) {
      return;
    }

    // ✅ draggedElementId not in tree → drag abort
    const draggedNode = this.layoutTree.findById(elementId);
    if (!draggedNode) {
      return;
    }

    // ✅ ドラッグセッションを作成
    this.currentSession = createDragSession(elementId, draggedNode, startX, startY);

    // ✅ Slot安定化レイヤ: drag start で lastResolvedSlot をリセット
    this.lastResolvedSlot = null;

    // ✅ PHASE5: 意図ロックをリセット
    this.dragIntent = null;
    this.dragStartDistance = 0;

    // ✅ Cursor完全準拠: drag start で lastValidContainer をリセット
    if (this.dropResolver) {
      this.dropResolver.resetLastValidContainer();
      this.dropResolver.resetAxisHysteresis(); // ✅ PHASE4: 方向ヒステリシスをリセット
      this.dropResolver.resetLastSelectedSlot(); // ✅ GUIDE_GLITCH_FIX STEP B: lastSelectedSlotをリセット
      // ✅ GUIDE_GLITCH_FIX STEP A: drag開始時にscroll containerを固定（全コンテナをスキャン）
      // ✅ GUIDE_GLITCH_FIX STEP D: drag開始時にeffectiveBoundsの採用元を固定
      if (this.layoutTree) {
        const allContainerIds: string[] = [];
        const allNodes = this.layoutTree.getAllNodes();
        for (const node of allNodes.values()) {
          if (node.isContainer) {
            allContainerIds.push(node.elementId);
          }
        }
        this.dropResolver.fixScrollContainersForDrag(allContainerIds);
        this.dropResolver.fixEffectiveBoundsForDrag(allContainerIds);
      }
    }

    // ✅ STEP 2: ドラッグ開始時刻を記録
    this.dragStartTime = Date.now();
    this.gracePeriodEnded = false;

    // ✅ Cursor 2.x完全準拠: DragControllerがOverlay表示の唯一の判断者
    // ✅ startDrag: selectionOverlay.hide() を明示的に呼び出す
    if (typeof window !== 'undefined' && typeof (window as any).getSelectionOverlay === 'function') {
      const selectionOverlay = (window as any).getSelectionOverlay();
      if (selectionOverlay) {
        selectionOverlay.hide();
      }
    }

    // ✅ ドラッグ中の要素を取得
    const draggedElement = this.elementRegistry.get(elementId);
    if (draggedElement) {
      this.draggedElement = draggedElement;
      // ✅ CRITICAL FIX: applyDragStyles を try-catch で囲む（エラー時も確実に復元）
      try {
        this.applyDragStyles(draggedElement);
      } catch (error) {
        // ✅ エラー時も確実に復元
        this.restoreDragStyles(draggedElement);
        this.draggedElement = null;
        this.currentSession = null;
        return;
      }

      // ✅ Cursor 2.x完全準拠: DragControllerがOverlay表示の唯一の判断者
      // ✅ startDrag: dragPreview.prepare() を呼び出す（グレース期間中は非表示のまま）
      if (typeof window !== 'undefined' && typeof (window as any).getDragOverlay === 'function') {
        this.dragOverlay = (window as any).getDragOverlay();
        if (this.dragOverlay) {
          this.dragOverlay.prepare(draggedElement, startX, startY);
          // ✅ STEP 2: グレース期間中は reveal() を呼ばない
        }
      }
    }

    // ✅ コールバックを呼び出し
    if (this.onDragStart && this.currentSession) {
      this.onDragStart(this.currentSession);
    }
  }

  /**
   * ドラッグを更新
   *
   * @param currentX 現在X座標
   * @param currentY 現在Y座標
   */
  updateDrag(currentX: number, currentY: number): void {
    if (!this.currentSession || !this.dropResolver) {
      return;
    }

    // ✅ STEP 2: グレース期間をチェック
    const elapsed = Date.now() - this.dragStartTime;
    if (!this.gracePeriodEnded && elapsed >= DRAG_START_GRACE_MS) {
      // ✅ Cursor 2.x完全準拠: DragControllerがOverlay表示の唯一の判断者
      // ✅ グレース期間終了 → DragPreview を表示
      if (this.dragOverlay) {
        this.dragOverlay.reveal();
      }
      this.gracePeriodEnded = true;
    }

    // ✅ セッションを更新
    this.currentSession.currentX = currentX;
    this.currentSession.currentY = currentY;

    // ✅ PHASE5: ドラッグ開始からの累積距離を計算
    const deltaX = currentX - this.currentSession.startX;
    const deltaY = currentY - this.currentSession.startY;
    this.dragStartDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // ✅ PHASE5: 初回Slot解決時に意図を記録
    const isFirstSlot = this.lastResolvedSlot === null;
    if (isFirstSlot && this.dragStartDistance > 0) {
      // ✅ 最初の移動から意図を判定（deltaXとdeltaYの大きさで判定）
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      if (absDeltaX > absDeltaY) {
        this.dragIntent = 'row';
      } else if (absDeltaY > absDeltaX) {
        this.dragIntent = 'column';
      }
    }

    // ✅ PHASE5: 意図ロックの距離チェック
    // dragStartDistanceがINTENT_LOCK_DISTANCE以下の場合のみ、dragIntentを渡す
    const effectiveDragIntent = this.dragStartDistance <= INTENT_LOCK_CONFIG.intentLockDistance
      ? this.dragIntent
      : null;

    // ✅ スロットを解決
    const slot = this.dropResolver.resolveSlot(
      this.currentSession.draggedElementId,
      currentX,
      currentY,
      effectiveDragIntent // ✅ PHASE5: 意図ロックを考慮（距離チェック済み）
    );

    // ✅ Slot安定化レイヤ: 前回のSlotと同じなら何もしない（ただし初回は除く）
    if (!isFirstSlot && this.isSameSlot(this.lastResolvedSlot, slot)) {
      // ✅ スロットを更新（セッションは更新するが、コールバックは呼ばない）
      this.currentSession.slot = slot;
      // ✅ DragOverlay は常に更新（カーソル追従のため）
      if (this.dragOverlay) {
        this.dragOverlay.update(currentX, currentY);
      }
      return; // ✅ 早期リターン: ガイド再描画をスキップ
    }

    // ✅ スロットが変わった場合のみ更新
    this.lastResolvedSlot = slot;
    this.currentSession.slot = slot;

    // ✅ STEP 3: pointerMove: DragOverlay.update + DropResolver.resolveSlot
    // ✅ STEP 1: pointerMoveが一度も来なければOverlayは出ない
    // ✅ STEP 2: グレース期間中は update のみ（reveal は既に呼ばれている）
    if (this.dragOverlay) {
      this.dragOverlay.update(currentX, currentY);
    }

    // ✅ コールバックを呼び出し（DropGuideOverlay の更新はコールバック経由）
    if (this.onDragUpdate && this.currentSession) {
      this.onDragUpdate(this.currentSession);
    }
  }

  /**
   * Slot安定化レイヤ: 2つのSlotが同じかどうかを判定
   * ✅ Cursor完全準拠: 評価は常時するが、変化がない限り何もしない
   * ✅ BUG-001 FIX: 判定を緩和（ガイドが表示されない問題を修正）
   *
   * @param prevSlot 前回のSlot
   * @param nextSlot 今回のSlot
   * @returns 同じなら true
   */
  private isSameSlot(prevSlot: Slot | null, nextSlot: Slot | null): boolean {
    // ✅ 両方 null なら同じ
    if (!prevSlot && !nextSlot) {
      return true;
    }

    // ✅ 片方だけ null なら違う
    if (!prevSlot || !nextSlot) {
      return false;
    }

    // ✅ BUG-001 FIX: kind, containerId, insertionIndex が同じかチェック（主要な判定）
    if (
      prevSlot.kind !== nextSlot.kind ||
      prevSlot.containerId !== nextSlot.containerId ||
      prevSlot.insertionIndex !== nextSlot.insertionIndex
    ) {
      return false;
    }

    // ✅ BUG-001 FIX: guideRect の比較を緩和（位置が大きく変わった場合のみ「違う」と判定）
    // ✅ カーソル位置に合わせてガイドが動くため、完全一致を求めない
    // ✅ Cursor準拠: 固定値ではなく、将来的には相対値（コンテナサイズに応じたEPS）を検討
    const EPS = 10; // ✅ 現在は固定値10px（カーソル位置に合わせてガイドが動くため）
    const prevRect = prevSlot.renderGuideRect;
    const nextRect = nextSlot.renderGuideRect;

    if (!prevRect && !nextRect) {
      return true;
    }

    if (!prevRect || !nextRect) {
      return false;
    }

    // ✅ 矩形の位置が大きく変わった場合のみ「違う」と判定（サイズは厳密にチェック）
    const positionChanged =
      Math.abs(prevRect.left - nextRect.left) > EPS ||
      Math.abs(prevRect.top - nextRect.top) > EPS;

    const sizeChanged =
      Math.abs(prevRect.width - nextRect.width) > 1 || // ✅ サイズは1px以内
      Math.abs(prevRect.height - nextRect.height) > 1;

    // ✅ 位置が大きく変わった、またはサイズが変わった場合は「違う」
    return !positionChanged && !sizeChanged;
  }

  /**
   * ドラッグを終了
   * ✅ STEP 5: debugModeフラグでログ制御
   */
  endDrag(): void {
    // ✅ GUIDE_GLITCH_FIX STEP A: drag終了時にscroll containerをリセット
    // ✅ GUIDE_GLITCH_FIX STEP D: drag終了時にeffectiveBoundsをリセット
    // ✅ フェーズ7対策: drag終了時にinside intent hysteresisをリセット
    if (this.dropResolver) {
      this.dropResolver.resetFixedScrollContainers();
      this.dropResolver.resetLastSelectedSlot(); // ✅ GUIDE_GLITCH_FIX STEP B: lastSelectedSlotをリセット
      this.dropResolver.resetFixedEffectiveBounds();
      this.dropResolver.resetInsideIntentHysteresis();
    }
    if (!this.currentSession) {
      return;
    }

    // ✅ コールバックを呼び出し（DropGuideOverlay の非表示はコールバック経由）
    if (this.onDragEnd && this.currentSession) {
      this.onDragEnd(this.currentSession);
    }

    // ✅ Cursor 2.x完全準拠: DragControllerがOverlay表示の唯一の判断者
    // ✅ endDrag: dragPreview.hide() / dropGuide.hide() を必ず実行
    // ✅ finally句相当で cleanup を保証
    try {
      // ✅ DragOverlay を非表示（必ず実行）
      if (this.dragOverlay) {
        this.dragOverlay.hide();
        this.dragOverlay = null;
      }
    } catch (error) {
      // Silent error handling
    }

    // ✅ ドラッグ中の要素のスタイルを復元
    // ✅ CRITICAL FIX: ドラッグスタイルを確実に復元（エラー時も確実に復元）
    if (this.draggedElement) {
      try {
        this.restoreDragStyles(this.draggedElement);
      } catch (error) {
        // ✅ エラー時も確実に pointer-events を復元
        if (this.draggedElement) {
          this.draggedElement.style.removeProperty('pointer-events');
          this.draggedElement.style.removeProperty('opacity');
        }
      }
    }

    // ✅ Slot安定化レイヤ: drag end で lastResolvedSlot をリセット
    this.lastResolvedSlot = null;

    this.draggedElement = null;
    this.originalStyles = null;

    // ✅ STEP 4: Slot未検出時のフォールバック（重要）
    if (!this.currentSession.slot) {
      // ✅ STEP 4: slot === null の場合は何もしない（正常系）
      // ✅ ロールバックは不要（元の位置に留まる）
    } else if (this.previewApplyLayer) {
      // ✅ CRITICAL FIX: absolute/map レイアウトでは insertionIndex が undefined の場合、最後に追加
      const targetIndex = this.currentSession.slot.insertionIndex !== undefined
        ? this.currentSession.slot.insertionIndex
        : (this.currentSession.slot.insertion !== undefined
          ? this.currentSession.slot.insertion
          : undefined); // ✅ undefined の場合は applyMove で最後に追加

      // ✅ CRITICAL FIX: insertionParentId を使用（wrapper pattern 対応、Cursor仕様完全準拠）
      // gap判定・ガイド描画・drop適用で参照するIDを完全統一
      // effectiveId（insertionParentId）が実際にDOM操作可能な親要素として存在することを確認
      const targetContainerId = this.currentSession.slot.insertionParentId ?? this.currentSession.slot.containerId;

      const action: MoveElementAction = {
        elementId: this.currentSession.draggedElementId,
        targetContainerId, // ✅ CRITICAL FIX: effectiveId に統一（gap判定・ガイド描画と同じ）
        targetIndex: targetIndex ?? -1, // ✅ -1 は applyMove で最後に追加を意味する
        targetRowIndex: this.currentSession.slot.targetRowIndex,
        targetColumnIndex: this.currentSession.slot.targetColumnIndex,
      };

      // ✅ STEP 4: ドロップ不能時のフォールバック（安全装置）
      // ✅ STEP 4: slot情報が不整合（container不存在など）の場合のみロールバック
      let shouldRollback = false;
      let rollbackError: Error | null = null;

      try {
        // ✅ CRITICAL FIX: targetContainerId（effectiveId）の存在チェック
        // containerIdではなくtargetContainerIdをチェックすることで、
        // effectiveIdが実際にDOM操作可能な親要素として存在することを保証
        if (this.elementRegistry) {
          const targetContainer = this.elementRegistry.get(targetContainerId);
          if (!targetContainer) {
            shouldRollback = true;
            rollbackError = new Error(`Target container not found: ${targetContainerId} (effectiveId from insertionParentId: ${this.currentSession.slot.insertionParentId}, containerId: ${this.currentSession.slot.containerId})`);
          } else {
            // ✅ CRITICAL FIX: targetContainerが実際にDOM操作可能な要素か確認
            // HTMLElementであり、appendChild/insertBefore可能な要素であることを確認
            if (!(targetContainer instanceof HTMLElement)) {
              shouldRollback = true;
              rollbackError = new Error(`Target container is not an HTMLElement: ${targetContainerId}`);
            }
          }
        }

        // ✅ STEP 4: insertionIndex が無効な場合もチェック
        if (!shouldRollback && (this.currentSession.slot.insertionIndex === undefined || this.currentSession.slot.insertionIndex < 0)) {
          shouldRollback = true;
          rollbackError = new Error(`Invalid insertionIndex: ${this.currentSession.slot.insertionIndex}`);
        }

        if (!shouldRollback) {
          this.previewApplyLayer.applyMove(action);

          // ✅ STEP 9: drop確定後に LayoutTree.rebuild を1回だけ実行（drag中はrebuild禁止）
          if (this.layoutTree && this.elementRegistry && this.previewRoot) {
            const root = this.previewRoot.get();
            this.layoutTree.rebuild(root, this.elementRegistry);
          }
        }
      } catch (error) {
        // ✅ STEP 4: applyMove が throw した場合のみロールバック
        shouldRollback = true;
        rollbackError = error instanceof Error ? error : new Error(String(error));
      }

      // ✅ STEP 4: ロールバック処理（異常時のみ）
      if (shouldRollback && this.draggedElement && this.elementRegistry && this.layoutTree) {
        try {
          // ✅ STEP 4: 元の位置を取得（drag開始時の親要素）
          const originalParent = this.currentSession.draggedNode.parentId;
          if (originalParent) {
            const originalParentNode = this.layoutTree.findById(originalParent);
            const originalParentElement = this.elementRegistry.get(originalParent);
            if (originalParentNode && originalParentElement) {
              // ✅ STEP 4: 元の位置に戻す（静かに）
              // ✅ 親要素のchildren配列から元のインデックスを取得
              const originalIndex = originalParentNode.children.indexOf(this.currentSession.draggedElementId);
              const rollbackAction: MoveElementAction = {
                elementId: this.currentSession.draggedElementId,
                targetContainerId: originalParent,
                targetIndex: originalIndex >= 0 ? originalIndex : 0,
              };
              this.previewApplyLayer.applyMove(rollbackAction);
            }
          }
        } catch (rollbackError) {
          // Silent error handling
        }
      }
    }

    // ✅ STEP 2: グレース期間フラグをリセット
    this.dragStartTime = 0;
    this.gracePeriodEnded = false;

    // ✅ Cursor完全準拠: drag end で lastValidContainer をリセット
    if (this.dropResolver) {
      this.dropResolver.resetLastValidContainer();
      this.dropResolver.resetAxisHysteresis(); // ✅ PHASE4: 方向ヒステリシスをリセット
    }

    // ✅ セッションをクリア（先にクリアして、isDragging()がfalseになるようにする）
    const draggedElementId = this.currentSession.draggedElementId;
    this.currentSession = null;

    // ✅ Cursor 2.x完全準拠: Selection復元の正解ルート
    // ✅ endDrag() MUST:
    //     1. clear drag session (already done above)
    //     2. call SelectionController.setSelected(lastSelectedId)
    //     3. let callback update SelectionOverlay
    // ✅ Anti-rule: Do NOT call SelectionOverlay.update() manually
    if (this.selectionController) {
      const selectedId = this.selectionController.getSelected();
      // ✅ ドラッグしていた要素が選択されていた場合、再選択してコールバックをトリガー
      if (selectedId && selectedId === draggedElementId) {
        // ✅ setSelected()を呼び出すことで、コールバック経由でSelectionOverlayが更新される
        // ✅ SelectionControllerは状態をemitするだけ（Overlayを直接操作しない）
        this.selectionController.setSelected(selectedId);
      }
    }
  }

  /**
   * 現在のドラッグセッションを取得
   *
   * @returns DragSession または null
   */
  getCurrentSession(): DragSession | null {
    return this.currentSession;
  }

  /**
   * ドラッグ中か確認
   *
   * @returns boolean
   */
  isDragging(): boolean {
    return this.currentSession !== null;
  }

  /**
   * ドラッグスタイルを適用
   * ✅ UX安定化: 透明度と pointer-events を設定
   *
   * @param element ドラッグ中の要素
   */
  private applyDragStyles(element: HTMLElement): void {
    if (!element) {
      return;
    }

    // ✅ 元のスタイルを保存
    this.originalStyles = {
      opacity: element.style.opacity || null,
      pointerEvents: element.style.pointerEvents || null,
    };

    // ✅ ドラッグ中のスタイルを適用
    element.style.opacity = '0.5';
    element.style.pointerEvents = 'none';
  }

  /**
   * ドラッグスタイルを復元
   * ✅ UX安定化: 元のスタイルに戻す
   *
   * @param element ドラッグ中の要素
   */
  private restoreDragStyles(element: HTMLElement): void {
    if (!element || !this.originalStyles) {
      return;
    }

    // ✅ 元のスタイルを復元
    if (this.originalStyles.opacity !== null) {
      element.style.opacity = this.originalStyles.opacity;
    } else {
      element.style.removeProperty('opacity');
    }

    if (this.originalStyles.pointerEvents !== null) {
      element.style.pointerEvents = this.originalStyles.pointerEvents;
    } else {
      element.style.removeProperty('pointer-events');
    }
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  const dragController = DragController.getInstance();

  (window as any).DragController = DragController;
  (window as any).getDragController = function() {
    return dragController;
  };
}
