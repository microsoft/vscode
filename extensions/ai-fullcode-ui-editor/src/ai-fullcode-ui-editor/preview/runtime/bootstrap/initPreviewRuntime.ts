/**
 * initPreviewRuntime
 * ✅ Cursor 2.x準拠: 起動順を固定
 *
 * 原則:
 * - 初期化順を絶対固定
 * - 順序違反は即クラッシュ
 */

import { PreviewRoot } from '../core/PreviewRoot';
import { ElementRegistry } from '../core/ElementRegistry';
import { LayoutTree } from '../tree/LayoutTree';
import { SelectionController } from '../selection/SelectionController';
import { SelectionState } from '../selection/SelectionState';
import { DragController } from '../dnd/DragController';
import { DropResolver } from '../dnd/DropResolver';
import { PreviewApplyLayer } from '../apply/PreviewApplyLayer';
import { SelectionOverlay } from '../overlays/SelectionOverlay';
import { DropGuideOverlay } from '../overlays/DropGuideOverlay';
import { TestOverlayPanel } from '../debug/TestOverlayPanel';

/**
 * PreviewRuntime 初期化エラー
 */
export class PreviewRuntimeInitError extends Error {
  constructor(message: string, public step: string) {
    super(`[PreviewRuntime] ❌ CRITICAL: ${message} (step: ${step})`);
    this.name = 'PreviewRuntimeInitError';
  }
}

/**
 * PreviewRuntime を初期化
 * ✅ 必須: 初期化順を絶対固定
 * ✅ 必須: 順序違反は即クラッシュ
 *
 * @param rootElement ルート要素（オプション、自動検出も可能）
 */
