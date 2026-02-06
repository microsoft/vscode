/**
 * TestOverlayPanel
 * ✅ STEP 7: プレビュー用テストUI（debug only）
 *
 * 原則:
 * - debug only（本番では無効化可能）
 * - Cmd + Shift + D でトグル
 * - すべてのoverlay状態を可視化
 */

export class TestOverlayPanel {
  private static instance: TestOverlayPanel | null = null;
  private panelElement: HTMLElement | null;
  private isVisible: boolean;

  private constructor() {
    this.panelElement = null;
    this.isVisible = false;
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): TestOverlayPanel {
    if (!TestOverlayPanel.instance) {
      TestOverlayPanel.instance = new TestOverlayPanel();
    }
    return TestOverlayPanel.instance;
  }

  /**
   * パネルを初期化
   */
  init(): void {
    // ✅ パネル要素を作成
    this.panelElement = document.createElement('div');
    this.panelElement.setAttribute('data-ui-editor-debug-panel', 'test-overlay');
    this.panelElement.style.position = 'fixed';
    this.panelElement.style.top = '10px';
    this.panelElement.style.right = '10px';
    this.panelElement.style.width = '300px';
    this.panelElement.style.maxHeight = '80vh';
    this.panelElement.style.overflowY = 'auto';
    this.panelElement.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    this.panelElement.style.color = '#fff';
    this.panelElement.style.padding = '16px';
    this.panelElement.style.borderRadius = '8px';
    this.panelElement.style.fontFamily = 'monospace';
    this.panelElement.style.fontSize = '12px';
    this.panelElement.style.zIndex = '999999';
    this.panelElement.style.display = 'none';
    this.panelElement.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';

    // ✅ キーボードショートカット: Cmd + Shift + D
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        this.toggle();
      }
    });

    // ✅ Body に追加（非表示のまま）
    document.body.appendChild(this.panelElement);

    // ✅ 初期レンダリング
    this.update();
  }

  /**
   * パネルを表示/非表示
   */
  toggle(): void {
    if (!this.panelElement) {
      this.init();
    }
    this.isVisible = !this.isVisible;
    if (this.panelElement) {
      this.panelElement.style.display = this.isVisible ? 'block' : 'none';
      if (this.isVisible) {
        this.update();
      }
    }
  }

  /**
   * パネルを更新
   */
  update(): void {
    if (!this.panelElement || !this.isVisible) {
      return;
    }

    const DEBUG_DND = typeof window !== 'undefined' && (window as any).DEBUG_DND === true;

    // ✅ 現在の状態を取得
    const selectionOverlay = typeof window !== 'undefined' && typeof (window as any).getSelectionOverlay === 'function'
      ? (window as any).getSelectionOverlay()
      : null;
    const dragOverlay = typeof window !== 'undefined' && typeof (window as any).getDragOverlay === 'function'
      ? (window as any).getDragOverlay()
      : null;
    const dragController = typeof window !== 'undefined' && typeof (window as any).getDragController === 'function'
      ? (window as any).getDragController()
      : null;
    const dropResolver = typeof window !== 'undefined' && typeof (window as any).getDropResolver === 'function'
      ? (window as any).getDropResolver()
      : null;
    const layoutTree = typeof window !== 'undefined' && typeof (window as any).getLayoutTree === 'function'
      ? (window as any).getLayoutTree()
      : null;
    const elementRegistry = typeof window !== 'undefined' && typeof (window as any).getElementRegistry === 'function'
      ? (window as any).getElementRegistry()
      : null;

    // ✅ 選択状態
    const selectionController = typeof window !== 'undefined' && typeof (window as any).getSelectionController === 'function'
      ? (window as any).getSelectionController()
      : null;
    const currentSelectionId = selectionController?.getSelected?.() ?? null;
    const selectionState = selectionOverlay ? {
      mounted: selectionOverlay.getMounted?.() ?? false,
      selectedElementId: currentSelectionId,
    } : null;

    // ✅ ドラッグ状態
    const dragState = dragController ? {
      isDragging: dragController.isDragging?.() ?? false,
      session: dragController.getCurrentSession?.() ?? null,
    } : null;

    // ✅ ドラッグプレビュー状態
    const dragPreviewState = dragOverlay ? {
      showing: dragOverlay.isShowing?.() ?? false,
      offsetX: dragOverlay.getOffsetX?.() ?? 0,
      offsetY: dragOverlay.getOffsetY?.() ?? 0,
      previewRect: dragOverlay.getPreviewRect?.() ?? null,
    } : null;

    // ✅ スロット情報
    const slotInfo = dragState?.session?.slot ? {
      kind: dragState.session.slot.kind,
      containerId: dragState.session.slot.containerId,
      insertion: dragState.session.slot.insertion,
      insertionIndex: dragState.session.slot.insertionIndex,
      guideStyle: dragState.session.slot.guideStyle,
      hasRenderGuideRect: !!dragState.session.slot.renderGuideRect,
    } : null;

    // ✅ LayoutTree スナップショット
    const treeSnapshot = layoutTree ? {
      size: layoutTree.size?.() ?? 0,
      rootId: (() => {
        try {
          const root = layoutTree.getRoot?.();
          return root?.elementId ?? 'N/A';
        } catch {
          return 'N/A';
        }
      })(),
    } : null;

    // ✅ ElementRegistry スナップショット
    const registrySnapshot = elementRegistry ? {
      size: elementRegistry.size?.() ?? 0,
    } : null;

    // ✅ HTML を生成
    this.panelElement.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">Test Overlay Panel</h3>
        <div style="font-size: 10px; color: #999;">Cmd + Shift + D to toggle</div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 4px;">Selection Overlay</div>
        <div style="padding-left: 8px; font-size: 11px;">
          ${selectionState ? `
            Mounted: ${selectionState.mounted ? '✅' : '❌'}<br>
            Selected ElementId: ${selectionState.selectedElementId || 'none'}
          ` : 'N/A'}
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 4px;">Drag State</div>
        <div style="padding-left: 8px; font-size: 11px;">
          ${dragState ? `
            Is Dragging: ${dragState.isDragging ? '✅' : '❌'}<br>
            ${dragState.session ? `
              ElementId: ${dragState.session.draggedElementId}<br>
              Start: (${dragState.session.startX}, ${dragState.session.startY})<br>
              Current: (${dragState.session.currentX}, ${dragState.session.currentY})
            ` : 'No session'}
          ` : 'N/A'}
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 4px;">Drag Preview</div>
        <div style="padding-left: 8px; font-size: 11px;">
          ${dragPreviewState ? `
            Showing: ${dragPreviewState.showing ? '✅' : '❌'}<br>
            Offset: (${dragPreviewState.offsetX.toFixed(1)}, ${dragPreviewState.offsetY.toFixed(1)})<br>
            ${dragPreviewState.previewRect ? `
              Rect: (${dragPreviewState.previewRect.left.toFixed(1)}, ${dragPreviewState.previewRect.top.toFixed(1)})<br>
              Size: ${dragPreviewState.previewRect.width.toFixed(1)} × ${dragPreviewState.previewRect.height.toFixed(1)}
            ` : 'No rect'}
          ` : 'N/A'}
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 4px;">Current Slot</div>
        <div style="padding-left: 8px; font-size: 11px;">
          ${slotInfo ? `
            Kind: ${slotInfo.kind}<br>
            Container: ${slotInfo.containerId}<br>
            Insertion: ${slotInfo.insertion} (index: ${slotInfo.insertionIndex ?? 'N/A'})<br>
            Guide Style: ${slotInfo.guideStyle ?? 'N/A'}<br>
            Has Guide Rect: ${slotInfo.hasRenderGuideRect ? '✅' : '❌'}
          ` : 'No slot'}
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 4px;">Layout Tree</div>
        <div style="padding-left: 8px; font-size: 11px;">
          ${treeSnapshot ? `
            Size: ${treeSnapshot.size}<br>
            Root ID: ${treeSnapshot.rootId}
          ` : 'N/A'}
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 4px;">Element Registry</div>
        <div style="padding-left: 8px; font-size: 11px;">
          ${registrySnapshot ? `
            Size: ${registrySnapshot.size}
          ` : 'N/A'}
        </div>
      </div>

      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #333;">
        <div style="font-weight: bold; margin-bottom: 8px;">Controls</div>
        <button id="toggle-selection" style="width: 100%; padding: 4px; margin-bottom: 4px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; cursor: pointer;">Toggle Selection Overlay</button>
        <button id="toggle-drag-preview" style="width: 100%; padding: 4px; margin-bottom: 4px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; cursor: pointer;">Toggle Drag Preview</button>
        <button id="toggle-drop-guide" style="width: 100%; padding: 4px; margin-bottom: 4px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; cursor: pointer;">Toggle Drop Guide</button>
        <button id="toggle-debug-dnd" style="width: 100%; padding: 4px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; cursor: pointer;">Toggle DEBUG_DND</button>
      </div>
    `;

    // ✅ ボタンイベントを設定
    const toggleSelectionBtn = this.panelElement.querySelector('#toggle-selection');
    const toggleDragPreviewBtn = this.panelElement.querySelector('#toggle-drag-preview');
    const toggleDropGuideBtn = this.panelElement.querySelector('#toggle-drop-guide');
    const toggleDebugDndBtn = this.panelElement.querySelector('#toggle-debug-dnd');

    if (toggleSelectionBtn) {
      toggleSelectionBtn.addEventListener('click', () => {
        if (selectionOverlay) {
          const currentState = selectionOverlay.getState?.() ?? null;
          if (currentState && currentState.selectedElementId) {
            selectionOverlay.hide?.();
          } else {
            // 選択状態を取得して表示
            const selectionController = typeof window !== 'undefined' && typeof (window as any).getSelectionController === 'function'
              ? (window as any).getSelectionController()
              : null;
            if (selectionController) {
              const state = selectionController.getState?.();
              if (state) {
                selectionOverlay.update?.(state);
              }
            }
          }
          this.update();
        }
      });
    }

    if (toggleDragPreviewBtn) {
      toggleDragPreviewBtn.addEventListener('click', () => {
        if (dragOverlay) {
          if (dragOverlay.isShowing?.()) {
            dragOverlay.hide?.();
          } else {
            // ドラッグプレビューを表示（テスト用）
            const draggedElement = document.querySelector('[data-element-id]') as HTMLElement;
            if (draggedElement) {
              const rect = draggedElement.getBoundingClientRect();
              dragOverlay.prepare?.(draggedElement, rect.left + rect.width / 2, rect.top + rect.height / 2);
              dragOverlay.reveal?.();
            }
          }
          this.update();
        }
      });
    }

    if (toggleDropGuideBtn) {
      toggleDropGuideBtn.addEventListener('click', () => {
        const dropGuideOverlay = typeof window !== 'undefined' && typeof (window as any).getDropGuideOverlay === 'function'
          ? (window as any).getDropGuideOverlay()
          : null;
        if (dropGuideOverlay) {
          if (dropGuideOverlay.isVisible?.()) {
            dropGuideOverlay.hide?.();
          } else {
            // テスト用のスロットを表示
            const testSlot = {
              kind: 'between' as const,
              axis: 'column' as const,
              containerId: 'test-container',
              insertion: 0,
              insertionIndex: 0,
              renderGuideRect: new DOMRect(100, 100, 200, 2),
              guideStyle: 'line' as const,
            };
            dropGuideOverlay.update?.(testSlot);
          }
          this.update();
        }
      });
    }

    if (toggleDebugDndBtn) {
      toggleDebugDndBtn.addEventListener('click', () => {
        if (typeof window !== 'undefined') {
          (window as any).DEBUG_DND = !(window as any).DEBUG_DND;
          this.update();
        }
      });
    }

    // ✅ 定期的に更新（表示中のみ）
    if (this.isVisible) {
      setTimeout(() => this.update(), 500);
    }
  }

  /**
   * パネルを破棄
   */
  destroy(): void {
    if (this.panelElement && this.panelElement.parentNode) {
      this.panelElement.parentNode.removeChild(this.panelElement);
    }
    this.panelElement = null;
    this.isVisible = false;
  }
}

/**
 * グローバルスコープへの公開
 * ✅ STEP 7: debug only
 */
if (typeof window !== 'undefined') {
  const testOverlayPanel = TestOverlayPanel.getInstance();

  (window as any).TestOverlayPanel = TestOverlayPanel;
  (window as any).getTestOverlayPanel = function() {
    return testOverlayPanel;
  };

  // ✅ 自動初期化（DEBUG_DND が有効な場合のみ）
  if ((window as any).DEBUG_DND === true) {
    testOverlayPanel.init();
  }
}
