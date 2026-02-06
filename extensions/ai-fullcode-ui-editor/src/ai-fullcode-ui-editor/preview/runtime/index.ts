/**
 * Runtime Entry Point
 * ✅ Cursor 2.x 完全準拠: 単一エントリーポイント
 *
 * 原則:
 * - ES Module（import / export）のみ
 * - 単一エントリから全Runtimeを初期化
 * - Preview 起動時に一度だけ実行
 * - 循環 import 禁止
 * - 1ファイル最大 ~500行
 */

// ============================================
// STEP 1: Core (PreviewRoot & ElementId)
// ============================================
import './core/ElementId';
import './core/PreviewRoot';

// ============================================
// STEP 2: ElementRegistry
// ============================================
import './core/ElementRegistry';

// ============================================
// STEP 3: LayoutTree
// ============================================
import './tree/LayoutNode';
import './tree/LayoutTree';
import type { LayoutNode } from './tree/LayoutNode';

// ============================================
// STEP 4: Selection
// ============================================
import './selection/SelectionState';
import './selection/SelectionController';

// ============================================
// STEP 5: Drag & Drop
// ============================================
import './dnd/DragSession';
import './dnd/DropResolver';
import './dnd/DragController';

// ============================================
// STEP 6: Apply Layer
// ============================================
import './apply/PreviewApplyLayer';

// ============================================
// STEP 7: Bootstrap
// ============================================
import { initPreviewRuntime, PreviewRuntimeInitError } from './bootstrap/initPreviewRuntime';

// ============================================
// PreviewSource
// ============================================
import './source/PlaceholderPreviewSource';

// ============================================
// STEP 8: Overlays
// ============================================
import './overlays/SelectionOverlay';

// ============================================
// STEP 10: DropGuideOverlay
// ============================================
import './overlays/DropGuideOverlay';

// ============================================
// STEP 2: DragOverlay
// ============================================
import './overlays/DragOverlay';

// ============================================
// STEP 7: TestOverlayPanel (debug only)
// ============================================
import './debug/TestOverlayPanel';

// ============================================
// グローバル初期化（IIFEとして実行）
// ============================================
// ✅ Cursor 2.x準拠: グローバルスコープへの公開は各モジュールで行う
// ✅ 必須: initPreviewRuntime をグローバルに公開（バンドル後も確実に動作するように）
if (typeof window !== 'undefined') {
  // ✅ initPreviewRuntime を明示的にグローバルに公開
  (window as any).initPreviewRuntime = initPreviewRuntime;
  (window as any).PreviewRuntimeInitError = PreviewRuntimeInitError;

  // ✅ DND_GUIDE_GLITCH_ROOT_CAUSE_REPORT_PHASE0: 2. "今動いてるruntime"のbuildIdを強制表示（1行で確定）
  // buildIdは毎回手で変える（例: BUILD_20260118_1905）
  // これがConsoleに出ないなら古いruntimeです
  const BUILD_ID = 'BUILD_20260118_2000'; // ✅ 毎回手で変える
  console.info('[AI-Fullcode-UI-Editor] runtime buildId=', BUILD_ID, 'time=', Date.now());
  (window as any).__PREVIEW_RUNTIME_BUILD_ID__ = BUILD_ID;

  // ✅ CRITICAL FIX: デバッグヘルパーを追加（DOM / Registry / LayoutTree の三点セット検証）
  (window as any).__debugDnDRegistry = function() {
    const registry = (window as any).PreviewRuntime?.ElementRegistry?.getInstance();
    const layoutTree = (window as any).PreviewRuntime?.LayoutTree?.getInstance();
    const previewRoot = (window as any).PreviewRuntime?.PreviewRoot?.getInstance();

    if (!registry || !layoutTree || !previewRoot) {
      console.error('[__debugDnDRegistry] ❌ PreviewRuntime not initialized');
      return;
    }

    const root = previewRoot.get();
    if (!root) {
      console.error('[__debugDnDRegistry] ❌ PreviewRoot not found');
      return;
    }

    // ✅ 必須IDのリスト
    const REQUIRED_IDS = [
      'dom:placeholder-root',
      'dom:placeholder-group-column-wrapper',
      'dom:placeholder-group-row-wrapper'
    ];

    console.log('=== DnD Registry Debug Report ===');
    console.log('Build ID:', (window as any).__PREVIEW_RUNTIME_BUILD_ID__);
    console.log('');

    // ✅ 全登録IDの件数
    const allIds = registry.getAllIds();
    console.log('📊 Registry Stats:');
    console.log('  Total registered IDs:', allIds.length);
    console.log('  Registered IDs:', allIds.slice(0, 20)); // 最初の20件
    if (allIds.length > 20) {
      console.log('  ... and', allIds.length - 20, 'more');
    }
    console.log('');

    // ✅ 必須IDの三点セット検証
    console.log('🔍 Required IDs Check:');
    for (const requiredId of REQUIRED_IDS) {
      const domElement = root.querySelector(`[data-element-id="${requiredId}"]`);
      const inRegistry = registry.get(requiredId) !== null;
      const inLayoutTree = layoutTree.findById(requiredId) !== null;

      const status = domElement && inRegistry && inLayoutTree ? '✅' : '❌';
      console.log(`  ${status} ${requiredId}:`, {
        domExists: !!domElement,
        inRegistry,
        inLayoutTree
      });

      if (domElement && (!inRegistry || !inLayoutTree)) {
        console.warn(`    ⚠️  Mismatch detected: DOM exists but not in Registry/LayoutTree`);
      }
    }
    console.log('');

    // ✅ LayoutTree Stats
    const allNodes = Array.from(layoutTree.getAllNodes().values()) as LayoutNode[];
    const containers = allNodes.filter(n => n.isContainer);
    console.log('🌳 LayoutTree Stats:');
    console.log('  Total nodes:', allNodes.length);
    console.log('  Container nodes:', containers.length);
    console.log('  Container IDs:', containers.map(n => n.elementId).slice(0, 10));
    console.log('');

    // ✅ Wrapper nodes check
    const wrapperIds = ['dom:placeholder-group-column-wrapper', 'dom:placeholder-group-row-wrapper'];
    console.log('🎯 Wrapper Nodes Check:');
    for (const wrapperId of wrapperIds) {
      const node = layoutTree.findById(wrapperId);
      if (node) {
        console.log(`  ✅ ${wrapperId}:`, {
          layoutType: node.layoutType,
          isContainer: node.isContainer,
          childrenParentId: node.childrenParentId,
          childrenCount: node.children.length
        });
      } else {
        console.log(`  ❌ ${wrapperId}: Not found in LayoutTree`);
      }
    }
    console.log('');

    console.log('=== End Debug Report ===');
  };
}