export function initPreviewRuntime(rootElement?: HTMLElement): void {
  try {
    // ============================================
    // STEP 1: PreviewRoot.get()
    // ============================================
    const previewRoot = PreviewRoot.getInstance();
    let root: HTMLElement;

    if (rootElement) {
      previewRoot.setRoot(rootElement);
      root = previewRoot.get();
    } else {
      // ✅ 自動検出を試みる
      const candidate = document.getElementById('design-surface-container') ||
                       document.querySelector('[data-design-surface="true"]') as HTMLElement;

      if (candidate) {
        previewRoot.setRoot(candidate);
        root = previewRoot.get();
      } else {
        throw new PreviewRuntimeInitError(
          'PreviewRoot not found. Call setRoot() first or provide rootElement.',
          'STEP 1'
        );
      }
    }

    previewRoot.validate();

    // ============================================
    // STEP 1.5: Root style hardening (overlays)
    // ============================================
    // ✅ Cursor-like behavior: overlays rely on an offset parent.
    // If the root is `position: static` (default), absolutely-positioned overlays may
    // be positioned relative to an unexpected ancestor.
    const computed = window.getComputedStyle(root);
    if (computed.position === 'static') {
      root.style.position = 'relative';
    }

    // ============================================
    // STEP 2: ElementRegistry.scan()
    // ============================================
    const elementRegistry = ElementRegistry.getInstance();
    elementRegistry.scan(root);

    const registrySize = elementRegistry.size();
    if (registrySize === 0) {
      throw new PreviewRuntimeInitError(
        'ElementRegistry is empty after scan. No elements with data-element-id found.',
        'STEP 2'
      );
    }

    // ============================================
    // STEP 3: LayoutTree.rebuild()
    // ============================================
    const layoutTree = LayoutTree.getInstance();
    layoutTree.rebuild(root, elementRegistry);

    const treeSize = layoutTree.size();
    if (treeSize === 0) {
      throw new PreviewRuntimeInitError(
        'LayoutTree is empty after rebuild.',
        'STEP 3'
      );
    }

    // ============================================
    // STEP 4: SelectionController.init()
    // ============================================
    const selectionController = SelectionController.getInstance();
    selectionController.init();

    // ============================================
    // STEP 5: DropResolver.init()
    // ============================================
    const dropResolver = DropResolver.getInstance();
    dropResolver.init();

    // ============================================
    // STEP 6: PreviewApplyLayer.init()
    // ============================================
    const previewApplyLayer = PreviewApplyLayer.getInstance();
    previewApplyLayer.init();

    // ============================================
    // STEP 7: SelectionOverlay.mount()
    // ============================================
    const selectionOverlay = SelectionOverlay.getInstance();
    selectionOverlay.mount(root);

    // NOTE:
    // SelectionController.init() is idempotent.
    // When called with a callback, it only registers an additional subscriber
    // and does NOT reset internal state or listeners.
    // This is intentional and matches Cursor 2.x behavior.
    // ✅ Cursor 2.x完全準拠: SelectionController の状態変更を購読
    //    init() は既に呼ばれているが、コールバックを追加するために再度呼び出す
    //    （init() は複数回呼び出し可能で、コールバックを追加するだけ）
    selectionController.init((state: SelectionState) => {
      selectionOverlay.update(state);
    });

    // ============================================
    // STEP 8: DropGuideOverlay.mount()
    // ============================================
    const dropGuideOverlay = DropGuideOverlay.getInstance();
    dropGuideOverlay.mount(root);

    // ============================================
    // STEP 9: DragController.init()
    // ============================================
    const dragController = DragController.getInstance();

    // ✅ DragController のコールバックを設定（DropGuideOverlay の更新を含む）
    dragController.init(
      (session) => {
        // ✅ Cursor-like: clear any previous guide immediately when a drag starts
        dropGuideOverlay.hide();
      },
      (session) => {
        // ✅ ドラッグ更新時にガイドを更新
        if (session.slot) {
          dropGuideOverlay.update(session.slot);
        } else {
          dropGuideOverlay.hide();
        }
      },
      () => {
        // ✅ ドラッグ終了時にガイドを非表示
        dropGuideOverlay.hide();
      }
    );

    // ============================================
    // STEP 9.5: 整合性検証と自己修復（CRITICAL FIX）
    // ============================================
    // ✅ DOM要素が存在するのにRegistry/LayoutTreeに登録されていない場合、再scan/rebuildを1回だけ実行
    const REQUIRED_IDS_FOR_VALIDATION = [
      'dom:placeholder-root',
      'dom:placeholder-group-column-wrapper',
      'dom:placeholder-group-row-wrapper'
    ];

    let needsRescan = false;
    const missingIds: string[] = [];

    for (const requiredId of REQUIRED_IDS_FOR_VALIDATION) {
      // ✅ DOM要素の存在確認
      const domElement = root.querySelector(`[data-element-id="${requiredId}"]`);
      const inRegistry = elementRegistry.get(requiredId) !== null;
      const inLayoutTree = layoutTree.findById(requiredId) !== null;

      if (domElement && (!inRegistry || !inLayoutTree)) {
        needsRescan = true;
        missingIds.push(requiredId);
        console.warn(`[PreviewRuntime] ⚠️  Integrity check failed: ${requiredId}`, {
          domExists: !!domElement,
          inRegistry,
          inLayoutTree
        });
      }
    }

    // ✅ 自己修復: 再scan/rebuildを1回だけ実行
    if (needsRescan && missingIds.length > 0) {
      console.log(`[PreviewRuntime] 🔧 Self-healing: Re-scanning and rebuilding (missing IDs: ${missingIds.join(', ')})`);

      try {
        // ✅ 再scan
        elementRegistry.scan(root);
        const afterScanSize = elementRegistry.size();
        console.log(`[PreviewRuntime] 🔧 After re-scan: registry size = ${afterScanSize}`);

        // ✅ 再構築
        layoutTree.rebuild(root, elementRegistry);
        const afterRebuildSize = layoutTree.size();
        console.log(`[PreviewRuntime] 🔧 After rebuild: tree size = ${afterRebuildSize}`);

        // ✅ 再検証
        let stillMissing: string[] = [];
        for (const requiredId of missingIds) {
          const inRegistry = elementRegistry.get(requiredId) !== null;
          const inLayoutTree = layoutTree.findById(requiredId) !== null;
          if (!inRegistry || !inLayoutTree) {
            stillMissing.push(requiredId);
          }
        }

        if (stillMissing.length > 0) {
          console.error(`[PreviewRuntime] ❌ Self-healing failed: Still missing IDs: ${stillMissing.join(', ')}`);
          throw new PreviewRuntimeInitError(
            `Self-healing failed. Missing IDs after re-scan/rebuild: ${stillMissing.join(', ')}`,
            'STEP 9.5'
          );
        } else {
          console.log(`[PreviewRuntime] ✅ Self-healing successful: All required IDs are now registered`);
        }
      } catch (error) {
        console.error(`[PreviewRuntime] ❌ Self-healing error:`, error);
        throw error;
      }
    }

    // ============================================
    // STEP 12: INTEGRATION CHECK & FAIL FAST
    // ============================================
    const missingSubsystems: string[] = [];
    const checkResults: Record<string, boolean> = {};

    // ✅ CHECK 1: ElementRegistry.size > 0
    const finalRegistrySize = elementRegistry.size();
    checkResults['ElementRegistry'] = finalRegistrySize > 0;
    if (finalRegistrySize === 0) {
      missingSubsystems.push('ElementRegistry (size is 0)');
    }

    // ✅ CHECK 2: LayoutTree.size > 0
    const finalTreeSize = layoutTree.size();
    checkResults['LayoutTree'] = finalTreeSize > 0;
    if (finalTreeSize === 0) {
      missingSubsystems.push('LayoutTree (size is 0)');
    }

    // ✅ CHECK 3: SelectionOverlay mounted
    const selectionOverlayMounted = selectionOverlay.getMounted();
    checkResults['SelectionOverlay'] = selectionOverlayMounted;
    if (!selectionOverlayMounted) {
      missingSubsystems.push('SelectionOverlay (not mounted)');
    }

    // ✅ CHECK 4: PreviewApplyLayer active
    let previewApplyLayerActive = false;
    if (previewApplyLayer) {
      // PreviewApplyLayer が初期化されているか確認
      // elementRegistry が設定されているかで判定
      previewApplyLayerActive = true;
    }
    checkResults['PreviewApplyLayer'] = previewApplyLayerActive;
    if (!previewApplyLayerActive) {
      missingSubsystems.push('PreviewApplyLayer (not initialized or not active)');
    }

    // ✅ CHECK 5: DropGuideOverlay mounted
    const dropGuideOverlayMounted = dropGuideOverlay.getMounted();
    checkResults['DropGuideOverlay'] = dropGuideOverlayMounted;
    if (!dropGuideOverlayMounted) {
      missingSubsystems.push('DropGuideOverlay (not mounted)');
    }

    // ✅ FAIL FAST: 欠落しているサブシステムがあれば致命的エラーをスロー
    if (missingSubsystems.length > 0) {
      const errorMessage = `Integration check failed. Missing subsystems: ${missingSubsystems.join(', ')}`;
      throw new PreviewRuntimeInitError(
        errorMessage,
        'STEP 12: INTEGRATION CHECK'
      );
    }

    // ============================================
    // STEP 13: TestOverlayPanel.init() (debug only)
    // ============================================
    // ✅ STEP 7: デバッグモード時のみ初期化
    const debugFlag = typeof window !== 'undefined' ? (window as any).DEBUG_DND : false;
    const DEBUG_DND = debugFlag === true || debugFlag === 'true' || debugFlag === 1 || debugFlag === '1';
    if (DEBUG_DND) {
      const testOverlayPanel = TestOverlayPanel.getInstance();
      testOverlayPanel.init();
    }

  } catch (error) {
    if (error instanceof PreviewRuntimeInitError) {
      throw error;
    } else {
      throw new PreviewRuntimeInitError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN'
      );
    }
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  (window as any).initPreviewRuntime = initPreviewRuntime;
  (window as any).PreviewRuntimeInitError = PreviewRuntimeInitError;
}
