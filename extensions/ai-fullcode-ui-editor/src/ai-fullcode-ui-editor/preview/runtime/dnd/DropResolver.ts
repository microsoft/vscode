/**
 * DropResolver
 * ✅ Cursor 2.x準拠: ドロップ位置の解決
 *
 * 原則:
 * - resolveSlot が null を返す設計は禁止
 * - tree に存在しない要素は drag 不可
 */

import { LayoutTree } from '../tree/LayoutTree';
import { LayoutNode } from '../tree/LayoutNode';
import { Slot } from './DragSession';
import { ElementRegistry } from '../core/ElementRegistry';

/**
 * ✅ BLOCK_AND_PARENT: 子slotが「十分に良い」と判断する閾値（レイアウト種別ごと）
 * Cursor同等: レイアウト種別ごとに微差がある
 */
const CHILD_CONFIDENCE_THRESHOLD: Record<LayoutNode['layoutType'], number> = {
  'flex-row': 0.9,
  'flex-column': 0.9,
  'grid': 0.88,
  'absolute': 0.92,
  'block': 0.9, // blockは親として扱うため、子として選ばれることは少ない
};

/**
 * ✅ BLOCK_AND_PARENT: depthPenaltyの係数（config化）
 * 後で調整したくなるので定数化
 */
const DEPTH_PENALTY = {
  default: 0.02,
  blockBetween: 0.01, // ✅ block betweenは半分の減衰率（親レイヤでも選ばれやすくする）
  // ✅ PHASE2.5: depth >= 2のancestorに対してはより強い減衰を適用
  deepAncestor: 0.04, // ✅ depth >= 2のancestorは通常の2倍の減衰率
} as const;

/**
 * ✅ PHASE2.5: Ancestor候補の設定
 * depth >= 2のancestor block betweenを候補に含める
 */
const ANCESTOR_CANDIDATE_CONFIG = {
  // ✅ depth >= 2のancestorを候補に含めるかどうか
  includeDeepAncestors: true,
  // ✅ viewport外の候補に対するconfidence減衰
  viewportOutPenalty: 0.15, // viewport外の候補はconfidenceを0.15減らす
} as const;

/**
 * ✅ PHASE3: Scroll Container Clippingの設定
 * スクロール可能なancestorを検出し、そのancestorのviewportを基準にclipping
 */
const SCROLL_CONTAINER_CONFIG = {
  // ✅ スクロールコンテナのviewport外の候補に対するconfidence減衰
  scrollViewportOutPenalty: 0.2, // スクロールコンテナのviewport外の候補はconfidenceを0.2減らす
} as const;

/**
 * ✅ PHASE1: 水平候補（兄弟/cousin横断DnD）の設定
 * 同一depth帯のblockを「水平候補」として扱う
 * 最初は完全一致（depth === initialDepth）で始める
 * 将来的に depth ±1 に拡張可能な設計
 */
const HORIZONTAL_CANDIDATE_CONFIG = {
  // ✅ 最初は完全一致のみ（将来的に ±1 に拡張可能）
  depthTolerance: 0, // depth === initialDepth のみ（将来的に 1 に変更可能）
  // ✅ 水平候補にconfidenceボーナスを追加（オプション）
  horizontalBonus: 0.05, // 水平候補に0.05のconfidenceボーナス
} as const;

/**
 * ✅ PHASE4: 方向ヒステリシスの設定
 * 縦DnD中に横候補へ急に切り替わらない
 * 一定距離・一定時間が必要
 */
const AXIS_HYSTERESIS_CONFIG = {
  // ✅ 方向変更に必要な距離（ピクセル）
  axisChangeThreshold: 50, // 50px以上移動してから方向を切り替え
} as const;

/**
 * DropResolver: ドロップ位置の解決
 * ✅ Cursor 2.x準拠: シングルトンで管理
 */
export class DropResolver {
  private static instance: DropResolver | null = null;
  private layoutTree: LayoutTree | null;
  // ✅ Cursor完全準拠: 最後に有効だった container を保持（null フレームを吸収）
  private lastValidContainer: LayoutNode | null = null;
  // ✅ PHASE4: 方向ヒステリシス用の状態
  private lastSlotAxis: 'row' | 'column' | null = null;
  private axisChangeStartX: number = 0;
  private axisChangeStartY: number = 0;
  // ✅ GUIDE_GLITCH_FIX STEP A: dragセッション中のscroll containerを固定
  private fixedScrollContainers: Map<string, HTMLElement | null> = new Map();
  // ✅ GUIDE_GLITCH_FIX STEP B: 選択されたslotを短時間スティッキーにする
  private lastSelectedSlot: {
    containerId: string;
    kind: string;
    insertionIndex: number | undefined;
    gapKey: string; // gap位置を識別するキー
  } | null = null;
  // ✅ GUIDE_GLITCH_FIX STEP D: dragセッション中のeffectiveBoundsの採用元を固定
  private fixedEffectiveBounds: Map<string, { effectiveId: string; effectiveBounds: LayoutNode['bounds'] | null }> = new Map();
  // ✅ フェーズ7対策: inside intent hysteresis（ちらつき防止）
  private lastInsideIntentContainerId: string | null = null;
  private lastInsideIntentTimestamp: number = 0;
  private lastInsideIntentMouseX: number = 0;
  private lastInsideIntentMouseY: number = 0;

  private constructor() {
    this.layoutTree = null;
    this.lastValidContainer = null;
    this.lastSlotAxis = null;
    this.axisChangeStartX = 0;
    this.axisChangeStartY = 0;
    this.fixedScrollContainers = new Map();
    this.lastSelectedSlot = null;
    this.fixedEffectiveBounds = new Map();
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): DropResolver {
    if (!DropResolver.instance) {
      DropResolver.instance = new DropResolver();
    }
    return DropResolver.instance;
  }

  /**
   * 初期化
   */
  init(): void {
    // ✅ LayoutTree を取得
    if (typeof window !== 'undefined' && typeof (window as any).getLayoutTree === 'function') {
      this.layoutTree = (window as any).getLayoutTree();
    }
  }

  /**
   * 最後に有効だった container をリセット
   * ✅ Cursor完全準拠: drag start / drag end で呼び出す
   */
  resetLastValidContainer(): void {
    this.lastValidContainer = null;
  }

  /**
   * ✅ PHASE4: 方向ヒステリシス用の状態をリセット
   * drag start / drag end で呼び出す
   */
  resetAxisHysteresis(): void {
    this.lastSlotAxis = null;
    this.axisChangeStartX = 0;
    this.axisChangeStartY = 0;
  }

  /**
   * ✅ GUIDE_GLITCH_FIX STEP A: dragセッション開始時にscroll containerを固定
   * drag開始時に1回だけ確定して、drag終了まで固定
   */
  fixScrollContainersForDrag(containerIds: string[]): void {
    this.fixedScrollContainers.clear();
    for (const containerId of containerIds) {
      const scrollContainer = this.findScrollContainer(containerId);
      this.fixedScrollContainers.set(containerId, scrollContainer);
    }
  }

  /**
   * ✅ GUIDE_GLITCH_FIX STEP A: dragセッション終了時にscroll containerをリセット
   */
  resetFixedScrollContainers(): void {
    this.fixedScrollContainers.clear();
  }

  /**
   * ✅ GUIDE_GLITCH_FIX STEP B: 選択されたslotを短時間スティッキーにする
   * 前フレームのselected slotを記録
   */
  setLastSelectedSlot(containerId: string, kind: string, insertionIndex: number | undefined, gapKey: string): void {
    this.lastSelectedSlot = {
      containerId,
      kind,
      insertionIndex,
      gapKey,
    };
  }

  /**
   * ✅ GUIDE_GLITCH_FIX STEP B: 選択されたslotを短時間スティッキーにする
   * 前フレームのselected slotを取得
   */
  getLastSelectedSlot(): {
    containerId: string;
    kind: string;
    insertionIndex: number | undefined;
    gapKey: string;
  } | null {
    return this.lastSelectedSlot;
  }

  /**
   * ✅ GUIDE_GLITCH_FIX STEP B: dragセッション終了時にlastSelectedSlotをリセット
   */
  resetLastSelectedSlot(): void {
    this.lastSelectedSlot = null;
  }

  /**
   * ✅ GUIDE_GLITCH_FIX STEP D: dragセッション開始時にeffectiveBoundsの採用元を固定
   * drag開始時に1回だけ確定して、drag終了まで固定
   */
  fixEffectiveBoundsForDrag(containerIds: string[]): void {
    this.fixedEffectiveBounds.clear();
    if (!this.layoutTree) {
      return;
    }

    for (const containerId of containerIds) {
      const effectiveId = this.layoutTree.getEffectiveChildrenParentId(containerId) ?? containerId;
      const effectiveBounds = this.layoutTree.getEffectiveBounds(effectiveId);
      this.fixedEffectiveBounds.set(containerId, {
        effectiveId,
        effectiveBounds,
      });
    }
  }

  /**
   * ✅ GUIDE_GLITCH_FIX STEP D: dragセッション終了時にeffectiveBoundsをリセット
   */
  resetFixedEffectiveBounds(): void {
    this.fixedEffectiveBounds.clear();
  }

  /**
   * ✅ フェーズ7対策: dragセッション終了時にinside intent hysteresisをリセット
   * ✅ PHASE12.8: inside lockもリセット
   */
  resetInsideIntentHysteresis(): void {
    this.lastInsideIntentContainerId = null;
    this.lastInsideIntentTimestamp = 0;
    this.lastInsideIntentMouseX = 0;
    this.lastInsideIntentMouseY = 0;
  }

  /**
   * ✅ GUIDE_GLITCH_FIX STEP D: dragセッション中は固定されたeffectiveBoundsを返す
   */
  private getFixedEffectiveBounds(containerId: string): { effectiveId: string; effectiveBounds: LayoutNode['bounds'] | null } | null {
    return this.fixedEffectiveBounds.get(containerId) ?? null;
  }

  /**
   * スロットを解決
   * ✅ 必須: null を返す設計は禁止（ただし、解決できない場合は null を返す）
   * ✅ STEP 10: DEBUG_DND=true の時だけ詳細ログを出力
   *
   * @param draggedElementId ドラッグ中の要素ID
   * @param mouseX マウスX座標
   * @param mouseY マウスY座標
   * @param dragIntent ドラッグ開始時の意図（PHASE5: 意図ロック用）
   * @returns Slot または null（解決できない場合）
   */
  resolveSlot(draggedElementId: string, mouseX: number, mouseY: number, dragIntent?: 'row' | 'column' | null): Slot | null {
    // ✅ DND_GUIDE_GLITCH_ROOT_CAUSE_REPORT_PHASE0: 3. "DropResolver.tsが実際に呼ばれているか"を関数先頭で証明
    console.info('[DropResolver] resolveSlot ENTER', {
      draggedElementId,
      mouseX,
      mouseY,
      dragIntent,
      t: Date.now()
    });

    if (!this.layoutTree) {
      return null;
    }

    // ✅ treeSize === 0 → null を返す
    if (this.layoutTree.size() === 0) {
      return null;
    }

    // ✅ draggedElementId not in tree → null を返す
    const draggedNode = this.layoutTree.findById(draggedElementId);
    if (!draggedNode) {
      return null;
    }

    // ✅ マウス位置からコンテナを検索
    const containerNode = this.findContainerAt(mouseX, mouseY, draggedNode);
    if (!containerNode) {
      return null;
    }

    // ✅ PHASE0_S2: Dragged Subtree Exclusion - ドラッグ中のノードの子孫IDセットを取得
    const draggedDescendantIds = this.layoutTree?.getDescendantIds(draggedNode.elementId) ?? new Set<string>();
    // 自分自身も除外対象に追加（自己内dropを完全に禁止）
    draggedDescendantIds.add(draggedNode.elementId);

    // ✅ FIX 3: ancestor resolve を root まで行う（Cursor 2.x準拠）
    // ✅ 複数の祖先コンテナを試行し、confidence を ancestor depth で減衰
    // ✅ BUG-005/007 FIX: より深い階層まで探索できるように改善
    // ✅ BLOCK_AND_PARENT: 親レイヤ候補の可視化
    // ✅ PHASE1_PREP: initialDepthを記録（兄弟/cousin横断DnD用、将来的にdepth±1に拡張可能）
    const DEBUG_DND = typeof window !== 'undefined' && (window as any).DEBUG_DND === true;
    const candidateSlots: Array<{
      slot: Slot;
      depth: number;
      containerId: string;
      layoutType: LayoutNode['layoutType']; // ✅ layoutTypeを追加（親fallbackロジック用）
    }> = [];
    let current: LayoutNode | null = containerNode;
    let depth = 0;
    const initialDepth = 0; // ✅ PHASE1_PREP: 最初に見つかったcontainerのdepth（フェーズ1で使用）
    const MAX_ANCESTOR_DEPTH = 10; // ✅ BUG-007 FIX: 5 → 10 に増加（より深い階層まで探索）

    if (DEBUG_DND) {
      console.log('[DropResolver] 🔍 PARENT_CANDIDATE_DEBUG: ancestor walk start', {
        initialContainerId: containerNode.elementId,
        draggedNodeId: draggedNode.elementId,
        mouseX,
        mouseY
      });
    }

    // ✅ FIX2: 子孫コンテナも探索して slot を生成
    // ⚠️ 暫定Fix（DND_FIX_ELEMENT_TO_GROUP）: グループが containerNode の直下でない場合（root→group-column→group-column-wrapper）
    // に備え、子孫 BFS + ルートからの探索で候補を補完している。
    // Cursor 仕様の原則は「ヒットしたコンテナ or その子孫のみ」であり、本来は findContainerAt が
    // マウス直下の正しいグループ（例: group-column-wrapper）を返すべき。長期では findContainerAt の
    // 責務強化（面積・depth・中央領域の優先）でここを「containerNode の子孫のみ」に戻す想定。
    const MAX_DESCENDANT_DEPTH = 4; // 暫定: 深さ制限（将来レイアウトに合わせて定数化 or 設定化）
    const EDGE_INSET_PX = 4;

    const findDescendantGroupContainers = (parentNode: LayoutNode, mx: number, my: number): LayoutNode[] => {
      const result: LayoutNode[] = [];
      const queue: { node: LayoutNode; depth: number }[] = [{ node: parentNode, depth: 0 }];

      while (queue.length > 0) {
        const { node, depth } = queue.shift()!;
        if (depth >= MAX_DESCENDANT_DEPTH) continue;

        for (const childId of node.children) {
          const childNode = this.layoutTree?.findById(childId);
          if (!childNode) continue;
          if (draggedDescendantIds.has(childNode.elementId)) continue;
          if (!childNode.isContainer) continue;

          const effectiveBounds = this.layoutTree?.getEffectiveBounds(childNode.elementId) ?? childNode.bounds;
          const right = effectiveBounds.left + effectiveBounds.width;
          const bottom = effectiveBounds.top + effectiveBounds.height;
          const isInsideBounds = (
            mx >= effectiveBounds.left + EDGE_INSET_PX &&
            mx <= right - EDGE_INSET_PX &&
            my >= effectiveBounds.top + EDGE_INSET_PX &&
            my <= bottom - EDGE_INSET_PX
          );

          const isGroupContainer =
            childNode.layoutType === 'flex-row' ||
            childNode.layoutType === 'flex-column' ||
            childNode.layoutType === 'grid';

          if (isInsideBounds && isGroupContainer) {
            result.push(childNode);
          }
          queue.push({ node: childNode, depth: depth + 1 });
        }
      }
      return result;
    };

    // 子孫コンテナを探索して slot を生成（maxDepth まで、マウスがコンテナ内にあるグループのみ）
    // ⚠️ 暫定: containerNode の子孫に加え「ルートの子孫」も探索（兄弟の子を拾う）。Cursor 的には探索範囲が広いため、
    // findContainerAt を正したあとは「containerNode の子孫のみ」に縮めることを推奨。
    let rootNode: LayoutNode | null = containerNode;
    while (rootNode?.parentId) {
      rootNode = this.layoutTree?.findById(rootNode.parentId) ?? null;
    }
    const fromContainer = findDescendantGroupContainers(containerNode, mouseX, mouseY);
    const fromRoot = rootNode && rootNode !== containerNode
      ? findDescendantGroupContainers(rootNode, mouseX, mouseY)
      : [];
    const seenIds = new Set<string>(fromContainer.map(n => n.elementId));
    const descendantContainers: LayoutNode[] = [...fromContainer];
    for (const n of fromRoot) {
      if (!seenIds.has(n.elementId)) {
        seenIds.add(n.elementId);
        descendantContainers.push(n);
      }
    }
    if (descendantContainers.length > 0) {
      console.log('[DropResolver] 🔍 DND_FIX: descendant group containers found', {
        containerNodeId: containerNode.elementId,
        rootNodeId: rootNode?.elementId ?? null,
        fromContainerLen: fromContainer.length,
        fromRootLen: fromRoot.length,
        descendantIds: descendantContainers.map(n => n.elementId),
      });
    }
    for (const descContainer of descendantContainers) {
      const effectiveId = this.layoutTree?.getEffectiveChildrenParentId(descContainer.elementId) ?? descContainer.elementId;
      const effectiveLayoutType = this.layoutTree?.getEffectiveLayoutType(effectiveId);
      const effectiveBounds = this.layoutTree?.getEffectiveBounds(effectiveId) ?? descContainer.bounds;

      const descSlot = this.resolveSlotByLayoutType(descContainer, draggedNode, mouseX, mouseY, effectiveLayoutType, effectiveBounds, effectiveId);
      const isInsideOrBetween = descSlot && (descSlot.kind === 'inside' || descSlot.kind === 'between' || descSlot.kind === 'before' || descSlot.kind === 'after');
      if (isInsideOrBetween && descSlot) {
        const actualLayoutType = effectiveLayoutType ?? descContainer.layoutType;
        const isRow = actualLayoutType === 'flex-row';
        this.ensureRenderGuideRect(descSlot, effectiveBounds, isRow);

        const descDepth = 0;

        candidateSlots.push({
          slot: descSlot,
          depth: descDepth,
          containerId: descContainer.elementId,
          layoutType: actualLayoutType,
        });

        console.log('[DropResolver] 🔍 FIX2-OPTIMIZED: immediate descendant slot generated', {
          descendantContainerId: descContainer.elementId,
          parentContainerId: containerNode.elementId,
          slotKind: descSlot.kind,
          confidence: descSlot.confidence,
          depth: descDepth,
          layoutType: actualLayoutType,
          mouseX,
          mouseY,
        });
      }
    }

    while (current && depth < MAX_ANCESTOR_DEPTH) {
      // ✅ PHASE0_S2: Dragged Subtree Exclusion - ドラッグ中のノードの子孫を除外
      if (draggedDescendantIds.has(current.elementId)) {
        // ✅ 親コンテナを探索（draggedNode の子孫の場合はスキップして親へ）
        if (!current.parentId) {
          break; // root に到達
        }
        const parent = this.layoutTree.findById(current.parentId);
        if (!parent || !parent.isContainer) {
          break; // 親がコンテナでない場合は終了
        }
        current = parent;
        depth++;
        continue;
      }

      // ✅ フェーズ9: leafノードの場合は親コンテナのbetween slotを生成
      if (!current.isContainer) {
        // ✅ leafノードの親コンテナを探す
        let parent: LayoutNode | null = null;
        let parentNode: LayoutNode | null = current;
        while (parentNode && parentNode.parentId) {
          parentNode = this.layoutTree.findById(parentNode.parentId);
          if (parentNode && parentNode.isContainer && !draggedDescendantIds.has(parentNode.elementId)) {
            parent = parentNode;
            break;
          }
        }

        if (parent) {
          // ✅ 親コンテナのbetween slotを生成
          const effectiveId = this.layoutTree.getEffectiveChildrenParentId(parent.elementId) ?? parent.elementId;
          const effectiveLayoutType = this.layoutTree.getEffectiveLayoutType(effectiveId);
          const effectiveBounds = this.layoutTree.getEffectiveBounds(effectiveId) ?? parent.bounds;

          // ✅ leafノードの位置に基づいて親コンテナのbetween slotを生成
          const leafSlot = this.resolveSlotByLayoutType(parent, draggedNode, mouseX, mouseY, effectiveLayoutType, effectiveBounds, effectiveId);
          if (leafSlot) {
            // ✅ FIX: candidateSlots.push直前で必ずrenderGuideRectを保証
            const actualLayoutType = effectiveLayoutType ?? parent.layoutType;
            const isRow = actualLayoutType === 'flex-row';
            this.ensureRenderGuideRect(leafSlot, effectiveBounds ?? parent.bounds, isRow);

            // ✅ leafノードの親コンテナのbetween slotを候補に追加
            candidateSlots.push({
              slot: leafSlot,
              depth: depth,
              containerId: parent.elementId,
              layoutType: actualLayoutType,
            });

            console.log('[DropResolver] 🔍 PHASE9: leaf node parent between slot generated', {
              leafNodeId: current.elementId,
              parentContainerId: parent.elementId,
              parentLayoutType: actualLayoutType,
              slotKind: leafSlot.kind,
              slotAxis: leafSlot.axis,
              mouseX,
              mouseY,
            });
          }
        }

        // ✅ leafノードの場合は親に進む（ancestor walkを継続）
        if (!current.parentId) {
          break; // root に到達
        }
        const nextParent = this.layoutTree.findById(current.parentId);
        if (!nextParent || !nextParent.isContainer) {
          break; // 親がコンテナでない場合は終了
        }
        current = nextParent;
        depth++;
        continue;
      }

      // ✅ フェーズ9: leafノードの場合は親コンテナのbetween slotを生成
      if (!current.isContainer) {
        // ✅ leafノードの親コンテナを探す
        let parent: LayoutNode | null = null;
        let parentNode: LayoutNode | null = current;
        while (parentNode && parentNode.parentId) {
          parentNode = this.layoutTree.findById(parentNode.parentId);
          if (parentNode && parentNode.isContainer && !draggedDescendantIds.has(parentNode.elementId)) {
            parent = parentNode;
            break;
          }
        }

        if (parent) {
          // ✅ 親コンテナのbetween slotを生成
          const fixed = this.getFixedEffectiveBounds(parent.elementId);
          let effectiveId: string;
          let effectiveLayoutType: LayoutNode['layoutType'] | undefined;
          let effectiveBounds: LayoutNode['bounds'] | null;

          if (fixed) {
            effectiveId = fixed.effectiveId;
            effectiveLayoutType = this.layoutTree.getEffectiveLayoutType(effectiveId);
            effectiveBounds = fixed.effectiveBounds;
          } else {
            effectiveId = this.layoutTree.getEffectiveChildrenParentId(parent.elementId) ?? parent.elementId;
            effectiveLayoutType = this.layoutTree.getEffectiveLayoutType(effectiveId);
            effectiveBounds = this.layoutTree.getEffectiveBounds(effectiveId);
          }

          // ✅ leafノードの位置に基づいて親コンテナのbetween slotを生成
          const leafSlot = this.resolveSlotByLayoutType(parent, draggedNode, mouseX, mouseY, effectiveLayoutType, effectiveBounds, effectiveId);
          if (leafSlot) {
            // ✅ FIX: candidateSlots.push直前で必ずrenderGuideRectを保証
            const actualLayoutType = effectiveLayoutType ?? parent.layoutType;
            const isRow = actualLayoutType === 'flex-row';
            this.ensureRenderGuideRect(leafSlot, effectiveBounds ?? parent.bounds, isRow);

            // ✅ leafノードの親コンテナのbetween slotを候補に追加
            candidateSlots.push({
              slot: leafSlot,
              depth: depth,
              containerId: parent.elementId,
              layoutType: actualLayoutType,
            });

            console.log('[DropResolver] 🔍 PHASE9: leaf node parent between slot generated', {
              leafNodeId: current.elementId,
              parentContainerId: parent.elementId,
              parentLayoutType: actualLayoutType,
              slotKind: leafSlot.kind,
              slotAxis: leafSlot.axis,
              mouseX,
              mouseY,
            });
          }
        }

        // ✅ leafノードの場合は親に進む（ancestor walkを継続）
        if (!current.parentId) {
          break; // root に到達
        }
        const nextParent = this.layoutTree.findById(current.parentId);
        if (!nextParent || !nextParent.isContainer) {
          break; // 親がコンテナでない場合は終了
        }
        current = nextParent;
        depth++;
        continue;
      }

      // ✅ CRITICAL FIX: wrapper（flex-row/flex-column/grid）が正式なDnDコンテナとして認識されるため、normalizeは不要
      // LayoutTree.buildNodeTreeで、wrapperは既にisContainer=true、childrenParentId=elementIdとして設定されている
      // そのため、currentが既に正しいDnDコンテナ（wrapperまたはblock親）である
      const containerNode = current;

      // ✅ GUIDE_GLITCH_FIX STEP D: dragセッション中は固定されたeffectiveBoundsを使用
      let effectiveId: string;
      let effectiveLayoutType: LayoutNode['layoutType'] | undefined;
      let effectiveBounds: LayoutNode['bounds'] | null;

      const fixed = this.getFixedEffectiveBounds(containerNode.elementId);
      if (fixed) {
        // ✅ dragセッション中は固定された値を使用
        effectiveId = fixed.effectiveId;
        effectiveLayoutType = this.layoutTree.getEffectiveLayoutType(effectiveId);
        effectiveBounds = fixed.effectiveBounds;
      } else {
        // ✅ dragセッション外または固定されていない場合は通常通り取得
        // ✅ CRITICAL FIX: effectiveId を決定（wrapper pattern 対応）
        // childrenParentId が設定されている場合（wrapper）、そのIDを使用
        // 設定されていない場合（block親）、containerNode.elementId を使用
        effectiveId = this.layoutTree.getEffectiveChildrenParentId(containerNode.elementId) ?? containerNode.elementId;

        // ✅ CRITICAL FIX: effectiveId 基準で effectiveLayoutType と effectiveBounds を取得
        // wrapperの場合は自分自身、block親の場合は自分自身を返す
        effectiveLayoutType = this.layoutTree.getEffectiveLayoutType(effectiveId);
        effectiveBounds = this.layoutTree.getEffectiveBounds(effectiveId);
      }

      // ✅ CRITICAL FIX: デバッグログ（常に出力）
      console.log('[DropResolver] 🔍 CRITICAL_FIX: container detection', {
        containerId: containerNode.elementId,
        containerLayoutType: containerNode.layoutType,
        effectiveId,
        effectiveLayoutType,
        hasEffectiveBounds: effectiveBounds !== null,
        mouseX,
        mouseY,
      });

      // ✅ CRITICAL FIX: レイアウトタイプに応じてスロットを解決
      // effectiveId を resolveSlotByLayoutType に渡すことで、RowとColumnの両方で正しく動作する
      const slot = this.resolveSlotByLayoutType(containerNode, draggedNode, mouseX, mouseY, effectiveLayoutType, effectiveBounds, effectiveId);
      if (slot) {
        // ✅ BLOCK_AND_PARENT: depthPenaltyを条件付きで緩和（Cursor同等）
        // block between slotの場合のみ、depthPenaltyを軽くする
        const actualLayoutType = effectiveLayoutType ?? containerNode.layoutType;
        const isBlockBetween = actualLayoutType === 'block' && slot.kind === 'between';
        const isDeepAncestor = depth >= 2; // ✅ PHASE2.5: depth >= 2のancestor

        // ✅ PHASE2.5: depth >= 2のancestorに対してはより強い減衰を適用
        let depthPenalty: number;
        if (isDeepAncestor && isBlockBetween) {
          // ✅ depth >= 2のancestor block betweenは通常の2倍の減衰率
          depthPenalty = depth * DEPTH_PENALTY.deepAncestor;
        } else if (isBlockBetween) {
          // ✅ block betweenは半分の減衰率（親レイヤでも選ばれやすくする）
          depthPenalty = depth * DEPTH_PENALTY.blockBetween;
        } else if (isDeepAncestor) {
          // ✅ depth >= 2のancestor（block以外）は通常の2倍の減衰率
          depthPenalty = depth * DEPTH_PENALTY.deepAncestor;
        } else {
          // ✅ 通常の減衰率
          depthPenalty = depth * DEPTH_PENALTY.default;
        }

        // ✅ PHASE2.5 + PHASE3: viewport外の候補に対してconfidenceを減衰
        let viewportPenalty = 0;
        if (effectiveBounds) {
          // ✅ PHASE3: スクロールコンテナのviewportを優先的にチェック
          const scrollViewportPenalty = this.getScrollViewportPenalty(effectiveBounds, containerNode.elementId);
          if (scrollViewportPenalty > 0) {
            viewportPenalty = scrollViewportPenalty;
          } else if (!this.isInViewport(effectiveBounds)) {
            // ✅ スクロールコンテナがない場合は、通常のviewport判定
            viewportPenalty = ANCESTOR_CANDIDATE_CONFIG.viewportOutPenalty;
          }
        }

        // ✅ 最小confidence を上げる: 0.1 → 0.2（深い階層でも選ばれやすくする）
        slot.confidence = Math.max(0.2, slot.confidence - depthPenalty - viewportPenalty);

        // ✅ FIX: candidateSlots.push直前で必ずrenderGuideRectを保証
        const isRow = actualLayoutType === 'flex-row';
        this.ensureRenderGuideRect(slot, effectiveBounds ?? containerNode.bounds, isRow);

        candidateSlots.push({
          slot,
          depth,
          containerId: containerNode.elementId,
          layoutType: actualLayoutType // ✅ layoutTypeを追加（親fallbackロジック用）
        });

        // ✅ BLOCK_AND_PARENT + PHASE2.5 + PHASE3: 親レイヤ候補の可視化ログ
        if (DEBUG_DND) {
          const scrollContainer = this.findScrollContainer(containerNode.elementId);
          const hasScrollContainer = scrollContainer !== null;
          const scrollViewportPenalty = effectiveBounds ? this.getScrollViewportPenalty(effectiveBounds, containerNode.elementId) : 0;
          console.log('[DropResolver] 🔍 PARENT_CANDIDATE_DEBUG: candidate slot found', {
            depth,
            isDeepAncestor,
            containerId: containerNode.elementId,
            effectiveId,
            effectiveLayoutType,
            slotKind: slot.kind,
            confidence: slot.confidence,
            depthPenalty,
            viewportPenalty,
            hasScrollContainer, // ✅ PHASE3: スクロールコンテナがあるかどうか
            scrollViewportPenalty, // ✅ PHASE3: スクロールコンテナのviewport penalty
            isInViewport: effectiveBounds ? this.isInViewport(effectiveBounds) : null,
            finalConfidence: slot.confidence
          });
        }
      } else {
        // ✅ BLOCK_AND_PARENT: slotがnullの場合もログ出力
        if (DEBUG_DND) {
          console.log('[DropResolver] 🔍 PARENT_CANDIDATE_DEBUG: slot is null', {
            depth,
            containerId: containerNode.elementId,
            effectiveId,
            effectiveLayoutType
          });
        }
      }

      // ✅ 親コンテナを探索（draggedNode 一致時も継続）
      if (!current.parentId) {
        break; // root に到達
      }
      const parent = this.layoutTree.findById(current.parentId);
      if (!parent || !parent.isContainer) {
        break; // 親がコンテナでない場合は終了
      }
      current = parent;
      depth++;
    }

    // ✅ FIX: 根本原因特定のためのログ - candidateSlots生成後
    console.log('[DEBUG] STEP1: candidateSlots generated', {
      candidateSlotsCount: candidateSlots.length,
      candidateSlots: candidateSlots.map(c => ({
        containerId: c.containerId,
        kind: c.slot.kind,
        hasRect: !!c.slot.renderGuideRect,
        depth: c.depth,
        layoutType: c.layoutType,
      })),
    });

    // ✅ 候補スロットから confidence が最も高いものを選択
    if (candidateSlots.length === 0) {
      console.warn('[DropResolver] ⚠️ FINAL_SLOT_SELECTION: no candidate slots found');
      return null;
    }

    // ✅ PHASE0_S3: Drop Scope（階層スコープ）を決めてから候補比較する
    // draggedNodeのparentIdを基準に、優先スコープを決める
    const scopeParentId = draggedNode.parentId;
    const draggedNodeIsGroup = draggedNode.layoutType === 'flex-row' || draggedNode.layoutType === 'flex-column' || draggedNode.layoutType === 'grid';

    // ✅ 優先スコープ: scopeParentId配下のbetween候補
    // ✅ PHASE12.9: group-in-group inside も scopeCandidates に含める
    const scopeCandidates = scopeParentId
      ? candidateSlots.filter(c => {
          // scopeParentId配下の候補を優先
          const candidateNode = this.layoutTree?.findById(c.containerId);
          if (!candidateNode) return false;

          // candidateNodeがscopeParentIdの子孫またはscopeParentId自身である
          const isInScope = candidateNode.elementId === scopeParentId ||
                           this.layoutTree?.isDescendantOf(candidateNode.elementId, scopeParentId) ||
                           false;

          // between候補を優先（group同士のDnDの場合）
          const isBetween = c.slot.kind === 'between';

          // ✅ PHASE12.9: group-in-group inside も scopeCandidates に含める
          const isGroupInGroupInside = draggedNodeIsGroup &&
                                       c.slot.kind === 'inside' &&
                                       c.slot.confidence >= 0.86;

          return isInScope && (isBetween || isGroupInGroupInside);
        })
      : [];

    // ✅ PHASE0_S4: Allowed Drop Policy（入れ子可否）で候補を削る
    // ✅ PHASE12.7: group -> group(in) を条件付きで許可（明確な意図がある場合のみ）
    // element -> group(in): 許可
    // element -> element(in): 許可しない（通常、要container）
    const filteredCandidates = candidateSlots.filter(c => {
      const candidateNode = this.layoutTree?.findById(c.containerId);
      if (!candidateNode) return false;

      // ✅ PHASE12.7: group -> group(in) は条件付きで許可（明確な意図がある場合のみ）
      // ✅ 明確な inside 意図がある場合のみ許可（Cursor/Figmaと同じ挙動）
      // 1. renderGuideRect が container 内部にある
      // 2. confidence が高い（>= 0.85）
      if (draggedNodeIsGroup && c.slot.kind === 'inside') {
        const candidateIsGroup = candidateNode.layoutType === 'flex-row' ||
                                 candidateNode.layoutType === 'flex-column' ||
                                 candidateNode.layoutType === 'grid';
        if (candidateIsGroup) {
          // ✅ 明確な inside 意図がある場合のみ許可
          const isClearlyInside =
            !!c.slot.renderGuideRect &&
            c.slot.confidence >= 0.85; // ← ここ重要：高いconfidenceが必要

          if (!isClearlyInside) {
            return false; // 明確な意図がない場合は禁止（betweenにフォールバック）
          }
          // ✅ 明確な意図がある場合は許可（inside slotが有効になる）
        }
      }

      // ✅ element -> element(in) は禁止（containerが必要）
      if (!draggedNodeIsGroup && c.slot.kind === 'inside') {
        const candidateIsElement = candidateNode.layoutType !== 'flex-row' &&
                                   candidateNode.layoutType !== 'flex-column' &&
                                   candidateNode.layoutType !== 'grid';
        if (candidateIsElement && !candidateNode.isContainer) {
          return false; // element-in-elementは禁止（containerが必要）
        }
      }

      return true;
    });

    // ✅ FIX: 根本原因特定のためのログ - filteredCandidates生成後
    // ✅ PHASE12.7: group-in-group inside slotの確認ログ
    const groupInGroupInsideSlots = filteredCandidates.filter(c =>
      draggedNodeIsGroup && c.slot.kind === 'inside'
    );
    console.log('[DEBUG] STEP2: filteredCandidates generated', {
      filteredCandidatesCount: filteredCandidates.length,
      filteredCandidates: filteredCandidates.map(c => ({
        containerId: c.containerId,
        kind: c.slot.kind,
        hasRect: !!c.slot.renderGuideRect,
        confidence: c.slot.confidence,
        depth: c.depth,
        layoutType: c.layoutType,
      })),
      scopeCandidatesCount: scopeCandidates.length,
      groupInGroupInsideCount: groupInGroupInsideSlots.length,
      groupInGroupInsideSlots: groupInGroupInsideSlots.map(c => ({
        containerId: c.containerId,
        confidence: c.slot.confidence,
        hasRect: !!c.slot.renderGuideRect,
      })),
    });

    // ✅ PHASE0_S3: スコープ候補を優先的に使用（なければフィルタ済み候補を使用）
    // ✅ FIX1-OPTIMIZED: scopeCandidates と filteredCandidates をマージ（重複除去、between優先）
    // scopeCandidates を優先しつつ、between slot を最優先、inside slot は条件付きで追加
    const mergedCandidates: typeof candidateSlots = [];
    const seenKeys = new Set<string>();

    // 1. scopeCandidates の between を先に追加（最優先）
    for (const candidate of scopeCandidates) {
      if (candidate.slot.kind === 'between') {
        const key = `${candidate.containerId}:${candidate.slot.kind}:${(candidate.slot as any).insertionIndex ?? 'undefined'}`;
        if (!seenKeys.has(key)) {
          mergedCandidates.push(candidate);
          seenKeys.add(key);
        }
      }
    }

    // 2. scopeCandidates の inside を追加（confidence が高い場合のみ）
    for (const candidate of scopeCandidates) {
      if (candidate.slot.kind === 'inside' && candidate.slot.confidence >= 0.86) {
        const key = `${candidate.containerId}:${candidate.slot.kind}`;
        if (!seenKeys.has(key)) {
          mergedCandidates.push(candidate);
          seenKeys.add(key);
        }
      }
    }

    // 3. filteredCandidates の between を追加（scopeCandidates に含まれていない場合）
    for (const candidate of filteredCandidates) {
      if (candidate.slot.kind === 'between') {
        const key = `${candidate.containerId}:${candidate.slot.kind}:${(candidate.slot as any).insertionIndex ?? 'undefined'}`;
        if (!seenKeys.has(key)) {
          mergedCandidates.push(candidate);
          seenKeys.add(key);
        }
      }
    }

    // 4. filteredCandidates の inside を追加
    // ✅ DND_FIX_ELEMENT_TO_GROUP: 通常要素→グループ内の inside も候補に含める（hasBetween 時もグループコンテナの inside は追加）
    const hasBetween = mergedCandidates.some(c => c.slot.kind === 'between');
    for (const candidate of filteredCandidates) {
      if (candidate.slot.kind === 'inside') {
        const key = `${candidate.containerId}:${candidate.slot.kind}`;
        const candidateNode = this.layoutTree?.findById(candidate.containerId);
        const isGroupContainer = candidateNode && (
          candidateNode.layoutType === 'flex-row' ||
          candidateNode.layoutType === 'flex-column' ||
          candidateNode.layoutType === 'grid'
        );
        const allowInside = !seenKeys.has(key) && (!hasBetween || !!isGroupContainer);
        if (allowInside) {
          mergedCandidates.push(candidate);
          seenKeys.add(key);
        }
      }
    }

    // 5. その他の候補を追加（scopeCandidates が空の場合）
    if (scopeCandidates.length === 0) {
      for (const candidate of filteredCandidates) {
        const key = `${candidate.containerId}:${candidate.slot.kind}:${(candidate.slot as any).insertionIndex ?? 'undefined'}`;
        if (!seenKeys.has(key)) {
          mergedCandidates.push(candidate);
          seenKeys.add(key);
        }
      }
    }

    const finalCandidates = mergedCandidates.length > 0 ? mergedCandidates : filteredCandidates;

    console.log('[DEBUG] FIX1-OPTIMIZED: finalCandidates merge result', {
      scopeCandidatesCount: scopeCandidates.length,
      filteredCandidatesCount: filteredCandidates.length,
      mergedCandidatesCount: mergedCandidates.length,
      hasBetween,
      betweenCount: mergedCandidates.filter(c => c.slot.kind === 'between').length,
      insideCount: mergedCandidates.filter(c => c.slot.kind === 'inside').length,
    });

    // ✅ FIX: 根本原因特定のためのログ - finalCandidates生成後
    console.log('[DEBUG] STEP3: finalCandidates generated', {
      finalCandidatesCount: finalCandidates.length,
      finalCandidates: finalCandidates.map(c => ({
        containerId: c.containerId,
        kind: c.slot.kind,
        hasRect: !!c.slot.renderGuideRect,
        depth: c.depth,
        layoutType: c.layoutType,
      })),
    });

    // ✅ フェーズ11: absoluteスロットを最終フォールバックに降格
    // absoluteスロットは「他に候補が一切ない場合のみ」残す
    // これにより、内部ガイド（between/inside）が正しく表示される
    const hasNonAbsoluteCandidate = finalCandidates.some(
      c => c.slot.kind !== 'absolute'
    );

    // ✅ FIX: 根本原因特定のためのログ - absolute除外前
    console.log('[DEBUG] STEP4: before absolute exclusion', {
      hasNonAbsoluteCandidate,
      finalCandidatesCount: finalCandidates.length,
      absoluteCount: finalCandidates.filter(c => c.slot.kind === 'absolute').length,
    });

    // 他の候補がある場合は、absoluteを除外
    let filteredFinalCandidates = finalCandidates;
    if (hasNonAbsoluteCandidate) {
      filteredFinalCandidates = finalCandidates.filter(
        c => c.slot.kind !== 'absolute'
      );
      console.log('[DropResolver] 🔍 PHASE11: absolute slot excluded', {
        originalCount: finalCandidates.length,
        filteredCount: filteredFinalCandidates.length,
        excludedAbsolute: finalCandidates.filter(c => c.slot.kind === 'absolute').map(c => ({
          containerId: c.containerId,
          confidence: c.slot.confidence,
        })),
      });
    }

    // ✅ FIX: 根本原因特定のためのログ - filteredFinalCandidates生成後
    console.log('[DEBUG] STEP5: filteredFinalCandidates generated', {
      filteredFinalCandidatesCount: filteredFinalCandidates.length,
      filteredFinalCandidates: filteredFinalCandidates.map(c => ({
        containerId: c.containerId,
        kind: c.slot.kind,
        hasRect: !!c.slot.renderGuideRect,
        depth: c.depth,
        layoutType: c.layoutType,
      })),
    });

    // ✅ PHASE4: 方向ヒステリシス用のヘルパー関数（PHASE5、フェーズ8でも使用）
    // ✅ フェーズ8: ソートでも使用するため、先に定義
    const getAxis = (slot: Slot, layoutType: LayoutNode['layoutType']): 'row' | 'column' | null => {
      if (slot.axis === 'row' || slot.axis === 'column') {
        return slot.axis;
      }
      if (slot.kind === 'between') {
        if (layoutType === 'flex-row') return 'row';
        if (layoutType === 'flex-column' || layoutType === 'block') return 'column';
      }
      return null;
    };

    // ✅ フェーズ9: score加算方式に一本化（if/elseで勝敗を決めない）
    // ✅ フェーズ10: score計算の内訳を記録（検証・デバッグ用）
    // ✅ フェーズ11: absoluteスロットのscoreを大幅に下げる（最終フォールバックとして扱う）
    // 各候補にscoreを計算し、scoreでソートする
    const calculateScore = (candidate: typeof filteredFinalCandidates[0], allCandidates: typeof filteredFinalCandidates): { score: number; breakdown: { base: number; fallbackPenalty: number; axisBonus: number; depthPenalty: number; relationBonus: number; relationPenalty: number; absolutePenalty: number } } => {
      let score = candidate.slot.confidence;
      const breakdown = {
        base: candidate.slot.confidence,
        fallbackPenalty: 0,
        axisBonus: 0,
        depthPenalty: 0,
        relationBonus: 0,
        relationPenalty: 0,
        absolutePenalty: 0,
      };

      // ✅ フェーズ11: absoluteスロットは大幅に減点（最終フォールバックとして扱う）
      if (candidate.slot.kind === 'absolute') {
        const penalty = 1.0; // absoluteは1.0減点（ほぼ確実に負ける）
        score -= penalty;
        breakdown.absolutePenalty = -penalty;
      }

      // ✅ フェーズ6: fallbackは減点（非fallbackを優先）
      if (candidate.slot.isFallback) {
        const penalty = 0.3; // fallbackは0.3減点
        score -= penalty;
        breakdown.fallbackPenalty = -penalty;
      }

      // ✅ フェーズ9: axis一致はボーナス（絶対条件ではない）
      const candidateAxis = getAxis(candidate.slot, candidate.layoutType);
      const dragAxis = dragIntent ?? candidateAxis;
      if (dragAxis && candidateAxis === dragAxis) {
        const bonus = 0.1; // axis一致は0.1ボーナス
        score += bonus;
        breakdown.axisBonus = bonus;
      }

      // ✅ フェーズ9: 内側優先（depthが浅い = 子に近い = 内側）
      // depthが浅いほどscoreが高い（内側優先）
      const depthPenalty = candidate.depth * 0.05; // depthが1増えるごとに0.05減点
      score -= depthPenalty;
      breakdown.depthPenalty = -depthPenalty;

      // ✅ フェーズ8: column/row配下での優先順位調整（子groupにボーナス、親に減点）
      const isColumnParent = candidate.layoutType === 'flex-column' || candidate.layoutType === 'block';
      const isRowParent = candidate.layoutType === 'flex-row';

      // 他の候補との親子関係を確認
      for (const other of allCandidates) {
        if (other.containerId === candidate.containerId) continue;

        const otherIsColumnParent = other.layoutType === 'flex-column' || other.layoutType === 'block';
        const otherIsRowParent = other.layoutType === 'flex-row';

        // ✅ 一方がcolumn/row親、もう一方がその子groupの場合
        if ((isColumnParent || isRowParent) && !otherIsColumnParent && !otherIsRowParent) {
          // candidateが親、otherが子groupの場合
          if (this.layoutTree?.isDescendantOf(other.containerId, candidate.containerId)) {
            // otherがcandidateの子孫 → candidateに減点（子groupを優先）
            const penalty = 0.15;
            score -= penalty;
            breakdown.relationPenalty -= penalty;
          }
        }
        if ((otherIsColumnParent || otherIsRowParent) && !isColumnParent && !isRowParent) {
          // otherが親、candidateが子groupの場合
          if (this.layoutTree?.isDescendantOf(candidate.containerId, other.containerId)) {
            // candidateがotherの子孫 → candidateにボーナス（子groupを優先）
            const bonus = 0.15;
            score += bonus;
            breakdown.relationBonus += bonus;
          }
        }
      }

      return { score, breakdown };
    };

    // ✅ 各候補にscoreを計算
    // ✅ フェーズ10: score計算の内訳を記録（検証・デバッグ用）
    // ✅ フェーズ11: filteredFinalCandidatesを使用（absolute除外後）
    filteredFinalCandidates.forEach(c => {
      const scoreResult = calculateScore(c, filteredFinalCandidates);
      (c as any).score = scoreResult.score;
      (c as any).scoreBreakdown = scoreResult.breakdown;
    });

    // ✅ GUIDE_GLITCH_FIX STEP C: ソートの安定化（tie-breakerの追加）
    // ✅ フェーズ6: fallbackを別カテゴリとして扱う（非fallbackを常に優先）
    // ✅ フェーズ9: score加算方式に一本化（if/elseで勝敗を決めない）
    // ✅ フェーズ11: filteredFinalCandidatesを使用（absolute除外後）
    // 同点の場合でも順序が揺れないように決定論的なソートを実装
    filteredFinalCandidates.sort((a, b) => {
      // 1. ✅ フェーズ6: 非fallbackを常に優先（fallbackは「負け枠」だが、slot=nullよりは勝つ）
      const aIsFallback = a.slot.isFallback ?? false;
      const bIsFallback = b.slot.isFallback ?? false;
      if (aIsFallback !== bIsFallback) {
        return aIsFallback ? 1 : -1; // 非fallbackを優先（-1を返す）
      }

      // 2. ✅ フェーズ9: scoreで比較（高い順）
      const aScore = (a as any).score ?? a.slot.confidence;
      const bScore = (b as any).score ?? b.slot.confidence;
      if (bScore !== aScore) {
        return bScore - aScore; // scoreが高い順
      }

      // 3. ✅ フェーズ8: 内側優先（depthが浅い = 子に近い = 内側）
      // ✅ フェーズ9: scoreに既に含まれているが、tie-breakerとして使用
      if (a.depth !== b.depth) {
        return a.depth - b.depth; // 浅い優先 = 子に近い優先 = 内側優先
      }

      // 4. kind（betweenを優先）
      if (a.slot.kind !== b.slot.kind) {
        if (a.slot.kind === 'between' && b.slot.kind !== 'between') return -1;
        if (b.slot.kind === 'between' && a.slot.kind !== 'between') return 1;
      }

      // 7. insertionIndex（小さい順）
      const aIndex = a.slot.insertionIndex ?? Infinity;
      const bIndex = b.slot.insertionIndex ?? Infinity;
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }

      // 8. containerId（文字列比較、最後の保険）
      return a.containerId.localeCompare(b.containerId);
    });

    // ✅ PHASE1: 水平候補（兄弟/cousin横断DnD）の検出
    // 同一depth帯のblockを「水平候補」として扱う
    // 最初は完全一致（depth === initialDepth）で始める
    // 将来的に Math.abs(c.depth - initialDepth) <= HORIZONTAL_CANDIDATE_CONFIG.depthTolerance に拡張可能
    // ✅ フェーズ11: filteredFinalCandidatesを使用（absolute除外後）
    const horizontalCandidates = filteredFinalCandidates.filter(c => {
      const depthDiff = Math.abs(c.depth - initialDepth);
      return depthDiff <= HORIZONTAL_CANDIDATE_CONFIG.depthTolerance &&
             c.layoutType === 'block';
    });

    // ✅ PHASE1: 水平候補にconfidenceボーナスを追加（兄弟/cousin間のDnDを優先）
    horizontalCandidates.forEach(c => {
      c.slot.confidence = Math.min(1.0, c.slot.confidence + HORIZONTAL_CANDIDATE_CONFIG.horizontalBonus);
    });

    // ✅ PHASE12.6: root-like candidate exclusion (修正版)
    // root相当（parentId === null または rootの直接の子）は innerCandidates に混ぜない
    // ✅ FIX: parentId === '__preview_root__' または 'dom:__preview_root__' もroot相当として扱う
    // これで dom:placeholder-root（parentId === 'dom:__preview_root__'）が除外される
    const isRootLikeContainerId = (containerId: string): boolean => {
      // 1. 明示的なroot ID
      if (containerId === '__preview_root__' || containerId === 'dom:__preview_root__') return true;

      // 2. LayoutTreeからノードを取得
      const node = this.layoutTree?.findById(containerId);
      if (!node) return false;

      // 3. parentId === null（真のroot）
      if (node.parentId === null) return true;

      // 4. ✅ FIX: parentId === '__preview_root__' または 'dom:__preview_root__'（rootの直接の子）
      // これで dom:placeholder-root が除外される
      if (node.parentId === '__preview_root__' || node.parentId === 'dom:__preview_root__') return true;

      return false;
    };

    // ✅ フェーズ12: スコープ分離 - 内側候補を先に評価（absolute/rootを評価フェーズに参加させない）
    // ✅ フェーズ12.5: 描画可能候補のみでスコープ分離（renderGuideRectが存在する候補のみ）
    // ✅ PHASE12.6: root相当を除外（ID固定ではなくLayoutTree上のroot判定で一般化）
    // ✅ FIX: 一旦renderGuideRectフィルタを外して検証用にする（原因切り分けのため）
    // Cursor/Figmaのモデル: 内側候補が1つでもあれば、そこで確定してreturn
    // absolute/rootは「何も無い時の保険」として、最後の最後だけ見る
    // 重要: slotの存在ではなく「描画できるslot」だけを評価する
    const innerCandidates = filteredFinalCandidates.filter(c =>
      !isRootLikeContainerId(c.containerId) &&
      c.slot.kind !== 'absolute'
      // ✅ FIX: 一旦renderGuideRectフィルタを外す（検証用）
      // !!c.slot.renderGuideRect // ✅ フェーズ12.5: 描画可能な候補のみ
    );

    // ✅ PHASE12.6: デバッグログ（再発防止の可視化）
    console.log('[DropResolver] 🔍 PHASE12.6: innerCandidates(root-like excluded)', {
      innerCount: innerCandidates.length,
      innerIds: innerCandidates.map(c => c.containerId),
      excludedRootLikes: filteredFinalCandidates
        .filter(c => isRootLikeContainerId(c.containerId))
        .map(c => c.containerId),
    });

    // ✅ FIX: シンプルな確認ログ（1行で全体像を把握）
    console.log('🔍 [DnD] 候補状況:', {
      '候補数': candidateSlots.length,
      '最終候補数': filteredFinalCandidates.length,
      '内側候補数': innerCandidates.length,
      '内側候補': innerCandidates.map(c => `${c.containerId}(${c.slot.kind})`).join(', ') || 'なし',
      '最終候補': filteredFinalCandidates.map(c => `${c.containerId}(${c.slot.kind})`).join(', ') || 'なし',
    });

    // ✅ フェーズ12: 内側候補が1つでもあれば、そこで確定してreturn
    if (innerCandidates.length > 0) {
      console.log('[DropResolver] 🔍 PHASE12.5: drawable inner candidates found, evaluating inner scope only', {
        innerCount: innerCandidates.length,
        outerCount: filteredFinalCandidates.length - innerCandidates.length,
        innerCandidates: innerCandidates.map(c => ({
          containerId: c.containerId,
          kind: c.slot.kind,
          confidence: c.slot.confidence,
          layoutType: c.layoutType,
          hasRenderGuideRect: !!c.slot.renderGuideRect, // ✅ フェーズ12.5: 描画可能性を確認
        })),
      });

      // ✅ 内側候補のみで評価（外側候補は評価フェーズに参加させない）
      // ✅ BLOCK_AND_PARENT: 親fallbackロジック（Cursor同等）
      // 子slotが十分に良い時だけ子を選ぶ、それ以外は親(block)のbetweenを選ぶ
      // 1. 子slot（block以外）で、confidenceが閾値以上のものを探す
      const bestChild = innerCandidates.find(c => {
      if (c.layoutType === 'block') {
        return false; // blockは親として扱う
      }
      // ✅ レイアウト種別ごとの閾値を適用
      const threshold = CHILD_CONFIDENCE_THRESHOLD[c.layoutType] ?? CHILD_CONFIDENCE_THRESHOLD['flex-row'];
      return c.slot.confidence >= threshold;
    });

    // ✅ PHASE12.6: inner scope only - block fallback must be searched within innerCandidates
    // innerスコープ内のbestBlockBetween探索を innerCandidates に閉じる（outer混入経路の遮断）
    const innerHorizontalCandidates = innerCandidates.filter(c => {
      const depthDiff = Math.abs(c.depth - initialDepth);
      return depthDiff <= HORIZONTAL_CANDIDATE_CONFIG.depthTolerance &&
             c.layoutType === 'block';
    });
    innerHorizontalCandidates.forEach(c => {
      c.slot.confidence = Math.min(1.0, c.slot.confidence + HORIZONTAL_CANDIDATE_CONFIG.horizontalBonus);
    });

    // 2. 親blockのbetween slotを探す（水平候補を優先）
    // ✅ PHASE1: 水平候補（兄弟/cousin）を優先的に選ぶ
    // ✅ PHASE12.6: innerCandidates内でのみ検索（outer混入防止）
    const bestHorizontalBlockBetween = innerHorizontalCandidates.find(
      c => c.slot.kind === 'between'
    );
    // ✅ PHASE12.6: innerCandidates内でのみ検索（outer混入防止）
    const bestBlockBetween = bestHorizontalBlockBetween ?? innerCandidates.find(
      c => c.layoutType === 'block' && c.slot.kind === 'between'
    );

    // ✅ PHASE4: 方向ヒステリシス用のヘルパー関数（PHASE5でも使用）
    // ✅ フェーズ8: ソートでも使用するため、既に定義済み（上記参照）

    // ✅ GUIDE_GLITCH_FIX STEP B: 前フレームのselected slotと同じgapにいる場合は優先
    // ✅ PHASE12.6: innerCandidates内でのみ検索（outer混入防止）
    const lastSelected = this.getLastSelectedSlot();
    // ✅ PHASE12.6: innerスコープのselected初期値を innerCandidates に閉じる
    let selected = bestChild ?? bestBlockBetween ?? innerCandidates[0];
    let bestCandidate = selected.slot;

      if (lastSelected) {
        // gapKeyを生成（containerId + kind + insertionIndex + axis）
        // ✅ GUIDE_GLITCH_FIX: axisを含めて「見た目は同じgapだけど実体が違うslot」を区別
        const generateGapKey = (c: typeof innerCandidates[0]): string => {
          const axis = getAxis(c.slot, c.layoutType) ?? 'null';
          return `${c.containerId}:${c.slot.kind}:${c.slot.insertionIndex ?? 'undefined'}:${axis}`;
        };

        // 前フレームのselected slotと同じgapKeyを持つ候補を探す
        // ✅ フェーズ12: innerCandidatesを使用（内側候補のみ）
        const stickyCandidate = innerCandidates.find(c => {
        const gapKey = generateGapKey(c);
        return gapKey === lastSelected.gapKey;
      });

      if (stickyCandidate) {
        // ✅ 前フレームと同じgapにいる場合は、confidenceを上げて優先
        stickyCandidate.slot.confidence = Math.min(1.0, stickyCandidate.slot.confidence + 0.2);
        // ✅ ただし、confidenceが閾値を下回る場合は優先しない（明らかに別のgapに移動した場合）
        const threshold = stickyCandidate.layoutType === 'block' ? 0.5 :
                         (CHILD_CONFIDENCE_THRESHOLD[stickyCandidate.layoutType] ?? CHILD_CONFIDENCE_THRESHOLD['flex-row']) - 0.1;
        if (stickyCandidate.slot.confidence >= threshold) {
          selected = stickyCandidate;
          bestCandidate = selected.slot;
        }
      }
    }

    // ✅ PHASE5: 意図ロック - 意図に一致する候補を優先
    // ✅ PHASE12.6: innerCandidates内でのみ検索（outer混入防止）
    // dragIntentが指定されている場合、意図に一致する候補を優先的に選ぶ
    if (dragIntent !== null && dragIntent !== undefined) {
      const intentCandidates = innerCandidates.filter(c => {
        const cAxis = getAxis(c.slot, c.layoutType);
        return cAxis === dragIntent;
      });

      if (intentCandidates.length > 0) {
        // ✅ 意図に一致する候補を優先的に選ぶ（confidenceを上げる）
        intentCandidates.forEach(c => {
          c.slot.confidence = Math.min(1.0, c.slot.confidence + 0.15);
        });

        // ✅ 意図に一致する候補から最良のものを選ぶ
        const bestIntentChild = intentCandidates.find(c => {
          if (c.layoutType === 'block') {
            return false;
          }
          const threshold = CHILD_CONFIDENCE_THRESHOLD[c.layoutType] ?? CHILD_CONFIDENCE_THRESHOLD['flex-row'];
          return c.slot.confidence >= threshold;
        });

        const bestIntentBlockBetween = intentCandidates.find(
          c => c.layoutType === 'block' && c.slot.kind === 'between'
        );

          const intentSelected = bestIntentChild ?? bestIntentBlockBetween ?? intentCandidates[0];
          if (intentSelected) {
            selected = intentSelected;
            bestCandidate = selected.slot;
          }
        }
      }

      // ✅ PHASE4: 方向ヒステリシス - 方向を判定
      const currentAxis = getAxis(bestCandidate, selected.layoutType);

    // ✅ PHASE4: 方向が変わった場合の処理
    if (this.lastSlotAxis !== null && currentAxis !== null && this.lastSlotAxis !== currentAxis) {
      // ✅ 方向変更の開始位置を記録（初回のみ）
      if (this.axisChangeStartX === 0 && this.axisChangeStartY === 0) {
        this.axisChangeStartX = mouseX;
        this.axisChangeStartY = mouseY;
      }

      // ✅ 方向変更の距離を計算
      const axisChangeDistance = Math.sqrt(
        Math.pow(mouseX - this.axisChangeStartX, 2) +
        Math.pow(mouseY - this.axisChangeStartY, 2)
      );

      // ✅ 閾値を超えた場合のみ方向を切り替える
      if (axisChangeDistance >= AXIS_HYSTERESIS_CONFIG.axisChangeThreshold) {
        this.lastSlotAxis = currentAxis;
        this.axisChangeStartX = 0;
        this.axisChangeStartY = 0;
      } else {
        // ✅ 閾値を超えていない場合、前回のaxis候補を優先的に選ぶ
        // 前回のaxisに一致する候補を探す
        const lastAxisCandidates = candidateSlots.filter(c => {
          const cAxis = getAxis(c.slot, c.layoutType);
          return cAxis === this.lastSlotAxis;
        });

        if (lastAxisCandidates.length > 0) {
          // ✅ 前回のaxis候補を優先的に選ぶ（confidenceを上げる）
          lastAxisCandidates.forEach(c => {
            c.slot.confidence = Math.min(1.0, c.slot.confidence + 0.1);
          });

          // ✅ 前回のaxis候補から最良のものを選ぶ
          const bestLastAxisChild = lastAxisCandidates.find(c => {
            if (c.layoutType === 'block') {
              return false;
            }
            const threshold = CHILD_CONFIDENCE_THRESHOLD[c.layoutType] ?? CHILD_CONFIDENCE_THRESHOLD['flex-row'];
            return c.slot.confidence >= threshold;
          });

          const bestLastAxisBlockBetween = lastAxisCandidates.find(
            c => c.layoutType === 'block' && c.slot.kind === 'between'
          );

          const lastAxisSelected = bestLastAxisChild ?? bestLastAxisBlockBetween ?? lastAxisCandidates[0];
          if (lastAxisSelected) {
            selected = lastAxisSelected;
            bestCandidate = selected.slot;
          }
        }
      }
    } else {
      // ✅ 方向が変わっていない場合、状態をリセット
      this.axisChangeStartX = 0;
      this.axisChangeStartY = 0;
      if (currentAxis !== null) {
        this.lastSlotAxis = currentAxis;
      }
    }

    // ✅ PHASE0_S1: 診断用 - draggedNodeの情報を取得
    const draggedNodeDepth = this.layoutTree?.getDepth(draggedNode.elementId) ?? 0;
    const draggedNodePath = this.layoutTree?.getAncestorPath(draggedNode.elementId) ?? [];
    const draggedNodeParentId = draggedNode.parentId;
    const hoveredHitContainerId = containerNode.elementId;

    // ✅ BLOCK_AND_PARENT + PHASE1 + PHASE0_S1: 最終選択の可視化ログ（常に出力）
    console.log('[DropResolver] 🔍 FINAL_SLOT_SELECTION: final selection', {
      draggedId: draggedNode.elementId,
      draggedNodeDepth,
      draggedNodePath,
      draggedNodeParentId,
      hoveredHitContainerId,
      scopeParentId,
      draggedNodeIsGroup,
      totalCandidates: candidateSlots.length,
      filteredCandidatesCount: filteredCandidates.length,
      scopeCandidatesCount: scopeCandidates.length,
      finalCandidatesCount: finalCandidates.length,
      horizontalCandidatesCount: horizontalCandidates.length,
      initialDepth,
      selectedContainerId: selected.containerId,
      selectedDepth: selected.depth,
      selectedLayoutType: selected.layoutType,
      selectedSlotKind: bestCandidate.kind,
      selectedConfidence: bestCandidate.confidence,
      selectionReason: bestChild ? 'child_high_confidence' :
                       bestHorizontalBlockBetween ? 'horizontal_block_fallback' :
                       bestBlockBetween ? 'parent_block_fallback' :
                       'highest_confidence_fallback',
      // ✅ フェーズ12: innerCandidatesを使用（内側候補のみ）
      allCandidates: innerCandidates.map(c => {
        // ✅ PHASE1: 水平候補かどうかを判定（containerIdで比較）
        const isHorizontal = horizontalCandidates.some(h => h.containerId === c.containerId);
        const depthDiff = Math.abs(c.depth - initialDepth);
        const isDeepAncestor = c.depth >= 2; // ✅ PHASE2.5: depth >= 2のancestor

        // ✅ PHASE2.5 + PHASE3: viewport判定（effectiveBoundsが必要）
        const effectiveBounds = this.layoutTree?.getEffectiveBounds(c.containerId);
        const isInViewport = effectiveBounds ? this.isInViewport(effectiveBounds) : null;

        // ✅ PHASE3: スクロールコンテナの判定
        const scrollContainer = this.findScrollContainer(c.containerId);
        const hasScrollContainer = scrollContainer !== null;
        const scrollViewportPenalty = effectiveBounds ? this.getScrollViewportPenalty(effectiveBounds, c.containerId) : 0;

        // ✅ PHASE0_S1: 診断用 - 候補のancestry/subtree/scope情報
        const candidatePath = this.layoutTree?.getAncestorPath(c.containerId) ?? [];
        const candidateDepth = this.layoutTree?.getDepth(c.containerId) ?? 0;
        const isCandidateDescendantOfDragged = this.layoutTree?.isDescendantOf(c.containerId, draggedNode.elementId) ?? false;
        const candidateIsAncestorOfHoveredHit = this.layoutTree?.isDescendantOf(hoveredHitContainerId, c.containerId) ?? false;
        const candidateIsSameDepthBandAsDragged = Math.abs(candidateDepth - draggedNodeDepth) <= 1;

        return {
          containerId: c.containerId,
          layoutType: c.layoutType,
          depth: c.depth,
          depthDiff, // ✅ PHASE1: initialDepthからの距離
          isDeepAncestor, // ✅ PHASE2.5: depth >= 2のancestorかどうか
          slotKind: c.slot.kind,
          confidence: c.slot.confidence,
          isChild: c.layoutType !== 'block',
          isBlockBetween: c.layoutType === 'block' && c.slot.kind === 'between',
          isHorizontal, // ✅ PHASE1: 水平候補かどうか
          isInViewport, // ✅ PHASE2.5: viewport内かどうか
          hasScrollContainer, // ✅ PHASE3: スクロールコンテナがあるかどうか
          scrollViewportPenalty, // ✅ PHASE3: スクロールコンテナのviewport penalty
          meetsThreshold: c.layoutType !== 'block' &&
            (c.slot.confidence >= (CHILD_CONFIDENCE_THRESHOLD[c.layoutType] ?? CHILD_CONFIDENCE_THRESHOLD['flex-row'])),
          // ✅ PHASE0_S1: 診断用情報
          candidatePath,
          candidateDepth,
          isCandidateDescendantOfDragged,
          candidateIsAncestorOfHoveredHit,
          candidateIsSameDepthBandAsDragged
        };
      })
    });

      // ✅ GUIDE_GLITCH_FIX: 毎フレーム1行で選択されたslotの詳細を出力（「同じ場所でslotが入れ替わってるか」を即断できる）
      // ✅ フェーズ10: score計算の内訳を出力（検証・デバッグ用）
      const containerBounds = this.layoutTree?.getEffectiveBounds(selected.containerId) ??
                             this.layoutTree?.findById(selected.containerId)?.bounds;
      const selectionReason = bestChild ? 'child_high_confidence' :
                             bestHorizontalBlockBetween ? 'horizontal_block_fallback' :
                             bestBlockBetween ? 'parent_block_fallback' :
                             (bestCandidate.isFallback ?? false) ? 'nearest_gap_fallback' :
                             'highest_confidence_fallback';
      // ✅ GUIDE_GLITCH_FIX: axisを含めてgapKeyを生成
      const selectedAxis = getAxis(bestCandidate, selected.layoutType) ?? 'null';
      const gapKey = `${selected.containerId}:${bestCandidate.kind}:${(bestCandidate as any).insertionIndex ?? 'undefined'}:${selectedAxis}`;

      // ✅ フェーズ10: score計算の内訳を取得
      const selectedScoreBreakdown = (selected as any).scoreBreakdown ?? null;
      const selectedScore = (selected as any).score ?? bestCandidate.confidence;

      console.log('[DnD] SELECTED_SLOT_DETAIL', {
        containerId: selected.containerId,
        kind: bestCandidate.kind,
        axis: (bestCandidate as any).axis,
        insertionIndex: (bestCandidate as any).insertionIndex,
        layoutType: selected.layoutType,
        // ✅ フェーズ10: score計算の内訳を出力
        score: selectedScore,
        scoreBreakdown: selectedScoreBreakdown ? {
          base: selectedScoreBreakdown.base,
          fallbackPenalty: selectedScoreBreakdown.fallbackPenalty,
          axisBonus: selectedScoreBreakdown.axisBonus,
          depthPenalty: selectedScoreBreakdown.depthPenalty,
          relationBonus: selectedScoreBreakdown.relationBonus,
          relationPenalty: selectedScoreBreakdown.relationPenalty,
          absolutePenalty: selectedScoreBreakdown.absolutePenalty ?? 0, // ✅ フェーズ11: absoluteペナルティ
          total: selectedScoreBreakdown.base + selectedScoreBreakdown.fallbackPenalty + selectedScoreBreakdown.axisBonus + selectedScoreBreakdown.depthPenalty + selectedScoreBreakdown.relationBonus + selectedScoreBreakdown.relationPenalty + (selectedScoreBreakdown.absolutePenalty ?? 0),
        } : null,
        containerBounds: containerBounds ? { top: containerBounds.top, left: containerBounds.left } : null,
        selectionReason,
        confidence: bestCandidate.confidence,
        gapKey,
        isSticky: lastSelected?.gapKey === gapKey,
      });

      // ✅ GUIDE_GLITCH_FIX STEP B: 選択されたslotを記録
      this.setLastSelectedSlot(selected.containerId, bestCandidate.kind, (bestCandidate as any).insertionIndex, gapKey);

      // ✅ フェーズ12: 内側候補が1つでもあれば、そこで確定してreturn（外側候補は評価しない）
      return bestCandidate;
    }

    // ✅ フェーズ12: 内側候補が無い場合のみ、外側候補（block / root / absolute）を評価
    // ✅ フェーズ12.5: 描画可能な外側候補のみを評価
    const drawableOuterCandidates = filteredFinalCandidates.filter(c =>
      !!c.slot.renderGuideRect // ✅ フェーズ12.5: 描画可能な候補のみ
    );

    console.log('[DropResolver] 🔍 PHASE12.5: no drawable inner candidates, evaluating outer scope', {
      innerCount: innerCandidates.length,
      outerCount: filteredFinalCandidates.length,
      drawableOuterCount: drawableOuterCandidates.length,
      outerCandidates: filteredFinalCandidates.map(c => ({
        containerId: c.containerId,
        kind: c.slot.kind,
        confidence: c.slot.confidence,
        layoutType: c.layoutType,
        hasRenderGuideRect: !!c.slot.renderGuideRect, // ✅ フェーズ12.5: 描画可能性を確認
      })),
    });

    // ✅ BLOCK_AND_PARENT: 親fallbackロジック（Cursor同等）
    // 子slotが十分に良い時だけ子を選ぶ、それ以外は親(block)のbetweenを選ぶ
    // ✅ フェーズ12.5: 描画可能な外側候補のみで評価
    // 1. 子slot（block以外）で、confidenceが閾値以上のものを探す
    const bestChild = drawableOuterCandidates.find(c => {
      if (c.layoutType === 'block') {
        return false; // blockは親として扱う
      }
      // ✅ レイアウト種別ごとの閾値を適用
      const threshold = CHILD_CONFIDENCE_THRESHOLD[c.layoutType] ?? CHILD_CONFIDENCE_THRESHOLD['flex-row'];
      return c.slot.confidence >= threshold;
    });

    // 2. 親blockのbetween slotを探す（水平候補を優先）
    // ✅ PHASE1: 水平候補（兄弟/cousin）を優先的に選ぶ
    const drawableHorizontalCandidates = horizontalCandidates.filter(c =>
      !!c.slot.renderGuideRect // ✅ フェーズ12.5: 描画可能な候補のみ
    );
    const bestHorizontalBlockBetween = drawableHorizontalCandidates.find(
      c => c.slot.kind === 'between'
    );
    // ✅ フェーズ12.5: 描画可能な外側候補のみで評価
    const bestBlockBetween = bestHorizontalBlockBetween ?? drawableOuterCandidates.find(
      c => c.layoutType === 'block' && c.slot.kind === 'between'
    );

    // ✅ GUIDE_GLITCH_FIX STEP B: 前フレームのselected slotと同じgapにいる場合は優先
    // ✅ フェーズ12.5: 描画可能な外側候補のみで評価
    const lastSelected = this.getLastSelectedSlot();
    let selected = bestChild ?? bestBlockBetween ?? drawableOuterCandidates[0];
    let bestCandidate = selected.slot;

    if (lastSelected) {
      // gapKeyを生成（containerId + kind + insertionIndex + axis）
      // ✅ GUIDE_GLITCH_FIX: axisを含めて「見た目は同じgapだけど実体が違うslot」を区別
      const generateGapKey = (c: typeof filteredFinalCandidates[0]): string => {
        const axis = getAxis(c.slot, c.layoutType) ?? 'null';
        return `${c.containerId}:${c.slot.kind}:${c.slot.insertionIndex ?? 'undefined'}:${axis}`;
      };

      // 前フレームのselected slotと同じgapKeyを持つ候補を探す
      // ✅ フェーズ12.5: 描画可能な外側候補のみで評価
      const stickyCandidate = drawableOuterCandidates.find(c => {
        const gapKey = generateGapKey(c);
        return gapKey === lastSelected.gapKey;
      });

      if (stickyCandidate) {
        // ✅ 前フレームと同じgapにいる場合は、confidenceを上げて優先
        stickyCandidate.slot.confidence = Math.min(1.0, stickyCandidate.slot.confidence + 0.2);
        // ✅ ただし、confidenceが閾値を下回る場合は優先しない（明らかに別のgapに移動した場合）
        const threshold = stickyCandidate.layoutType === 'block' ? 0.5 :
                         (CHILD_CONFIDENCE_THRESHOLD[stickyCandidate.layoutType] ?? CHILD_CONFIDENCE_THRESHOLD['flex-row']) - 0.1;
        if (stickyCandidate.slot.confidence >= threshold) {
          selected = stickyCandidate;
          bestCandidate = selected.slot;
        }
      }
    }

    // ✅ PHASE5: 意図ロック - 意図に一致する候補を優先
    // ✅ フェーズ12.5: 描画可能な外側候補のみで評価
    // dragIntentが指定されている場合、意図に一致する候補を優先的に選ぶ
    if (dragIntent !== null && dragIntent !== undefined) {
      const intentCandidates = drawableOuterCandidates.filter(c => {
        const cAxis = getAxis(c.slot, c.layoutType);
        return cAxis === dragIntent;
      });

      if (intentCandidates.length > 0) {
        // ✅ 意図に一致する候補を優先的に選ぶ（confidenceを上げる）
        intentCandidates.forEach(c => {
          c.slot.confidence = Math.min(1.0, c.slot.confidence + 0.15);
        });

        // ✅ 意図に一致する候補から最良のものを選ぶ
        const bestIntentChild = intentCandidates.find(c => {
          if (c.layoutType === 'block') {
            return false;
          }
          const threshold = CHILD_CONFIDENCE_THRESHOLD[c.layoutType] ?? CHILD_CONFIDENCE_THRESHOLD['flex-row'];
          return c.slot.confidence >= threshold;
        });

        const bestIntentBlockBetween = intentCandidates.find(
          c => c.layoutType === 'block' && c.slot.kind === 'between'
        );

        const intentSelected = bestIntentChild ?? bestIntentBlockBetween ?? intentCandidates[0];
        if (intentSelected) {
          selected = intentSelected;
          bestCandidate = selected.slot;
        }
      }
    }

    // ✅ PHASE4: 方向ヒステリシス - 方向を判定
    const currentAxis = getAxis(bestCandidate, selected.layoutType);

    // ✅ PHASE4: 方向が変わった場合の処理
    if (this.lastSlotAxis !== null && currentAxis !== null && this.lastSlotAxis !== currentAxis) {
      // ✅ 方向変更の開始位置を記録（初回のみ）
      if (this.axisChangeStartX === 0 && this.axisChangeStartY === 0) {
        this.axisChangeStartX = mouseX;
        this.axisChangeStartY = mouseY;
      }

      // ✅ 方向変更の距離を計算
      const axisChangeDistance = Math.sqrt(
        Math.pow(mouseX - this.axisChangeStartX, 2) +
        Math.pow(mouseY - this.axisChangeStartY, 2)
      );

      // ✅ 閾値を超えた場合のみ方向を切り替える
      if (axisChangeDistance >= AXIS_HYSTERESIS_CONFIG.axisChangeThreshold) {
        this.lastSlotAxis = currentAxis;
        this.axisChangeStartX = 0;
        this.axisChangeStartY = 0;
      } else {
        // ✅ 閾値を超えていない場合、前回のaxis候補を優先的に選ぶ
        // 前回のaxisに一致する候補を探す
        const lastAxisCandidates = candidateSlots.filter(c => {
          const cAxis = getAxis(c.slot, c.layoutType);
          return cAxis === this.lastSlotAxis;
        });

        if (lastAxisCandidates.length > 0) {
          // ✅ 前回のaxis候補を優先的に選ぶ（confidenceを上げる）
          lastAxisCandidates.forEach(c => {
            c.slot.confidence = Math.min(1.0, c.slot.confidence + 0.1);
          });

          // ✅ 前回のaxis候補から最良のものを選ぶ
          const bestLastAxisChild = lastAxisCandidates.find(c => {
            if (c.layoutType === 'block') {
              return false;
            }
            const threshold = CHILD_CONFIDENCE_THRESHOLD[c.layoutType] ?? CHILD_CONFIDENCE_THRESHOLD['flex-row'];
            return c.slot.confidence >= threshold;
          });

          const bestLastAxisBlockBetween = lastAxisCandidates.find(
            c => c.layoutType === 'block' && c.slot.kind === 'between'
          );

          const lastAxisSelected = bestLastAxisChild ?? bestLastAxisBlockBetween ?? lastAxisCandidates[0];
          if (lastAxisSelected) {
            selected = lastAxisSelected;
            bestCandidate = selected.slot;
          }
        }
      }
    } else {
      // ✅ 方向が変わっていない場合、状態をリセット
      this.axisChangeStartX = 0;
      this.axisChangeStartY = 0;
      if (currentAxis !== null) {
        this.lastSlotAxis = currentAxis;
      }
    }

    // ✅ PHASE0_S1: 診断用 - draggedNodeの情報を取得
    const draggedNodeDepth = this.layoutTree?.getDepth(draggedNode.elementId) ?? 0;
    const draggedNodePath = this.layoutTree?.getAncestorPath(draggedNode.elementId) ?? [];
    const draggedNodeParentId = draggedNode.parentId;
    const hoveredHitContainerId = containerNode.elementId;

    // ✅ BLOCK_AND_PARENT + PHASE1 + PHASE0_S1: 最終選択の可視化ログ（常に出力）
    console.log('[DropResolver] 🔍 FINAL_SLOT_SELECTION: final selection (outer scope)', {
      draggedId: draggedNode.elementId,
      draggedNodeDepth,
      draggedNodePath,
      draggedNodeParentId,
      hoveredHitContainerId,
      scopeParentId,
      draggedNodeIsGroup,
      totalCandidates: candidateSlots.length,
      filteredCandidatesCount: filteredCandidates.length,
      scopeCandidatesCount: scopeCandidates.length,
      finalCandidatesCount: finalCandidates.length,
      horizontalCandidatesCount: horizontalCandidates.length,
      initialDepth,
      selectedContainerId: selected.containerId,
      selectedDepth: selected.depth,
      selectedLayoutType: selected.layoutType,
      selectedSlotKind: bestCandidate.kind,
      selectedConfidence: bestCandidate.confidence,
      selectionReason: bestChild ? 'child_high_confidence' :
                       bestHorizontalBlockBetween ? 'horizontal_block_fallback' :
                       bestBlockBetween ? 'parent_block_fallback' :
                       'highest_confidence_fallback',
      // ✅ フェーズ12: 外側候補のみで評価
      allCandidates: filteredFinalCandidates.map(c => ({
        containerId: c.containerId,
        layoutType: c.layoutType,
        depth: c.depth,
        slotKind: c.slot.kind,
        confidence: c.slot.confidence,
        isChild: c.layoutType !== 'block',
        isBlockBetween: c.layoutType === 'block' && c.slot.kind === 'between',
      }))
    });

    // ✅ GUIDE_GLITCH_FIX: 毎フレーム1行で選択されたslotの詳細を出力（「同じ場所でslotが入れ替わってるか」を即断できる）
    // ✅ フェーズ10: score計算の内訳を出力（検証・デバッグ用）
    const containerBounds = this.layoutTree?.getEffectiveBounds(selected.containerId) ??
                           this.layoutTree?.findById(selected.containerId)?.bounds;
    const selectionReason = bestChild ? 'child_high_confidence' :
                           bestHorizontalBlockBetween ? 'horizontal_block_fallback' :
                           bestBlockBetween ? 'parent_block_fallback' :
                           (bestCandidate.isFallback ?? false) ? 'nearest_gap_fallback' :
                           'highest_confidence_fallback';
    // ✅ GUIDE_GLITCH_FIX: axisを含めてgapKeyを生成
    const selectedAxis = getAxis(bestCandidate, selected.layoutType) ?? 'null';
    const gapKey = `${selected.containerId}:${bestCandidate.kind}:${(bestCandidate as any).insertionIndex ?? 'undefined'}:${selectedAxis}`;

    // ✅ フェーズ10: score計算の内訳を取得
    const selectedScoreBreakdown = (selected as any).scoreBreakdown ?? null;
    const selectedScore = (selected as any).score ?? bestCandidate.confidence;

    console.log('[DnD] SELECTED_SLOT_DETAIL', {
      containerId: selected.containerId,
      kind: bestCandidate.kind,
      axis: (bestCandidate as any).axis,
      insertionIndex: (bestCandidate as any).insertionIndex,
      layoutType: selected.layoutType,
      // ✅ フェーズ10: score計算の内訳を出力
      score: selectedScore,
      scoreBreakdown: selectedScoreBreakdown ? {
        base: selectedScoreBreakdown.base,
        fallbackPenalty: selectedScoreBreakdown.fallbackPenalty,
        axisBonus: selectedScoreBreakdown.axisBonus,
        depthPenalty: selectedScoreBreakdown.depthPenalty,
        relationBonus: selectedScoreBreakdown.relationBonus,
        relationPenalty: selectedScoreBreakdown.relationPenalty,
        absolutePenalty: selectedScoreBreakdown.absolutePenalty ?? 0, // ✅ フェーズ11: absoluteペナルティ
        total: selectedScoreBreakdown.base + selectedScoreBreakdown.fallbackPenalty + selectedScoreBreakdown.axisBonus + selectedScoreBreakdown.depthPenalty + selectedScoreBreakdown.relationBonus + selectedScoreBreakdown.relationPenalty + (selectedScoreBreakdown.absolutePenalty ?? 0),
      } : null,
      containerBounds: containerBounds ? { top: containerBounds.top, left: containerBounds.left } : null,
      selectionReason,
      confidence: bestCandidate.confidence,
      gapKey,
      isSticky: lastSelected?.gapKey === gapKey,
    });

    // ✅ GUIDE_GLITCH_FIX STEP B: 選択されたslotを記録
    this.setLastSelectedSlot(selected.containerId, bestCandidate.kind, (bestCandidate as any).insertionIndex, gapKey);

    // ✅ フェーズ12: 外側候補の処理完了
    return bestCandidate;
  }

  /**
   * コンテナを正規化: 実際に子要素が並んでいる要素を返す
   * ✅ CRITICAL FIX: wrapper（flex-row/flex-column/grid）が正式なDnDコンテナとして認識されるため、normalizeは不要
   * LayoutTree.buildNodeTreeで、wrapperは既にisContainer=true、childrenParentId=elementIdとして設定されている
   * そのため、containerNodeをそのまま返す
   *
   * @param containerNode 正規化対象のコンテナノード
   * @param draggedNode ドラッグ中のノード（循環防止用、現在は未使用）
   * @returns 正規化されたコンテナノード（現在はそのまま返す）
   * @deprecated このメソッドは互換性のために残しているが、実質的には何もしない
   */
  private normalizeContainerForLayoutChildren(
    containerNode: LayoutNode,
    draggedNode: LayoutNode
  ): LayoutNode {
    // ✅ CRITICAL FIX: wrapperが正式なDnDコンテナとして認識されるため、normalizeは不要
    // LayoutTree.buildNodeTreeで、wrapperは既にisContainer=true、childrenParentId=elementIdとして設定されている
    // そのため、containerNodeをそのまま返す
    return containerNode;
  }

  /**
   * マウス位置からコンテナを検索
   * ✅ Cursor完全準拠: DOMはヒントのみ、bounds-based fallbackが必須
   * ✅ 空領域・padding・gap・overlay上でも動作
   * ✅ グループ間DnDを完全サポート
   *
   * Architecture:
   * 1. DOM hint (elementsFromPoint) - オプショナル
   * 2. DOM parent walk - 限定的
   * 3. Bounds fallback (CRITICAL) - 必須、すべてのコンテナを反復
   * 4. DraggedNode exclusion - 継続探索
   * 5. Root fallback - 最後の手段
   */
  private findContainerAt(
    mouseX: number,
    mouseY: number,
    draggedNode: LayoutNode
  ): LayoutNode | null {
    if (!this.layoutTree) {
      return null;
    }

    // ✅ STEP 1: DOM hint - elementsFromPoint をすべて反復
    // ✅ DOMはヒントとしてのみ使用、必須ではない
    let domHintNode: LayoutNode | null = null;
    const elements = document.elementsFromPoint(mouseX, mouseY);

    if (elements && elements.length > 0) {
      // ✅ overlay要素を除外し、data-element-id を持つ最初の要素を探す
      for (const el of elements) {
        const htmlEl = el as HTMLElement;
        // ✅ overlay要素を除外
        if (htmlEl && htmlEl.hasAttribute('data-ui-editor-overlay')) {
          continue;
        }
        // ✅ data-element-id を持つ要素を探す
        if (htmlEl && htmlEl.hasAttribute('data-element-id')) {
          const elementId = htmlEl.getAttribute('data-element-id');
          if (elementId) {
            const node = this.layoutTree.findById(elementId);
            if (node) {
              domHintNode = node;
              break;
            }
          }
        }
      }

      // ✅ STEP 2: DOM parent walk - 限定的な親探索
      if (!domHintNode) {
        const firstElement = elements.find(el => {
          const htmlEl = el as HTMLElement;
          return htmlEl && !htmlEl.hasAttribute('data-ui-editor-overlay');
        }) as HTMLElement;

        if (firstElement) {
          let current: HTMLElement | null = firstElement;
          let depth = 0;
          const MAX_DEPTH = 10;

          while (current && depth < MAX_DEPTH) {
            if (current.hasAttribute('data-element-id')) {
              const elementId = current.getAttribute('data-element-id');
              if (elementId) {
                const node = this.layoutTree.findById(elementId);
                if (node) {
                  domHintNode = node;
                  break;
                }
              }
            }
            current = current.parentElement;
            depth++;
          }
        }
      }
    }

    // ✅ STEP 3: Bounds fallback (CRITICAL) - 必須
    // ✅ CRITICAL FIX: effectiveBounds を持つ container を優先（並びを支配している bounds を返す）
    // findContainerAt の本質は「並びを支配している bounds を返す」こと
    // effectiveBounds を持つ container = 並びを支配している container（flex-row/flex-column/grid）
    // ✅ すべてのコンテナを反復し、pointInRect でフィルタ、親に吸われないtie-breakでソート
    // ✅ DOMが見つからなくても、bounds-based resolution で動作
    const candidates: Array<{
      node: LayoutNode;
      depth: number;
      effectiveBoundsHit: boolean; // ✅ effectiveBounds内にマウスがあるか
      area: number; // ✅ boundsの面積（小さい方が内側）
      distance: number; // ✅ マウス位置からの距離
      isRootNode: boolean; // ✅ SCROLL_AND_GLOBAL_LAYER: 最上位コンテナフラグ
    }> = [];

    // ✅ すべてのコンテナノードを反復
    for (const node of this.layoutTree.getAllNodes().values()) {
      if (!node.isContainer) {
        continue;
      }

      // ✅ draggedNode を除外
      if (node.elementId === draggedNode.elementId) {
        continue;
      }

      // ✅ CRITICAL FIX: effectiveBounds を取得（並びを支配している bounds を取得）
      // wrapper（flex-row/flex-column/grid）の場合は childrenParentId = elementId なので、effectiveBounds が存在
      // block親の場合は childrenParentId = undefined なので、effectiveBounds = null
      const effectiveBounds = this.layoutTree.getEffectiveBounds(node.elementId);
      // ✅ 並びを支配している bounds を優先使用、なければ node.bounds を使用
      const bounds = effectiveBounds ?? node.bounds;

      // ✅ pointInRect で判定（EPS導入: 境界・小数座標・丸め誤差対策）
      // ✅ Cursor完全準拠: EPS = 0.5 で境界判定を緩和
      // ✅ CRITICAL: bounds.right / bounds.bottom を信用しない（left+width / top+height で計算）
      const EPS = 0.5;
      const right = bounds.left + bounds.width;
      const bottom = bounds.top + bounds.height;
      const isInBounds = (
        mouseX >= bounds.left - EPS &&
        mouseX <= right + EPS &&
        mouseY >= bounds.top - EPS &&
        mouseY <= bottom + EPS
      );

      if (isInBounds) {
        // ✅ depth を計算（parentId を辿って root までの距離）
        let depth = 0;
        let current: LayoutNode | null = node;
        while (current && current.parentId) {
          depth++;
          current = this.layoutTree.findById(current.parentId);
        }

        // ✅ SCROLL_AND_GLOBAL_LAYER: 最上位コンテナ（root）を判定
        const isRootNode = node.parentId === null;

        // ✅ CRITICAL FIX: effectiveBoundsHit を判定
        // effectiveBounds が存在 = 並びを支配している container（flex-row/flex-column/grid）
        // この container を最優先で返すことで、正しい bounds で判定・描画が行われる
        const effectiveBoundsHit = effectiveBounds !== null && isInBounds;

        // ✅ ROW_LAYOUT_FIX: boundsの面積を計算（小さい方が内側 = 優先）
        const area = bounds.width * bounds.height;

        // ✅ ROW_LAYOUT_FIX: マウス位置からの距離を計算
        // rect内なら中心距離、外なら端距離
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        const isInsideRect = (
          mouseX >= bounds.left &&
          mouseX <= right &&
          mouseY >= bounds.top &&
          mouseY <= bottom
        );
        const distance = isInsideRect
          ? Math.sqrt(Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2))
          : Math.min(
              Math.abs(mouseX - bounds.left),
              Math.abs(mouseX - right),
              Math.abs(mouseY - bounds.top),
              Math.abs(mouseY - bottom)
            ) + Math.sqrt(Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2));

        candidates.push({
          node,
          depth,
          effectiveBoundsHit,
          area,
          distance,
          isRootNode // ✅ SCROLL_AND_GLOBAL_LAYER: 最上位コンテナフラグ
        });
      }
    }

    // ✅ CRITICAL FIX: 親に吸われないtie-breakロジック（Cursor 2.x の思想に完全一致）
    // ✅ SCROLL_AND_GLOBAL_LAYER: 最上位コンテナも適切に優先されるように調整
    // ✅ FIX-FINAL: マウス位置に最も近い"レイヤー"を優先（同じ親内の子を優先）
    // 1. effectiveBoundsHit を最優先（並びを支配している container を優先）
    // 2. マウス位置がコンテナの中央領域にあるか（inside intent）
    // 3. より小さい面積のrect（＝より内側）を優先
    // 4. depth（深い順 = 子に近い順）
    // 5. 距離（近い順）
    // 6. 最上位コンテナ（root）は最後のフォールバックとして優先（effectiveBoundsHit=falseの場合のみ）
    candidates.sort((a, b) => {
      // 1. effectiveBoundsHit を最優先（並びを支配している bounds を持つ container を優先）
      if (a.effectiveBoundsHit !== b.effectiveBoundsHit) {
        return a.effectiveBoundsHit ? -1 : 1;
      }

      // 2. ✅ FIX-FINAL: マウス位置がコンテナの中央領域にあるかをチェック（inside intent）
      // Cursor準拠: 中央領域にマウスがある場合、そのコンテナを優先
      const INNER_ZONE_RATIO = 0.3; // 30%の中央領域
      const aInnerZone = Math.min(30, Math.min(a.node.bounds.width, a.node.bounds.height) * INNER_ZONE_RATIO);
      const bInnerZone = Math.min(30, Math.min(b.node.bounds.width, b.node.bounds.height) * INNER_ZONE_RATIO);

      const aIsInCenterZone = (
        mouseX >= a.node.bounds.left + aInnerZone &&
        mouseX <= a.node.bounds.left + a.node.bounds.width - aInnerZone &&
        mouseY >= a.node.bounds.top + aInnerZone &&
        mouseY <= a.node.bounds.top + a.node.bounds.height - aInnerZone
      );

      const bIsInCenterZone = (
        mouseX >= b.node.bounds.left + bInnerZone &&
        mouseX <= b.node.bounds.left + b.node.bounds.width - bInnerZone &&
        mouseY >= b.node.bounds.top + bInnerZone &&
        mouseY <= b.node.bounds.top + b.node.bounds.height - bInnerZone
      );

      // 中央領域にある方を優先
      if (aIsInCenterZone !== bIsInCenterZone) {
        return aIsInCenterZone ? -1 : 1;
      }

      // 3. より小さい面積のrect（＝より内側）を優先
      if (a.area !== b.area) {
        return a.area - b.area;
      }
      // 4. depth（深い順 = 子に近い順）
      if (a.depth !== b.depth) {
        return b.depth - a.depth;
      }
      // 5. 距離（近い順）
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      // 6. ✅ SCROLL_AND_GLOBAL_LAYER: 最上位コンテナ（root）を最後のフォールバックとして優先
      // effectiveBoundsHit=falseの場合のみ、rootを優先（内側コンテナがない場合のフォールバック）
      if (!a.effectiveBoundsHit && !b.effectiveBoundsHit) {
        if (a.isRootNode !== b.isRootNode) {
          return a.isRootNode ? -1 : 1; // rootを優先
        }
      }
      return 0;
    });

    // ✅ bounds fallback で候補が見つかった場合
    if (candidates.length > 0) {
      const selected = candidates[0].node;

      // ✅ CRITICAL FIX: デバッグログ（常に出力）
      console.log('[DropResolver] 🔍 CRITICAL_FIX: findContainerAt selected', {
        selectedContainerId: selected.elementId,
        selectedLayoutType: selected.layoutType,
        effectiveId: this.layoutTree.getEffectiveChildrenParentId(selected.elementId),
        effectiveLayoutType: this.layoutTree.getEffectiveLayoutType(selected.elementId),
        effectiveBoundsHit: candidates[0].effectiveBoundsHit,
        area: candidates[0].area,
        depth: candidates[0].depth,
        distance: candidates[0].distance,
        mouseX,
        mouseY,
        candidatesCount: candidates.length,
        top3Candidates: candidates.slice(0, 3).map(c => ({
          containerId: c.node.elementId,
          layoutType: c.node.layoutType,
          effectiveBoundsHit: c.effectiveBoundsHit,
          area: c.area,
          depth: c.depth,
          distance: c.distance,
        })),
      });

      // ✅ Cursor完全準拠: 有効な container を保持
      this.lastValidContainer = selected;
      return selected;
    }

    // ✅ フェーズ8対策: leafノードが見つかった場合、親コンテナを返す
    // leafノード（Text/Image/Buttonなど）はisContainer=falseなので、上記の候補に含まれない
    // しかし、leafノードの上にカーソルがある場合、その親コンテナのbetweenとして扱うべき
    if (domHintNode && !domHintNode.isContainer) {
      // ✅ leafノードの親コンテナを探す
      let current: LayoutNode | null = domHintNode;
      while (current && current.parentId) {
        const parent = this.layoutTree.findById(current.parentId);
        if (parent && parent.isContainer && parent.elementId !== draggedNode.elementId) {
          // ✅ 親コンテナが見つかった場合、それを返す
          console.log('[DropResolver] 🔍 PHASE8: leaf node found, using parent container', {
            leafNodeId: domHintNode.elementId,
            parentContainerId: parent.elementId,
            parentLayoutType: parent.layoutType,
            mouseX,
            mouseY,
          });
          this.lastValidContainer = parent;
          return parent;
        }
        current = parent;
      }
    }

    // ✅ STEP 4: DOM hint からコンテナを探索（draggedNode 一致時も継続）
    if (domHintNode) {
      let current: LayoutNode | null = domHintNode;
      let traversalDepth = 0;

      while (current) {
        // ✅ コンテナかつ draggedNode でない場合は返す
        if (current.isContainer && current.elementId !== draggedNode.elementId) {
          // ✅ Cursor完全準拠: 有効な container を保持
          this.lastValidContainer = current;
          return current;
        }
        // ✅ draggedNode に一致しても探索を継続（親の親まで探索）
        current = current.parentId ? this.layoutTree.findById(current.parentId) : null;
        traversalDepth++;
      }
    }

    // ✅ STEP 5: Root fallback - 最後の手段
    // ✅ ルートコンテナが存在し、bounds に含まれる場合は使用
    const rootNode = this.layoutTree.getRoot();
    if (rootNode && rootNode.isContainer) {
      // ✅ EPS導入: 境界・小数座標・丸め誤差対策
      // ✅ CRITICAL: bounds.right / bounds.bottom を信用しない（left+width / top+height で計算）
      const EPS = 0.5;
      const bounds = rootNode.bounds;
      const right = bounds.left + bounds.width;
      const bottom = bounds.top + bounds.height;
      if (
        mouseX >= bounds.left - EPS &&
        mouseX <= right + EPS &&
        mouseY >= bounds.top - EPS &&
        mouseY <= bottom + EPS
      ) {
        // ✅ Cursor完全準拠: 有効な container を保持
        this.lastValidContainer = rootNode;
        return rootNode;
      }
    }

    // ✅ Cursor完全準拠: 一瞬 null が返っても最後の有効な container を返す
    // ✅ pointermove 中は DOM / bounds がズレるため、1フレームの失敗は正常挙動
    // ✅ CRITICAL FIX: lastValidContainer を使用する前に、マウス位置が bounds 内にあるか確認
    if (this.lastValidContainer) {
      const bounds = this.lastValidContainer.bounds;
      const right = bounds.left + bounds.width;
      const bottom = bounds.top + bounds.height;
      const EPS = 0.5;
      const isInBounds =
        mouseX >= bounds.left - EPS &&
        mouseX <= right + EPS &&
        mouseY >= bounds.top - EPS &&
        mouseY <= bottom + EPS;

      if (isInBounds) {
        return this.lastValidContainer;
      } else {
        // ✅ マウス位置が bounds 外の場合は lastValidContainer をクリア
        this.lastValidContainer = null;
      }
    }

    return null;
  }

  /**
   * レイアウトタイプに応じてスロットを解決
   * ✅ STEP 4: レイアウト非依存ロジックに昇格
   * ✅ フェーズ7対策: depthを計算して渡す（深いネストでinsideが出過ぎるのを防ぐ）
   */
  private resolveSlotByLayoutType(
    containerNode: LayoutNode,
    draggedNode: LayoutNode,
    mouseX: number,
    mouseY: number,
    effectiveLayoutType?: LayoutNode['layoutType'],
    effectiveBounds?: LayoutNode['bounds'] | null,
    effectiveId?: string
  ): Slot | null {
    if (!this.layoutTree) {
      return null;
    }

    // ✅ CRITICAL FIX: draggedNode が containerNode の祖先である場合は null を返す
    // draggedNode を含む container に対してスロットを解決しようとすると、不適切なスロットが生成される
    let checkNode: LayoutNode | null = containerNode;
    while (checkNode && checkNode.parentId) {
      if (checkNode.parentId === draggedNode.elementId) {
        return null; // draggedNode が containerNode の祖先である場合はスロットを解決しない
      }
      checkNode = this.layoutTree.findById(checkNode.parentId);
    }

    // ✅ フェーズ7対策: containerNodeとdraggedNodeの関係からdepthを計算
    let containerDepth = 0;
    let depthCurrent: LayoutNode | null = draggedNode;
    while (depthCurrent && depthCurrent.parentId) {
      if (depthCurrent.parentId === containerNode.elementId) {
        break;
      }
      depthCurrent = this.layoutTree?.findById(depthCurrent.parentId) ?? null;
      if (depthCurrent) {
        containerDepth++;
      }
    }

    // ✅ ROW_LAYOUT_FIX: effectiveLayoutType と effectiveBounds を使用
    // 引数で渡された effectiveLayoutType と effectiveBounds を優先使用
    const layoutType = effectiveLayoutType ?? containerNode.layoutType;
    const containerBounds = effectiveBounds ?? containerNode.bounds;

    // ✅ COLUMN_GROUP_FIX: デバッグログ（常に出力）
    console.log('[DropResolver] 🔍 COLUMN_GROUP_FIX: resolveSlotByLayoutType', {
      containerId: containerNode.elementId,
      containerLayoutType: containerNode.layoutType,
      effectiveLayoutType: layoutType,
      effectiveId,
      hasEffectiveBounds: effectiveBounds !== null,
      mouseX,
      mouseY,
    });

    switch (layoutType) {
      case 'flex-row':
      case 'flex-column':
        // ✅ COLUMN_GROUP_FIX: effectiveLayoutType, effectiveBounds, effectiveId を resolveFlexSlot に渡す
        // effectiveId は resolveSlot で取得したものを使用（正規化前の block親から取得したもの）
        // resolveSlotByLayoutType 内で再取得すると、正規化後の flex-row/flex-column 子から取得するため、childrenParentId が取得できない
        const actualEffectiveId = effectiveId ?? (this.layoutTree.getEffectiveChildrenParentId(containerNode.elementId) ?? containerNode.elementId);
        return this.resolveFlexSlot(containerNode, draggedNode, mouseX, mouseY, layoutType as 'flex-row' | 'flex-column', containerBounds, actualEffectiveId, containerDepth);

      case 'grid':
        // ✅ CRITICAL FIX: effectiveId を resolveGridSlot に渡す（一貫性のため）
        const gridEffectiveId = effectiveId ?? (this.layoutTree.getEffectiveChildrenParentId(containerNode.elementId) ?? containerNode.elementId);
        return this.resolveGridSlot(containerNode, draggedNode, mouseX, mouseY, containerBounds, gridEffectiveId);

      case 'absolute':
        // ✅ absolute レイアウト: insideのみ許可（between禁止）
        // ✅ CRITICAL FIX: effectiveId を resolveAbsoluteSlot に渡す（一貫性のため）
        const absoluteEffectiveId = effectiveId ?? containerNode.elementId;
        return this.resolveAbsoluteSlot(containerNode, draggedNode, mouseX, mouseY, containerBounds, absoluteEffectiveId);

      case 'block':
        // ✅ SCROLL_AND_GLOBAL_LAYER: blockレイアウト用のbetween slotを実装
        // blockレイアウトは flex-column 相当として扱い、子要素間に縦方向の between slot を生成
        // ✅ BLOCK_AND_PARENT: 常に出力されるログ（DEBUG_DNDに関係なく）
        console.log('[DropResolver] 🔍 BLOCK_SLOT_ENTRY: entering block case', {
          containerId: containerNode.elementId,
          effectiveId,
          effectiveLayoutType: layoutType,
          mouseX,
          mouseY,
          hasContainerBounds: containerBounds !== null && containerBounds !== undefined
        });
        const blockEffectiveId = effectiveId ?? containerNode.elementId;
        const slot = this.resolveBlockSlot(containerNode, draggedNode, mouseX, mouseY, containerBounds, blockEffectiveId, containerDepth);
        // ✅ 戻り値をログに出力（DEBUG_DNDに関係なく）
        console.log('[DropResolver] 🔍 BLOCK_SLOT_ENTRY: resolveBlockSlot returned', {
          slot: slot ? {
            kind: slot.kind,
            axis: slot.axis,
            confidence: slot.confidence,
            hasGuideRect: !!slot.renderGuideRect,
            guideRect: slot.renderGuideRect ? {
              left: slot.renderGuideRect.left,
              top: slot.renderGuideRect.top,
              width: slot.renderGuideRect.width,
              height: slot.renderGuideRect.height
            } : null,
            containerId: slot.containerId,
            insertionIndex: slot.insertionIndex
          } : null
        });
        return slot;

      default:
        // ✅ フォールバック: inside として扱う
        // ✅ CRITICAL FIX: effectiveId を resolveAbsoluteSlot に渡す（一貫性のため）
        const defaultEffectiveId = effectiveId ?? containerNode.elementId;
        return this.resolveAbsoluteSlot(containerNode, draggedNode, mouseX, mouseY, containerBounds, defaultEffectiveId);
    }
  }

  /**
   * Flex スロットを解決
   * ✅ Cursor 2.x準拠: between/inside/outside を判定
   * ✅ FIX: confidence + priority で最終選択ロジックを追加
   * ✅ FIX: isOutside 判定を削除（resolveSlot() レベルで ancestor resolve を行うため）
   */
  private resolveFlexSlot(
    containerNode: LayoutNode,
    draggedNode: LayoutNode,
    mouseX: number,
    mouseY: number,
    effectiveLayoutType?: 'flex-row' | 'flex-column',
    effectiveBounds?: LayoutNode['bounds'],
    effectiveId?: string,
    depth: number = 0 // ✅ フェーズ7対策: depthを追加（深いネストでinsideが出過ぎるのを防ぐ）
  ): Slot | null {
    if (!this.layoutTree) {
      return null;
    }

    const DEBUG_DND = typeof window !== 'undefined' && (window as any).DEBUG_DND === true;

    // ✅ COLUMN_GROUP_FIX: effectiveLayoutType を使用して row/column を判定
    // RowグループとColumnグループは、縦か横かが違うだけで、根本的な仕様は同じ
    let isRow: boolean;

    // ✅ COLUMN_GROUP_FIX: effectiveLayoutType が渡されていない場合は、containerNode.layoutType から確実に判定
    if (effectiveLayoutType) {
      isRow = effectiveLayoutType === 'flex-row';
    } else {
      // ✅ フォールバック: containerNode.layoutType から判定
      // ✅ 正規化後の containerNode は既に flex-row/flex-column になっているはず
      isRow = containerNode.layoutType === 'flex-row';

      // ✅ block レイアウトの場合は子要素のレイアウトタイプを確認（正規化されていない場合のフォールバック）
      if (containerNode.layoutType === 'block' && containerNode.children.length > 0) {
        const children = this.layoutTree.getChildren(containerNode.elementId);
        if (children.length > 0) {
          isRow = children[0].layoutType === 'flex-row';
        }
      }
    }

    // ✅ COLUMN_GROUP_FIX: effectiveBounds を使用
    const containerBounds = effectiveBounds ?? containerNode.bounds;

    // ✅ CRITICAL FIX: effectiveId 基準に一本化（gap判定・ガイド描画・drop適用で参照するchildrenを完全統一）
    // effectiveId は実際に子要素が並んでいる親の要素ID（wrapper: flex-row/flex-column/grid または block親）
    // LayoutTree.buildNodeTreeで、wrapperは childrenParentId = elementId として設定されている
    // そのため、effectiveId は常に設定されている（wrapperの場合は自分自身、block親の場合は自分自身）
    // フォールバック（containerNode.elementId）は安全のため残すが、通常は使用されない
    const actualChildrenParentId = effectiveId ?? containerNode.elementId;

    // ✅ COLUMN_GROUP_FIX: デバッグログ（常に出力）
    console.log('[DropResolver] 🔍 COLUMN_GROUP_FIX: resolveFlexSlot called', {
      containerId: containerNode.elementId,
      containerLayoutType: containerNode.layoutType,
      effectiveLayoutType,
      effectiveId,
      actualChildrenParentId,
      isRow,
      mouseX,
      mouseY,
      containerBounds,
      hasEffectiveBounds: effectiveBounds !== undefined,
    });

    const axis: 'row' | 'column' = isRow ? 'row' : 'column';
    // ✅ CRITICAL: bounds.right / bounds.bottom を信用しない（left+width / top+height で計算）
    const containerRight = containerBounds.left + containerBounds.width;
    const containerBottom = containerBounds.top + containerBounds.height;

    // ✅ FIX: isOutside 判定を削除
    // ✅ resolveSlot() レベルで ancestor resolve を行うため、ここでの親探索は不要
    // ✅ これにより、グループ間のDnDでも正しくスロットが解決される

    // ✅ COLUMN_GROUP_FIX: effectiveId を使用して children を取得
    let children = this.layoutTree.getChildren(actualChildrenParentId);

    // ✅ CRITICAL FIX: effectiveId 基準に一本化（gap判定・ガイド描画・drop適用で参照するIDを完全統一）
    // effectiveId は実際に子要素が並んでいる親の要素ID（wrapper: flex-row/flex-column/grid または block親）
    // フォールバック（containerNode.elementId）は安全のため残すが、通常は使用されない
    const insertionParentId = effectiveId ?? containerNode.elementId;

    // ✅ STEP 3: 空のコンテナ: empty として扱う
    if (children.length === 0) {
      // ✅ CRITICAL FIX: gap判定・ガイド描画・drop適用で参照するIDを完全統一（Cursor仕様完全準拠）
      const actualContainerId = effectiveId ?? containerNode.elementId;
      return {
        kind: 'empty',
        axis,
        containerId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一（gap判定・ガイド描画と同じ）
        insertionParentId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一（gap判定・ガイド描画と同じ）
        insertion: 0,
        insertionIndex: 0,
        renderGuideRect: this.boundsToDOMRect(containerBounds),
        guideStyle: 'dashed', // ✅ STEP 3: empty は中央にdashed box
        confidence: 1.0,
      };
    }

    // ✅ ドラッグ中の要素を除外（同じコンテナ内の場合）
    children = children.filter(child => child.elementId !== draggedNode.elementId);

    // ✅ FIX 1: 全ての候補を同時に計算し、confidence で 1つに絞る
    const candidateSlots: Slot[] = [];
    const compareCoord = isRow ? mouseX : mouseY;

    // ✅ 候補1: before/after/between スロット
    let insertionIndex = children.length;
    let nearestGapDistance = Infinity;
    let nearestGapIndex = children.length;
    // ✅ フェーズ6: nearest gap fallback（tolerance外でも最も近いgapを記録）
    let nearestGapDistanceFallback = Infinity;
    let nearestGapIndexFallback = children.length;

    // ✅ BUG-001 FIX: すべてのギャップを検出し、距離が最も近いものを選ぶ
    // ✅ 重要: カーソル位置が複数のギャップに含まれる場合、距離が最も近いものを選ぶ

    // ✅ ROW_LAYOUT_FIX: 右端問題のデバッグログ（ループ開始前 - 常に出力）
    console.log('[DropResolver] 🔍 ROW_LAYOUT_FIX: gap detection loop start', {
      childrenCount: children.length,
      loopWillRun: `i = 0 to ${children.length}`,
      isRow,
      compareCoord,
      mouseX,
      mouseY,
      containerRight,
      containerBottom,
    });

    for (let i = 0; i <= children.length; i++) {
      // ✅ ROW_LAYOUT_FIX: 右端のループ到達を確認（常に出力）
      if (i === children.length) {
        console.log('[DropResolver] 🔍 ROW_LAYOUT_FIX: right edge loop iteration', {
          i,
          childrenLength: children.length,
          isRow,
          compareCoord,
          mouseX,
          mouseY,
          containerRight,
          containerBottom,
        });
      }

      let gapStart: number;
      let gapEnd: number;

      if (i === 0) {
      // ✅ CRITICAL FIX: 最初の要素の前のギャップ（container基準で計算）
      // gap判定は container基準（containerBounds）を使用
      // gapStart = containerBounds.start（コンテナの端）
      // gapEnd = firstBounds.start（最初の要素の端）
      const firstChild = children[0];
      const firstBounds = firstChild.bounds;
      gapStart = isRow ? containerBounds.left : containerBounds.top;
      gapEnd = isRow ? firstBounds.left : firstBounds.top;

        // ✅ ROW_LAYOUT_FIX: 左右の端のギャップが検出されない場合の対策
        // gapStart === gapEnd の場合でも、コンテナの端に近ければギャップとして扱う
        if (gapStart === gapEnd && isRow) {
          // 左端の場合: コンテナの左端から最初の要素の左端までの範囲をギャップとして扱う
          // 実際にはギャップがない場合でも、コンテナの左端に近ければ検出する
          const EPS = 1; // 1px の許容範囲
          gapEnd = gapStart + EPS; // 最小のギャップ範囲を確保
        } else if (gapStart === gapEnd && !isRow) {
          // 上端の場合: 同様の処理
          const EPS = 1;
          gapEnd = gapStart + EPS;
        }
      } else if (i === children.length) {
        // ✅ CRITICAL FIX: 最後の要素の後のギャップ（container基準で計算、左端と完全に対称）
        // gap判定は container基準（containerBounds）を使用
        // gapStart = lastBounds.end（最後の要素の端）
        // gapEnd = containerBounds.end（コンテナの端）
        const lastChild = children[children.length - 1];
        const lastBounds = lastChild.bounds;
        gapStart = isRow ? lastBounds.left + lastBounds.width : lastBounds.top + lastBounds.height;
        gapEnd = isRow ? containerRight : containerBottom;

        // ✅ ROW_LAYOUT_FIX: gapStart > gapEnd の場合を修正（左端と同じロジック）
        // gapStart > gapEnd になる可能性がある場合（padding/marginなど）、gapStart と gapEnd を入れ替える
        if (gapStart > gapEnd) {
          // gapStart と gapEnd を入れ替える（左端では発生しないが、右端では発生する可能性がある）
          const temp = gapStart;
          gapStart = gapEnd;
          gapEnd = temp;
        }

        // ✅ ROW_LAYOUT_FIX: 左右の端のギャップが検出されない場合の対策（左端と完全に対称）
        // gapStart === gapEnd の場合でも、コンテナの端に近ければギャップとして扱う
        // 左端と同じロジック: 最小のギャップ範囲を確保
        if (gapStart === gapEnd && isRow) {
          // 右端の場合: コンテナの右端から最後の要素の右端までの範囲をギャップとして扱う
          // 実際にはギャップがない場合でも、コンテナの右端に近ければ検出する
          const EPS = 1; // 1px の許容範囲（左端と同じ）
          gapEnd = gapStart + EPS; // 最小のギャップ範囲を確保（左端と同じ）
        } else if (gapStart === gapEnd && !isRow) {
          // 下端の場合: 同様の処理（左端と同じ）
          const EPS = 1;
          gapEnd = gapStart + EPS;
        }
      } else {
        // ✅ 要素間: 前の要素の後ろと次の要素の前の間
        const prevChild = children[i - 1];
        const nextChild = children[i];
        const prevBounds = prevChild.bounds;
        const nextBounds = nextChild.bounds;
        gapStart = isRow ? prevBounds.left + prevBounds.width : prevBounds.top + prevBounds.height;
        gapEnd = isRow ? nextBounds.left : nextBounds.top;

        // ✅ COLUMN_GROUP_FIX: gapStart > gapEnd の場合を修正（要素が重なっている場合）
        // gapStart > gapEnd になる可能性がある場合（padding/marginなど）、gapStart と gapEnd を入れ替える
        if (gapStart > gapEnd) {
          const temp = gapStart;
          gapStart = gapEnd;
          gapEnd = temp;
        }

        // ✅ COLUMN_GROUP_FIX: gapStart === gapEnd の場合の処理（要素がくっついている場合）
        // gapStart === gapEnd の場合でも、ギャップとして扱う
        if (gapStart === gapEnd) {
          const EPS = 1; // 1px の許容範囲（端と同じ）
          gapEnd = gapStart + EPS; // 最小のギャップ範囲を確保
        }
      }

      // ✅ BUG-001 FIX: ギャップ範囲のチェックを緩和（カーソルがギャップの近くにある場合も検出）
      // ✅ Cursor準拠: 相対値 + 最低保証（小さいUI → 8px、大きいUI → 相対スケール）
      // ✅ COLUMN_GROUP_FIX: Gridと同じ8pxの最小許容範囲を使用（狭いgapでも検出できるように）
      // ✅ 重要: 固定値ではなく、コンテナサイズに応じた相対値を使用
      const containerSize = isRow ? containerBounds.width : containerBounds.height;
      const GAP_TOLERANCE = Math.max(8, containerSize * 0.01); // ✅ 最小8px（Gridと同じ）、最大はコンテナサイズの1%

      // ✅ COLUMN_GROUP_FIX: 左右上下の端のギャップ検出を完全対称に統一
      // 左右の端（i === 0 または i === children.length）の場合、コンテナの端に近ければ強制的に検出
      // RowとColumnで同じロジックを使用（縦か横かが違うだけで、根本的な仕様は同じ）
      let isInGap: boolean;
      if (i === 0) {
        // 左端/上端: コンテナの端に近ければ検出
        const containerEdge = isRow ? containerBounds.left : containerBounds.top;
        const edgeDistance = Math.abs(compareCoord - containerEdge);
        // ✅ COLUMN_GROUP_FIX: 左右上下完全対称 - すべての端で同じ許容範囲を使用
        const EDGE_TOLERANCE = GAP_TOLERANCE * 2; // すべての端で同じ許容範囲
        isInGap = edgeDistance <= EDGE_TOLERANCE || (compareCoord >= gapStart - GAP_TOLERANCE && compareCoord <= gapEnd + GAP_TOLERANCE);
      } else if (i === children.length) {
        // 右端/下端: コンテナの端に近ければ検出（左端/上端と完全に対称）
        const containerEdge = isRow ? containerRight : containerBottom;
        const edgeDistance = Math.abs(compareCoord - containerEdge);
        // ✅ COLUMN_GROUP_FIX: 左右上下完全対称 - すべての端で同じ許容範囲を使用
        const EDGE_TOLERANCE = GAP_TOLERANCE * 2; // 左端/上端と同じ許容範囲
        isInGap = edgeDistance <= EDGE_TOLERANCE || (compareCoord >= gapStart - GAP_TOLERANCE && compareCoord <= gapEnd + GAP_TOLERANCE);

        // ✅ COLUMN_GROUP_FIX: デバッグログ（右端/下端のギャップ検出を確認 - 常に出力）
        console.log('[DropResolver] 🔍 COLUMN_GROUP_FIX: right/bottom edge gap detection', {
          i,
          insertionIndex: i,
          compareCoord,
          containerEdge,
          edgeDistance,
          gapStart,
          gapEnd,
          GAP_TOLERANCE,
          EDGE_TOLERANCE: GAP_TOLERANCE * 2,
          isInGap,
          condition1: edgeDistance <= GAP_TOLERANCE * 2,
          condition2: compareCoord >= gapStart - GAP_TOLERANCE && compareCoord <= gapEnd + GAP_TOLERANCE,
          isRow,
          containerRight,
          containerBottom,
          containerBounds: {
            left: containerBounds.left,
            top: containerBounds.top,
            width: containerBounds.width,
            height: containerBounds.height,
            right: containerRight,
            bottom: containerBottom,
          },
          lastChild: children.length > 0 ? {
            elementId: children[children.length - 1].elementId,
            bounds: children[children.length - 1].bounds,
          } : null,
        });
      } else {
        // 要素間: 通常のギャップ検出
        isInGap = compareCoord >= gapStart - GAP_TOLERANCE && compareCoord <= gapEnd + GAP_TOLERANCE;
      }

      const gapCenter = (gapStart + gapEnd) / 2;
      // ✅ BUG-001 FIX: 距離計算を改善（ギャップ範囲内の場合は距離0、範囲外の場合は実際の距離）
      const distance = compareCoord >= gapStart && compareCoord <= gapEnd
        ? Math.abs(compareCoord - gapCenter) // ✅ ギャップ範囲内: 中心からの距離
        : Math.min(
            Math.abs(compareCoord - gapStart), // ✅ ギャップ開始位置からの距離
            Math.abs(compareCoord - gapEnd)    // ✅ ギャップ終了位置からの距離
          ) + GAP_TOLERANCE; // ✅ 範囲外の場合は許容範囲を加算

      if (isInGap) {
        // ✅ フェーズ6: tolerance内のgapを優先的に記録
        // ✅ ROW_LAYOUT_FIX: デバッグログ（右端のギャップ候補のみ - 常に出力）
        if (i === children.length) {
          console.log('[DropResolver] 🔍 ROW_LAYOUT_FIX: right edge gap candidate', {
            i,
            insertionIndex: i,
            gapStart,
            gapEnd,
            gapCenter,
            compareCoord,
            distance,
            isInGapRange: compareCoord >= gapStart && compareCoord <= gapEnd,
            nearestGapDistance,
            willUpdate: distance < nearestGapDistance,
            mouseX,
            mouseY,
            containerRight,
            containerBottom,
            lastChild: children.length > 0 ? {
              elementId: children[children.length - 1].elementId,
              bounds: children[children.length - 1].bounds,
            } : null,
          });
        }

        if (distance < nearestGapDistance) {
          nearestGapDistance = distance;
          nearestGapIndex = i;
        }
      } else {
        // ✅ フェーズ6: tolerance外でも距離を計算（fallback用）
        // gapCenterからの距離を計算（tolerance外でも）
        const fallbackDistance = Math.abs(compareCoord - gapCenter);
        if (fallbackDistance < nearestGapDistanceFallback) {
          nearestGapDistanceFallback = fallbackDistance;
          nearestGapIndexFallback = i;
        }
      }
    }

    // ✅ STEP 3: ガイド表示とinsertion決定の完全同期（GOLDEN RULE）
    // ✅ 「今表示されているガイド以外には絶対に drop させない」
    // ✅ guideRect を計算したロジックと insertion / insertionIndex を決めるロジックは
    // ✅ **同一の分岐・同一の座標条件** を使用すること

    // ✅ 候補1: before/after/between スロット（ギャップ検出ベース）
    // ✅ ROW_LAYOUT_FIX: デバッグログ（右端が選ばれた場合のみ - 常に出力）
    if (nearestGapIndex === children.length) {
      console.log('[DropResolver] 🔍 ROW_LAYOUT_FIX: right edge selected', {
        nearestGapDistance,
        nearestGapIndex,
        insertionIndex: nearestGapIndex,
        childrenCount: children.length,
        compareCoord,
        mouseX,
        mouseY,
        containerRight,
      });
    }

    if (nearestGapDistance < Infinity) {
      // ✅ CRITICAL: この insertionIndex で guideRect を計算し、この insertionIndex を必ず使用する
      insertionIndex = nearestGapIndex;

      // ✅ CRITICAL FIX: gap判定で使ったeffectiveIdをガイド描画にも渡す（Cursor仕様完全準拠）
      // gap判定・ガイド描画・drop適用で参照するchildrenを完全統一
      const guideRect = this.calculateBetweenGuideRect(
        containerNode,
        insertionIndex,
        isRow,
        children,
        containerBounds,
        effectiveId,
        mouseX,
        mouseY
      );
      if (guideRect) {
        // ✅ BUG-002 FIX: slotKind 判定のバグ修正
        // insertionIndex === 0 → 'before'
        // insertionIndex >= children.length → 'after'
        // それ以外（要素間）→ 'after'（要素の前に挿入）
        const slotKind: 'before' | 'after' =
          insertionIndex === 0 ? 'before' :
          insertionIndex >= children.length ? 'after' :
          'after'; // 要素間は 'after'（要素の前に挿入）
        const targetElementId = insertionIndex < children.length ? children[insertionIndex].elementId : undefined;

        // ✅ confidence は距離に基づく（近いほど高い）
        const gapSize = isRow ?
          (insertionIndex === 0 ? (children[0].bounds.left - containerBounds.left) :
           insertionIndex >= children.length ? (containerRight - children[children.length - 1].bounds.left - children[children.length - 1].bounds.width) :
           (children[insertionIndex].bounds.left - children[insertionIndex - 1].bounds.left - children[insertionIndex - 1].bounds.width)) :
          (insertionIndex === 0 ? (children[0].bounds.top - containerBounds.top) :
           insertionIndex >= children.length ? (containerBottom - children[children.length - 1].bounds.top - children[children.length - 1].bounds.height) :
           (children[insertionIndex].bounds.top - children[insertionIndex - 1].bounds.top - children[insertionIndex - 1].bounds.height));

        // ✅ BUG-004 FIX: between スロットの confidence を上げる（最小0.7）
        const confidence = Math.max(0.7, 1.0 - (nearestGapDistance / Math.max(gapSize, 20)));

        // ✅ CRITICAL FIX: gap判定・ガイド描画・drop適用で参照するIDを完全統一（Cursor仕様完全準拠）
        // containerId と insertionParentId を effectiveId に統一することで、
        // gap判定・ガイド描画・drop適用がすべて同じコンテナを参照する
        const actualContainerId = effectiveId ?? containerNode.elementId;
        const slot: Slot = {
          kind: slotKind,
          axis,
          containerId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一（gap判定・ガイド描画と同じ）
          insertionParentId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一（gap判定・ガイド描画と同じ）
          insertion: insertionIndex, // ✅ CRITICAL: guideRect を計算した insertionIndex を必ず使用
          insertionIndex, // ✅ CRITICAL: guideRect を計算した insertionIndex を必ず使用
          targetElementId,
          renderGuideRect: guideRect, // ✅ CRITICAL: この guideRect と insertionIndex は完全同期
          guideStyle: 'line',
          confidence,
        };

        // ✅ FIX: candidateSlots.push直前で必ずrenderGuideRectを保証
        this.ensureRenderGuideRect(slot, containerBounds, isRow);
        candidateSlots.push(slot);
      }
    }

    // ✅ フェーズ6: tolerance内のgapが見つからない場合、nearest gap fallbackを使用
    if (nearestGapDistance >= Infinity && nearestGapDistanceFallback < Infinity) {
      // ✅ fallback: 最も近いgapを使用（isFallbackフラグを設定）
      insertionIndex = nearestGapIndexFallback;

      // ✅ CRITICAL FIX: gap判定で使ったeffectiveIdをガイド描画にも渡す（Cursor仕様完全準拠）
      // gap判定・ガイド描画・drop適用で参照するchildrenを完全統一
      const guideRect = this.calculateBetweenGuideRect(
        containerNode,
        insertionIndex,
        isRow,
        children,
        containerBounds,
        effectiveId,
        mouseX,
        mouseY
      );
      if (guideRect) {
        // ✅ BUG-002 FIX: slotKind 判定のバグ修正
        const slotKind: 'before' | 'after' =
          insertionIndex === 0 ? 'before' :
          insertionIndex >= children.length ? 'after' :
          'after';
        const targetElementId = insertionIndex < children.length ? children[insertionIndex].elementId : undefined;

        // ✅ フェーズ6: fallbackのconfidenceは通常より低く設定（0.6程度）
        const confidence = 0.6;

        // ✅ CRITICAL FIX: gap判定・ガイド描画・drop適用で参照するIDを完全統一（Cursor仕様完全準拠）
        const actualContainerId = effectiveId ?? containerNode.elementId;
        const slot: Slot = {
          kind: slotKind,
          axis,
          containerId: actualContainerId,
          insertionParentId: actualContainerId,
          insertion: insertionIndex,
          insertionIndex,
          targetElementId,
          renderGuideRect: guideRect,
          guideStyle: 'line',
          confidence,
          isFallback: true, // ✅ フェーズ6: fallback slotとして明示
        };

        // ✅ フェーズ6: fallback使用時のログ
        console.log('[DropResolver] 🔍 PHASE6: nearest gap fallback used', {
          containerId: actualContainerId,
          insertionIndex,
          nearestGapDistanceFallback,
          gapCenter: isRow
            ? (insertionIndex === 0
                ? containerBounds.left
                : insertionIndex >= children.length
                  ? containerRight
                  : (children[insertionIndex - 1].bounds.left + children[insertionIndex - 1].bounds.width + children[insertionIndex].bounds.left) / 2)
            : (insertionIndex === 0
                ? containerBounds.top
                : insertionIndex >= children.length
                  ? containerBottom
                  : (children[insertionIndex - 1].bounds.top + children[insertionIndex - 1].bounds.height + children[insertionIndex].bounds.top) / 2),
          compareCoord,
          mouseX,
          mouseY,
        });

        // ✅ FIX: candidateSlots.push直前で必ずrenderGuideRectを保証
        this.ensureRenderGuideRect(slot, containerBounds, isRow);
        candidateSlots.push(slot);
      }
    } else if (nearestGapDistance >= Infinity && nearestGapDistanceFallback >= Infinity) {
      // ✅ フォールバック: ギャップが見つからない場合のみ、要素の中央位置を比較
      // ✅ この場合も、guideRect と insertionIndex を完全同期させる
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const childBounds = child.bounds;
        const childCoord = isRow
          ? childBounds.left + childBounds.width / 2
          : childBounds.top + childBounds.height / 2;

        if (compareCoord < childCoord) {
          insertionIndex = i;
          break;
        }
      }

      // ✅ CRITICAL: フォールバックでも、guideRect と insertionIndex を完全同期
      // ✅ CRITICAL FIX: gap判定で使ったeffectiveIdをガイド描画にも渡す（Cursor仕様完全準拠）
      // gap判定・ガイド描画・drop適用で参照するchildrenを完全統一
      const fallbackGuideRect = this.calculateBetweenGuideRect(
        containerNode,
        insertionIndex,
        isRow,
        children,
        containerBounds,
        effectiveId,
        mouseX,
        mouseY
      );
      if (fallbackGuideRect) {
        // ✅ BUG-002 FIX: slotKind 判定のバグ修正（フォールバックでも同様）
        const slotKind: 'before' | 'after' =
          insertionIndex === 0 ? 'before' :
          insertionIndex >= children.length ? 'after' :
          'after'; // 要素間は 'after'（要素の前に挿入）
        const targetElementId = insertionIndex < children.length ? children[insertionIndex].elementId : undefined;

        // ✅ CRITICAL FIX: gap判定・ガイド描画・drop適用で参照するIDを完全統一（Cursor仕様完全準拠）
        // containerId と insertionParentId を effectiveId に統一することで、
        // gap判定・ガイド描画・drop適用がすべて同じコンテナを参照する
        const actualContainerId = effectiveId ?? containerNode.elementId;
        const fallbackSlot: Slot = {
          kind: slotKind,
          axis,
          containerId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一（gap判定・ガイド描画と同じ）
          insertionParentId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一（gap判定・ガイド描画と同じ）
          insertion: insertionIndex, // ✅ CRITICAL: guideRect を計算した insertionIndex を必ず使用
          insertionIndex, // ✅ CRITICAL: guideRect を計算した insertionIndex を必ず使用
          targetElementId,
          renderGuideRect: fallbackGuideRect, // ✅ CRITICAL: この guideRect と insertionIndex は完全同期
          guideStyle: 'line',
          confidence: 0.7, // ✅ フォールバックは低めの confidence
          isFallback: true, // ✅ フェーズ6: fallback slotとして明示
        };

        // ✅ FIX: candidateSlots.push直前で必ずrenderGuideRectを保証
        this.ensureRenderGuideRect(fallbackSlot, containerBounds, isRow);
        candidateSlots.push(fallbackSlot);
      }
    }

    // ✅ フェーズ7: Conditional Inside / Empty
    // betweenが論理的に存在しない場合、または意図的に中に入れたい場合のみinside/emptyを返す
    // 条件：
    // 1. betweenが論理的に存在しない（children.length <= 1）
    // 2. コンテナ自体に「中に入れる意味」がある（flex/block）
    // 3. マウスがcontainerの中心領域にいる（isInsideIntent）
    const hasGap = nearestGapDistance < Infinity || nearestGapDistanceFallback < Infinity;
    const hasStrictGap = nearestGapDistance < Infinity;

    // ✅ PHASE12.9: group-in-group 判定
    // block は group-in-group 判定から除外（block-in-block で inside が過剰に出るのを防ぐ）
    const draggedIsGroup = draggedNode.isContainer === true;
    const candidateIsGroup =
      containerNode.layoutType === 'flex-row' ||
      containerNode.layoutType === 'flex-column' ||
      containerNode.layoutType === 'grid';
    const isGroupInGroup = draggedIsGroup && candidateIsGroup;

    // ✅ フェーズ7: inside/emptyを返していい条件
    // ✅ 罠2対策: 深いネストで inside が出過ぎるのを防ぐ（allowInsideDepthLimit = 1 or 2）
    const ALLOW_INSIDE_DEPTH_LIMIT = 2;
    const allowInside =
      depth <= ALLOW_INSIDE_DEPTH_LIMIT &&
      (
        // betweenが論理的に存在しない
        children.length <= 1 ||
        // コンテナ自体に「中に入れる意味」がある（flex/block）
        (effectiveLayoutType === 'flex-row' || effectiveLayoutType === 'flex-column' || containerNode.layoutType === 'block')
      );

    // ✅ フェーズ7対策: inside intent hysteresis（ちらつき防止）
    // 一度 inside に入ったら数px/数ms固定
    const INSIDE_INTENT_HYSTERESIS_DISTANCE = 15; // 15px以内なら固定
    const INSIDE_INTENT_HYSTERESIS_DURATION_MS = 200; // 200ms以内なら固定
    const actualContainerId = effectiveId ?? containerNode.elementId;
    const isInsideIntentHysteresis =
      this.lastInsideIntentContainerId === actualContainerId &&
      (Date.now() - this.lastInsideIntentTimestamp) < INSIDE_INTENT_HYSTERESIS_DURATION_MS &&
      Math.abs(mouseX - this.lastInsideIntentMouseX) < INSIDE_INTENT_HYSTERESIS_DISTANCE &&
      Math.abs(mouseY - this.lastInsideIntentMouseY) < INSIDE_INTENT_HYSTERESIS_DISTANCE;

    // ✅ フェーズ7: マウスがcontainerの中心領域にいるか（isInsideIntent）
    // ✅ PHASE12.9: container size に応じて割合計算（Cursor準拠）
    const INNER_ZONE_PADDING = Math.min(
      30,
      Math.min(containerBounds.width, containerBounds.height) * 0.25
    ); // ✅ 小さいコンテナでも inside が出るように、大きいコンテナでは適切な割合で判定
    const isInsideIntentRaw =
      mouseX >= containerBounds.left + INNER_ZONE_PADDING &&
      mouseX <= containerRight - INNER_ZONE_PADDING &&
      mouseY >= containerBounds.top + INNER_ZONE_PADDING &&
      mouseY <= containerBottom - INNER_ZONE_PADDING;

    // ✅ フェーズ7対策: hysteresisを適用
    const isInsideIntent = isInsideIntentRaw || isInsideIntentHysteresis;

    // ✅ PHASE12.9: group-in-group 用 inside 判定（edge exclusion方式）
    // Cursor準拠: 端すぎる位置だけ除外（between操作を邪魔しない）
    // hysteresis に依存せず、常時安定して動作
    const EDGE_EXCLUSION_PX = 12; // ✅ Cursor相当（10〜16が安定）
    const isPointerInsideContainerLoose = isGroupInGroup && (
      mouseX > containerBounds.left + EDGE_EXCLUSION_PX &&
      mouseX < containerRight - EDGE_EXCLUSION_PX &&
      mouseY > containerBounds.top + EDGE_EXCLUSION_PX &&
      mouseY < containerBottom - EDGE_EXCLUSION_PX
    );

    // ✅ PHASE12.9: group-in-group の時は strict gap でも inside を許可
    // ✅ DND_FIX_GROUP_HIGHLIGHT: 複数子かつマウスがギャップ上にある場合は inside を出さない（親の枠で複数グループを囲まない）
    const allowInsideEvenWithStrictGap = isPointerInsideContainerLoose &&
      !(children.length >= 2 && nearestGapDistance < Infinity);

    // ✅ フェーズ7: Conditional Inside / Empty
    // ✅ PHASE12.9: 条件式をシンプル化
    // leaf: 今まで通り（!hasStrictGap && (children.length <= 1 || isInsideIntent)）
    // group-in-group: gap無視でinside（allowInsideEvenWithStrictGap）
    // block-in-block: 影響なし
    if (
      allowInside &&
      (
        (!hasStrictGap && (children.length <= 1 || isInsideIntent)) ||
        allowInsideEvenWithStrictGap
      )
    ) {
      // ✅ PHASE12.9: group-in-group の時は confidence を 0.86 以上に設定（Phase12.7を通すため）
      // ✅ フェーズ7: inside slotのconfidenceは0.4〜0.5（fallbackとして弱く設定）
      const baseConfidence = children.length === 0 ? 0.5 : 0.4; // emptyは0.5、insideは0.4
      const confidence = isGroupInGroup ? Math.max(0.86, baseConfidence) : baseConfidence; // ✅ group-in-group は 0.86 以上

      const renderGuideRect = this.boundsToDOMRect(containerBounds);

      // ✅ CRITICAL FIX: gap判定・ガイド描画・drop適用で参照するIDを完全統一（Cursor仕様完全準拠）
      const actualContainerId = effectiveId ?? containerNode.elementId;

      // ✅ フェーズ7: empty slot（children.length === 0）
      if (children.length === 0) {
        const emptySlot: Slot = {
          kind: 'empty',
          axis,
          containerId: actualContainerId,
          insertionParentId: actualContainerId,
          insertion: 0,
          insertionIndex: 0,
          renderGuideRect,
          guideStyle: 'dashed',
          confidence,
          isFallback: true, // ✅ フェーズ7: fallback slotとして明示
        };
        // ✅ FIX: candidateSlots.push直前で必ずrenderGuideRectを保証
        this.ensureRenderGuideRect(emptySlot, containerBounds, false);
        candidateSlots.push(emptySlot);
      } else {
        // ✅ フェーズ7: inside slot（children.length > 0）
        // ✅ DND_FIX_GROUP_INTERNAL: マウス位置に応じた挿入位置を使用（常に末尾にしない）
        const insideInsertionIndex = nearestGapDistance < Infinity
          ? nearestGapIndex
          : (nearestGapDistanceFallback < Infinity ? nearestGapIndexFallback : children.length);
        const insideSlot: Slot = {
          kind: 'inside',
          axis,
          containerId: actualContainerId,
          insertionParentId: actualContainerId,
          insertion: insideInsertionIndex,
          insertionIndex: insideInsertionIndex,
          renderGuideRect,
          guideStyle: 'outline',
          confidence,
          isFallback: true, // ✅ フェーズ7: fallback slotとして明示
        };
        // ✅ FIX: candidateSlots.push直前で必ずrenderGuideRectを保証
        this.ensureRenderGuideRect(insideSlot, containerBounds, false);
        candidateSlots.push(insideSlot);
      }

      // ✅ フェーズ7対策: inside intentを記録（hysteresis用）
      if (isInsideIntentRaw) {
        this.lastInsideIntentContainerId = actualContainerId;
        this.lastInsideIntentTimestamp = Date.now();
        this.lastInsideIntentMouseX = mouseX;
        this.lastInsideIntentMouseY = mouseY;
      }

      // ✅ フェーズ7: Conditional Inside / Empty使用時のログ
      // ✅ PHASE12.9: group-in-group 情報を追加
      // ✅ FIX3: 追加検証ログ
      console.log('[DropResolver] 🔍 PHASE7+FIX3: conditional inside/empty used', {
        containerId: actualContainerId,
        containerLayoutType: containerNode.layoutType,
        effectiveLayoutType,
        kind: children.length === 0 ? 'empty' : 'inside',
        childrenLength: children.length,
        allowInside,
        isInsideIntent,
        isInsideIntentRaw,
        isInsideIntentHysteresis,
        hasStrictGap,
        depth,
        confidence,
        // ✅ FIX3: group-in-group 判定の詳細
        draggedIsGroup, // ✅ draggedNode が group かどうか
        candidateIsGroup, // ✅ containerNode が group かどうか
        isGroupInGroup, // ✅ group-in-group かどうか
        allowInsideEvenWithStrictGap, // ✅ gap があっても inside を許可するか
        isPointerInsideContainerLoose, // ✅ edge exclusion判定
        innerZonePadding: INNER_ZONE_PADDING, // ✅ デバッグ用
        edgeExclusionPx: EDGE_EXCLUSION_PX, // ✅ デバッグ用
        mousePos: { x: mouseX, y: mouseY },
        containerBounds,
      });
    }

    // ✅ FIX 1: confidence で 1つに絞る（Cursor 2.x準拠）
    if (candidateSlots.length === 0) {
      return null;
    }

    // ✅ GUIDE_GLITCH_FIX STEP C: ソートの安定化（tie-breakerの追加）
    // ✅ フェーズ7: fallback betweenとfallback insideの順序を明確化
    // ✅ DND_FIX_GROUP_INTERNAL: グループ内では between（挿入位置の線）を inside（全体枠）より優先
    // ソート順：non-fallback between → group-in-group inside → その他 non-fallback → fallback between → fallback inside
    // 同点の場合でも順序が揺れないように決定論的なソートを実装
    candidateSlots.sort((a, b) => {
      // 1. ✅ DND_FIX_GROUP_INTERNAL: 非fallbackの between を最優先（グループ内で「間のガイド」を表示）
      const aIsNonFallbackBetween = !(a.isFallback ?? false) && (a.kind === 'before' || a.kind === 'after' || a.kind === 'between');
      const bIsNonFallbackBetween = !(b.isFallback ?? false) && (b.kind === 'before' || b.kind === 'after' || b.kind === 'between');
      if (aIsNonFallbackBetween !== bIsNonFallbackBetween) {
        return aIsNonFallbackBetween ? -1 : 1;
      }

      // 2. ✅ PHASE12.9: group-in-group inside を次に優先（inside の中では最優先）
      const aIsGroupInGroupInside = a.kind === 'inside' && a.confidence >= 0.86;
      const bIsGroupInGroupInside = b.kind === 'inside' && b.confidence >= 0.86;
      if (aIsGroupInGroupInside !== bIsGroupInGroupInside) {
        return aIsGroupInGroupInside ? -1 : 1;
      }

      // 3. ✅ フェーズ7: 非fallbackを常に優先
      const aIsFallback = a.isFallback ?? false;
      const bIsFallback = b.isFallback ?? false;
      if (aIsFallback !== bIsFallback) {
        return aIsFallback ? 1 : -1; // 非fallbackを優先
      }

      // 4. ✅ フェーズ7: 同じfallbackカテゴリ内で、betweenを優先（fallback between > fallback inside）
      if (aIsFallback && bIsFallback) {
        const aIsBetween = a.kind === 'before' || a.kind === 'after' || a.kind === 'between';
        const bIsBetween = b.kind === 'before' || b.kind === 'after' || b.kind === 'between';
        if (aIsBetween !== bIsBetween) {
          return aIsBetween ? -1 : 1; // betweenを優先
        }
      }

      // 3. 同じカテゴリ内でconfidence（高い順）
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }

      // 4. insertionIndex（小さい順）
      const aIndex = a.insertionIndex ?? Infinity;
      const bIndex = b.insertionIndex ?? Infinity;
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }

      // 5. kind（betweenを優先）
      if (a.kind !== b.kind) {
        if (a.kind === 'between' && b.kind !== 'between') return -1;
        if (b.kind === 'between' && a.kind !== 'between') return 1;
      }

      // 6. containerId（文字列比較、最後の保険）
      return a.containerId.localeCompare(b.containerId);
    });
    const slot = candidateSlots[0];

    // ✅ DND_GUIDE_GLITCH_ROOT_CAUSE_REPORT_PHASE0: B. 『betweenが発火していない』を証明するログ（flex/column）
    const actualContainerIdForLog = effectiveId ?? containerNode.elementId;
    console.log('[DnD] FLEX_SLOT_RESULT', {
      containerId: actualContainerIdForLog,
      layout: isRow ? 'row' : 'column',
      producedKind: slot?.kind,
      confidence: slot?.confidence,
      insertionIndex: (slot as any)?.insertionIndex,
      mouse: { x: mouseX, y: mouseY },
      containerBounds,
      childCount: children.length,
    });

    return slot;
  }

  /**
   * 親コンテナを探索
   * ✅ STEP 6: 外（親へ）ガイド用
   * ✅ FIX: draggedNode 一致時も探索を継続（親の親まで探索）
   *
   * @param containerNode 現在のコンテナノード
   * @param draggedNode ドラッグ中のノード
   * @param maxDepth 最大探索深度
   * @returns 親コンテナノード または null
   */
  private findParentContainer(
    containerNode: LayoutNode,
    draggedNode: LayoutNode,
    maxDepth: number
  ): LayoutNode | null {
    if (!this.layoutTree || !containerNode.parentId || maxDepth <= 0) {
      return null;
    }

    let current: LayoutNode | null = this.layoutTree.findById(containerNode.parentId);
    let depth = 0;

    // ✅ FIX 2: draggedNode 一致時も探索を継続（親の親まで探索）
    while (current && depth < maxDepth) {
      // ✅ コンテナかつ draggedNode でない場合は返す
      if (current.isContainer && current.elementId !== draggedNode.elementId) {
        return current;
      }
      // ✅ draggedNode に一致しても探索を継続（親の親まで探索）
      current = current.parentId ? this.layoutTree.findById(current.parentId) : null;
      depth++;
    }

    return null;
  }

  /**
   * 間に入れる（between）ガイド矩形を計算
   * ✅ STEP 4: 要素間の境界位置にラインを表示
   * ✅ BUG-001 FIX: カーソル位置にガイドを合わせる
   * ✅ CRITICAL FIX: gap判定・ガイド描画・drop適用で参照するchildrenを完全統一
   *    - gap判定で使ったeffectiveIdと同じIDを使ってchildrenを取得
   *    - containerNode.elementIdではなくeffectiveIdを使用（Cursor仕様完全準拠）
   *
   * @param containerNode コンテナノード
   * @param insertionIndex 挿入位置
   * @param isRow 行方向か
   * @param filteredChildren フィルタ済み子要素（ドラッグ中の要素を除外）
   * @param containerBounds コンテナの境界（effectiveBounds、gap判定で使ったものと同じ）
   * @param effectiveId 実際に子要素が並んでいる親の要素ID（gap判定で使ったものと同じ）
   * @param mouseX カーソルX座標（オプション）
   * @param mouseY カーソルY座標（オプション）
   * @returns ガイド矩形（viewport座標）
   */
  private calculateBetweenGuideRect(
    containerNode: LayoutNode,
    insertionIndex: number,
    isRow: boolean,
    filteredChildren: LayoutNode[] | undefined,
    containerBounds: LayoutNode['bounds'],
    effectiveId?: string,
    mouseX?: number,
    mouseY?: number
  ): DOMRect | null {
    if (!this.layoutTree) {
      return null;
    }

    // ✅ CRITICAL FIX: gap判定で使ったeffectiveIdと同じIDを使ってchildrenを取得
    // gap判定・ガイド描画・drop適用で参照するchildrenを完全統一（Cursor仕様完全準拠）
    // containerNode.elementIdではなくeffectiveIdを使用することで、参照元のズレを完全に解消
    const actualChildrenParentId = effectiveId ?? containerNode.elementId;
    const children = filteredChildren ?? this.layoutTree.getChildren(actualChildrenParentId);
    // NOTE: containerBounds is passed from resolveFlexSlot() and must match the bounds used for hit-testing
    // (effectiveBounds preferred). Never re-read containerNode.bounds here.
    // NOTE: effectiveId is passed from resolveFlexSlot() and must match the ID used for gap detection.
    // Never use containerNode.elementId here to avoid reference mismatch.
    const containerRight = containerBounds.left + containerBounds.width;
    const containerBottom = containerBounds.top + containerBounds.height;


    if (children.length === 0) {
      // ✅ 空のコンテナ: コンテナの中央にガイドを表示
      const guideRect = isRow
        ? new DOMRect(containerBounds.left, containerBounds.top, 2, containerBounds.height)
        : new DOMRect(containerBounds.left, containerBounds.top, containerBounds.width, 2);

      // ✅ DND_GUIDE_GLITCH_ROOT_CAUSE_REPORT_PHASE0: C. guideRect座標系の一致確認（viewport基準か）
      console.log('[DnD] RECT_COORD_CHECK', {
        kind: 'between (empty)',
        insertionIndex,
        containerBounds,
        firstChild: null,
        lastChild: null,
        guideRect: guideRect ? {
          x: guideRect.x,
          y: guideRect.y,
          w: guideRect.width,
          h: guideRect.height,
        } : null,
        windowScroll: typeof window !== 'undefined' ? { x: window.scrollX, y: window.scrollY } : null,
      });

      return guideRect;
    }

    if (insertionIndex >= children.length) {
      // ✅ 最後に挿入: 最後の子要素の後ろにガイドを表示
      const lastChild = children[children.length - 1];
      const bounds = lastChild.bounds;

      if (isRow) {
        // ✅ 縦線（width=2px）
        // ✅ COLUMN_GROUP_FIX: コンテナ全体の高さを使用（要素の高さではなく）
        // ✅ BUG-003 FIX: 一番右は要素の右端にぴったりくっつける（左端と同じ挙動）
        // ✅ 左端と同じロジック: 要素の端に固定（カーソル位置に依存しない）
        const guideX = bounds.left + bounds.width;
        const guideRect = new DOMRect(guideX, containerBounds.top, 2, containerBounds.height);
        return guideRect;
      } else {
        // ✅ 横線（height=2px）
        // ✅ COLUMN_GROUP_FIX: コンテナ全体の幅を使用（要素の幅ではなく）
        // ✅ BUG-003 FIX: 一番下は要素の下端にぴったりくっつける（上端と同じ挙動）
        // ✅ 上端と同じロジック: 要素の端に固定（カーソル位置に依存しない）
        const guideY = bounds.top + bounds.height;
        const guideRect = new DOMRect(containerBounds.left, guideY, containerBounds.width, 2);
        return guideRect;
      }
    }

    if (insertionIndex === 0) {
      // ✅ 最初に挿入: 最初の子要素の前にガイドを表示
      const firstChild = children[0];
      const bounds = firstChild.bounds;
      if (isRow) {
        // ✅ 縦線（width=2px）
        // ✅ COLUMN_GROUP_FIX: コンテナ全体の高さを使用（要素の高さではなく）
        // ✅ BUG-003 FIX: 一番左は要素の左端にぴったりくっつける（一番右と同じ挙動）
        // ✅ 右端と同じロジック: 要素の端に固定（カーソル位置に依存しない）
        const guideX = bounds.left;
        const guideRect = new DOMRect(guideX, containerBounds.top, 2, containerBounds.height);

        // ✅ DND_GUIDE_GLITCH_ROOT_CAUSE_REPORT_PHASE0: C. guideRect座標系の一致確認（viewport基準か）
        console.log('[DnD] RECT_COORD_CHECK', {
          kind: 'between (start)',
          insertionIndex,
          containerBounds,
          firstChild: children[0]?.bounds,
          lastChild: children[children.length - 1]?.bounds,
          guideRect: guideRect ? {
            x: guideRect.x,
            y: guideRect.y,
            w: guideRect.width,
            h: guideRect.height,
          } : null,
          windowScroll: typeof window !== 'undefined' ? { x: window.scrollX, y: window.scrollY } : null,
        });

        return guideRect;
      } else {
        // ✅ 横線（height=2px）
        // ✅ COLUMN_GROUP_FIX: コンテナ全体の幅を使用（要素の幅ではなく）
        // ✅ BUG-003 FIX: 一番上は要素の上端にぴったりくっつける（一番下と同じ挙動）
        // ✅ 下端と同じロジック: 要素の端に固定（カーソル位置に依存しない）
        const guideY = bounds.top;
        const guideRect = new DOMRect(containerBounds.left, guideY, containerBounds.width, 2);

        // ✅ DND_GUIDE_GLITCH_ROOT_CAUSE_REPORT_PHASE0: C. guideRect座標系の一致確認（viewport基準か）
        console.log('[DnD] RECT_COORD_CHECK', {
          kind: 'between (start)',
          insertionIndex,
          containerBounds,
          firstChild: children[0]?.bounds,
          lastChild: children[children.length - 1]?.bounds,
          guideRect: guideRect ? {
            x: guideRect.x,
            y: guideRect.y,
            w: guideRect.width,
            h: guideRect.height,
          } : null,
          windowScroll: typeof window !== 'undefined' ? { x: window.scrollX, y: window.scrollY } : null,
        });

        return guideRect;
      }
    }

    // ✅ 要素間: 前の要素の後ろと次の要素の前の間
    const prevChild = children[insertionIndex - 1];
    const nextChild = children[insertionIndex];
    const prevBounds = prevChild.bounds;
    const nextBounds = nextChild.bounds;

    if (isRow) {
      // ✅ 縦線（width=2px）
      // ✅ GUIDE_GLITCH_FIX: gapCenterを優先（カーソル位置に依存しない）
      const prevRight = prevBounds.left + prevBounds.width;
      const nextLeft = nextBounds.left;
      const gapCenter = (prevRight + nextLeft) / 2;
      const guideHeight = Math.max(prevBounds.height, nextBounds.height);
      const guideTop = Math.min(prevBounds.top, nextBounds.top);
      // ✅ GUIDE_GLITCH_FIX: gapCenterを優先し、コンテナ境界内に制限
      const guideX = Math.max(containerBounds.left, Math.min(gapCenter - 1, containerRight - 2));
      const guideRect = new DOMRect(guideX, guideTop, 2, guideHeight);
      return guideRect;
    } else {
      // ✅ 横線（height=2px）
      // ✅ GUIDE_GLITCH_FIX: gapCenterを優先（カーソル位置に依存しない）
      const prevBottom = prevBounds.top + prevBounds.height;
      const nextTop = nextBounds.top;
      const gapCenter = (prevBottom + nextTop) / 2;
      const guideWidth = Math.max(prevBounds.width, nextBounds.width);
      const guideLeft = Math.min(prevBounds.left, nextBounds.left);
      // ✅ GUIDE_GLITCH_FIX: gapCenterを優先し、コンテナ境界内に制限
      const guideY = Math.max(containerBounds.top, Math.min(gapCenter - 1, containerBottom - 2));
      const guideRect = new DOMRect(guideLeft, guideY, guideWidth, 2);

      // ✅ DND_GUIDE_GLITCH_ROOT_CAUSE_REPORT_PHASE0: C. guideRect座標系の一致確認（viewport基準か）
      console.log('[DnD] RECT_COORD_CHECK', {
        kind: 'between',
        insertionIndex,
        containerBounds,
        firstChild: children[0]?.bounds,
        lastChild: children[children.length - 1]?.bounds,
        guideRect: guideRect ? {
          x: guideRect.x,
          y: guideRect.y,
          w: guideRect.width,
          h: guideRect.height,
        } : null,
        windowScroll: typeof window !== 'undefined' ? { x: window.scrollX, y: window.scrollY } : null,
      });

      return guideRect;
    }
  }

  /**
   * Grid スロットを解決
   * ✅ STEP 4: grid: cell中心距離で最近傍判定
   * ✅ CRITICAL FIX: effectiveId 基準に一本化（gap判定・ガイド描画・drop適用で参照するIDを完全統一）
   */
  private resolveGridSlot(
    containerNode: LayoutNode,
    draggedNode: LayoutNode,
    mouseX: number,
    mouseY: number,
    containerBounds?: LayoutNode['bounds'],
    effectiveId?: string
  ): Slot | null {
    if (!this.layoutTree) {
      return null;
    }

    // ✅ CRITICAL FIX: effectiveId 基準に一本化
    // effectiveId は実際に子要素が並んでいる親の要素ID（wrapper: grid または block親）
    // フォールバック（containerNode.elementId）は安全のため残すが、通常は使用されない
    const actualChildrenParentId = effectiveId ?? containerNode.elementId;
    const children = this.layoutTree.getChildren(actualChildrenParentId);
    const actualContainerBounds = containerBounds ?? containerNode.bounds;

    // ✅ CRITICAL FIX: effectiveId 基準に一本化
    // containerId と insertionParentId を effectiveId に統一することで、
    // gap判定・ガイド描画・drop適用がすべて同じコンテナを参照する
    const insertionParentId = effectiveId ?? containerNode.elementId;

    if (children.length === 0) {
      // ✅ 空のGrid: 最初のセルに挿入
      // ✅ CRITICAL FIX: effectiveId 基準に一本化
      const actualContainerId = effectiveId ?? containerNode.elementId;
      return {
        kind: 'grid',
        axis: 'grid',
        containerId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一
        insertionParentId, // ✅ CRITICAL FIX: effectiveId に統一
        insertion: 0,
        insertionIndex: 0,
        renderGuideRect: this.boundsToDOMRect(actualContainerBounds),
        guideStyle: 'outline', // ✅ STEP 4: grid は outline
        confidence: 1.0,
        targetRowIndex: 0,
        targetColumnIndex: 0,
      };
    }

    // ✅ STEP 4: grid: cell中心距離で最近傍判定
    let nearestCell: LayoutNode | null = null;
    let nearestDistance = Infinity;
    let nearestRowIndex = 0;
    let nearestColumnIndex = 0;

    for (const child of children) {
      const childBounds = child.bounds;
      const cellCenterX = childBounds.left + childBounds.width / 2;
      const cellCenterY = childBounds.top + childBounds.height / 2;
      const distance = Math.sqrt(
        Math.pow(mouseX - cellCenterX, 2) + Math.pow(mouseY - cellCenterY, 2)
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCell = child;
        // ✅ Grid用の行/列インデックスは簡易実装（TODO: 実測ベースの track 計算）
        nearestRowIndex = 0;
        nearestColumnIndex = 0;
      }
    }

    if (nearestCell) {
      // ✅ CRITICAL FIX: effectiveId 基準に一本化
      const actualContainerId = effectiveId ?? containerNode.elementId;
      const slot: Slot = {
        kind: 'grid',
        axis: 'grid',
        containerId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一
        insertionParentId, // ✅ CRITICAL FIX: effectiveId に統一
        insertion: 0,
        insertionIndex: 0,
        renderGuideRect: this.boundsToDOMRect(nearestCell.bounds),
        guideStyle: 'outline', // ✅ STEP 4: grid は outline
        confidence: 1.0,
        targetRowIndex: nearestRowIndex,
        targetColumnIndex: nearestColumnIndex,
      };

      return slot;
    }

    // ✅ フォールバック
    // ✅ CRITICAL FIX: effectiveId 基準に一本化
    const actualContainerId = effectiveId ?? containerNode.elementId;
    return {
      kind: 'grid' as const,
      axis: 'grid',
      containerId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一
      insertionParentId, // ✅ CRITICAL FIX: effectiveId に統一
      insertion: 0,
      insertionIndex: 0,
      renderGuideRect: this.boundsToDOMRect(actualContainerBounds),
      guideStyle: 'outline',
      confidence: 0.5,
      targetRowIndex: 0,
      targetColumnIndex: 0,
    };
  }

  /**
   * Block スロットを解決
   * ✅ SCROLL_AND_GLOBAL_LAYER: blockレイアウトを flex-column 相当として扱い、子要素間に縦方向の between slot を生成
   */
  private resolveBlockSlot(
    containerNode: LayoutNode,
    draggedNode: LayoutNode,
    mouseX: number,
    mouseY: number,
    containerBounds?: LayoutNode['bounds'],
    effectiveId?: string,
    depth: number = 0 // ✅ フェーズ7対策: depthを追加（深いネストでinsideが出過ぎるのを防ぐ）
  ): Slot | null {
    // ✅ BLOCK_AND_PARENT: 常に出力されるログ（DEBUG_DNDに関係なく）
    console.log('[DropResolver] 🔍 BLOCK_SLOT_ALWAYS: resolveBlockSlot called', {
      containerId: containerNode.elementId,
      actualContainerId: effectiveId ?? containerNode.elementId,
      hasLayoutTree: !!this.layoutTree,
      draggedNodeId: draggedNode.elementId,
      mouseX,
      mouseY
    });

    if (!this.layoutTree) {
      console.warn('[DropResolver] ⚠️ BLOCK_SLOT_ALWAYS: layoutTree is null, returning null');
      return null;
    }

    const actualContainerBounds = containerBounds ?? containerNode.bounds;
    const actualContainerId = effectiveId ?? containerNode.elementId;

    // ✅ 子要素を取得（effectiveId基準）
    const children = this.layoutTree.getChildren(actualContainerId);

    // ✅ BLOCK_AND_PARENT: 常に出力されるログ（DEBUG_DNDに関係なく）
    console.log('[DropResolver] 🔍 BLOCK_SLOT_ALWAYS: children retrieved', {
      actualContainerId,
      childrenCount: children.length,
      childrenIds: children.map(c => c.elementId),
      containerBounds: actualContainerBounds
    });

    // ✅ BLOCK_AND_PARENT: 必須デバッグログ（DEBUG_DNDフラグで制御）
    const DEBUG_DND = typeof window !== 'undefined' && (window as any).DEBUG_DND === true;
    if (DEBUG_DND) {
      console.log('[DropResolver] 🔍 BLOCK_SLOT_DEBUG: resolveBlockSlot (detailed)', {
        containerId: containerNode.elementId,
        actualContainerId,
        effectiveId,
        childrenCount: children.length,
        childrenIds: children.map(c => c.elementId),
        children: children.map(c => ({
          id: c.elementId,
          bounds: c.bounds,
          layoutType: c.layoutType
        })),
        draggedNodeId: draggedNode.elementId,
        mouseX,
        mouseY,
        containerBounds: actualContainerBounds,
        hasEffectiveBounds: containerBounds !== undefined
      });
    }

    // ✅ 子要素がない場合は empty slot を返す
    if (children.length === 0) {
      return {
        kind: 'empty',
        axis: 'column', // ✅ blockレイアウトは縦方向
        containerId: actualContainerId,
        insertionParentId: actualContainerId,
        insertion: undefined,
        insertionIndex: 0,
        renderGuideRect: this.boundsToDOMRect(actualContainerBounds),
        guideStyle: 'dashed',
        confidence: 0.8,
      };
    }

    // ✅ BLOCK_AND_PARENT: draggedNodeを除外してフィルタ（Cursor同等）
    const filteredChildren = children.filter(child => {
      // ✅ ドラッグ中の要素を除外
      if (child.elementId === draggedNode.elementId) {
        return false;
      }
      // ✅ boundsが無効な要素を除外
      if (!child.bounds || child.bounds.width <= 0 || child.bounds.height <= 0) {
        return false;
      }
      return true;
    });

    // ✅ 子要素がない場合は empty slot を返す（フィルタ後）
    if (filteredChildren.length === 0) {
      // ✅ BLOCK_AND_PARENT: 常に出力されるログ（DEBUG_DNDに関係なく）
      console.log('[DropResolver] 🔍 BLOCK_SLOT_ALWAYS: no children after filter, returning empty slot', {
        originalChildrenCount: children.length,
        filteredChildrenCount: filteredChildren.length,
        draggedNodeId: draggedNode.elementId
      });
      const emptySlot = {
        kind: 'empty' as const,
        axis: 'column' as const, // ✅ blockレイアウトは縦方向
        containerId: actualContainerId,
        insertionParentId: actualContainerId,
        insertion: undefined,
        insertionIndex: 0,
        renderGuideRect: this.boundsToDOMRect(actualContainerBounds),
        guideStyle: 'dashed' as const,
        confidence: 0.8,
      };
      console.log('[DropResolver] 🔍 BLOCK_SLOT_ALWAYS: empty slot created', {
        hasGuideRect: !!emptySlot.renderGuideRect,
        guideRect: emptySlot.renderGuideRect ? {
          left: emptySlot.renderGuideRect.left,
          top: emptySlot.renderGuideRect.top,
          width: emptySlot.renderGuideRect.width,
          height: emptySlot.renderGuideRect.height
        } : null
      });
      return emptySlot;
    }

    // ✅ 子要素のboundsをY方向でソート（blockレイアウトは縦並び）
    const sortedChildren = [...filteredChildren].sort((a, b) => {
      const aTop = a.bounds.top;
      const bTop = b.bounds.top;
      if (aTop !== bTop) {
        return aTop - bTop;
      }
      // 同じY座標の場合は左から右へ
      return a.bounds.left - b.bounds.left;
    });

    if (DEBUG_DND) {
      console.log('[DropResolver] 🔍 BLOCK_SLOT_DEBUG: sorted children', {
        sortedCount: sortedChildren.length,
        sortedIds: sortedChildren.map(c => c.elementId),
        sortedBounds: sortedChildren.map(c => ({ id: c.elementId, top: c.bounds.top, bottom: c.bounds.top + c.bounds.height }))
      });
    }

    // ✅ mouseY に基づいて insertionIndex を算出
    const containerTop = actualContainerBounds.top;
    const containerBottom = actualContainerBounds.top + actualContainerBounds.height;
    const GAP_TOLERANCE = 8; // ✅ 最小8px（flex-columnと同じ）

    // ✅ 上端のギャップ（i === 0）
    if (mouseY < sortedChildren[0].bounds.top) {
      const edgeDistance = Math.abs(mouseY - containerTop);
      const EDGE_TOLERANCE = GAP_TOLERANCE * 2;
      if (edgeDistance <= EDGE_TOLERANCE || mouseY <= sortedChildren[0].bounds.top + GAP_TOLERANCE) {
        const guideRect = this.calculateBetweenGuideRect(
          containerNode,
          0,
          false, // ✅ blockは縦方向（isRow = false）
          sortedChildren,
          actualContainerBounds,
          actualContainerId,
          mouseX,
          mouseY
        );
        if (guideRect) {
          if (DEBUG_DND) {
            console.log('[DropResolver] 🔍 BLOCK_SLOT_DEBUG: top edge gap detected', {
              insertionIndex: 0,
              guideRect: { left: guideRect.left, top: guideRect.top, width: guideRect.width, height: guideRect.height }
            });
          }
          return {
            kind: 'between',
            axis: 'column',
            containerId: actualContainerId,
            insertionParentId: actualContainerId,
            insertion: undefined,
            insertionIndex: 0,
            renderGuideRect: guideRect,
            guideStyle: 'line',
            confidence: 0.9,
          };
        } else {
          if (DEBUG_DND) {
            console.warn('[DropResolver] ⚠️ BLOCK_SLOT_DEBUG: top edge gap detected but guideRect is null');
          }
        }
      }
    }

    // ✅ 要素間のギャップ
    let nearestGapIndex = -1;
    let nearestGapDistance = Infinity;
    // ✅ フェーズ6: nearest gap fallback（tolerance外でも最も近いgapを記録）
    let nearestGapIndexFallback = -1;
    let nearestGapDistanceFallback = Infinity;

    for (let i = 0; i < sortedChildren.length; i++) {
      const child = sortedChildren[i];
      const childBottom = child.bounds.top + child.bounds.height;

      // ✅ 次の要素との間のギャップ
      const nextChild = sortedChildren[i + 1];
      if (nextChild) {
        const gapStart = childBottom;
        const gapEnd = nextChild.bounds.top;
        const gapCenter = (gapStart + gapEnd) / 2;
        const distance = Math.abs(mouseY - gapCenter);

        if (mouseY >= gapStart - GAP_TOLERANCE && mouseY <= gapEnd + GAP_TOLERANCE) {
          // ✅ フェーズ6: tolerance内のgapを優先的に記録
          if (distance < nearestGapDistance) {
            nearestGapDistance = distance;
            nearestGapIndex = i + 1;
          }
        } else {
          // ✅ フェーズ6: tolerance外でも距離を計算（fallback用）
          if (distance < nearestGapDistanceFallback) {
            nearestGapDistanceFallback = distance;
            nearestGapIndexFallback = i + 1;
          }
        }
      }
    }

    // ✅ 下端のギャップ（i === children.length）
    if (sortedChildren.length > 0) {
      const lastChild = sortedChildren[sortedChildren.length - 1];
      const lastChildBottom = lastChild.bounds.top + lastChild.bounds.height;
      if (mouseY > lastChildBottom) {
        const edgeDistance = Math.abs(mouseY - containerBottom);
        const EDGE_TOLERANCE = GAP_TOLERANCE * 2;
        if (edgeDistance <= EDGE_TOLERANCE || mouseY >= lastChildBottom - GAP_TOLERANCE) {
          const guideRect = this.calculateBetweenGuideRect(
            containerNode,
            sortedChildren.length,
            false, // ✅ blockは縦方向（isRow = false）
            sortedChildren,
            actualContainerBounds,
            actualContainerId,
            mouseX,
            mouseY
          );
          if (guideRect) {
            if (DEBUG_DND) {
              console.log('[DropResolver] 🔍 BLOCK_SLOT_DEBUG: bottom edge gap detected', {
                insertionIndex: sortedChildren.length,
                guideRect: { left: guideRect.left, top: guideRect.top, width: guideRect.width, height: guideRect.height }
              });
            }
            return {
              kind: 'between',
              axis: 'column',
              containerId: actualContainerId,
              insertionParentId: actualContainerId,
              insertion: undefined,
              insertionIndex: sortedChildren.length,
              renderGuideRect: guideRect,
              guideStyle: 'line',
              confidence: 0.9,
            };
          } else {
            if (DEBUG_DND) {
              console.warn('[DropResolver] ⚠️ BLOCK_SLOT_DEBUG: bottom edge gap detected but guideRect is null');
            }
          }
        }
      }
    }

    // ✅ 要素間のギャップが見つかった場合
    if (nearestGapIndex >= 0) {
      if (DEBUG_DND) {
        console.log('[DropResolver] 🔍 BLOCK_SLOT_DEBUG: between gap detected', {
          nearestGapIndex,
          nearestGapDistance,
          gapStart: sortedChildren[nearestGapIndex - 1]?.bounds.top + sortedChildren[nearestGapIndex - 1]?.bounds.height,
          gapEnd: sortedChildren[nearestGapIndex]?.bounds.top
        });
      }
      const guideRect = this.calculateBetweenGuideRect(
        containerNode,
        nearestGapIndex,
        false, // ✅ blockは縦方向（isRow = false）
        sortedChildren,
        actualContainerBounds,
        actualContainerId,
        mouseX,
        mouseY
      );
      if (guideRect) {
        if (DEBUG_DND) {
          console.log('[DropResolver] 🔍 BLOCK_SLOT_DEBUG: between gap guideRect', {
            insertionIndex: nearestGapIndex,
            guideRect: { left: guideRect.left, top: guideRect.top, width: guideRect.width, height: guideRect.height }
          });
        }
        return {
          kind: 'between',
          axis: 'column',
          containerId: actualContainerId,
          insertionParentId: actualContainerId,
          insertion: undefined,
          insertionIndex: nearestGapIndex,
          renderGuideRect: guideRect,
          guideStyle: 'line',
          confidence: 0.85,
        };
      } else {
        if (DEBUG_DND) {
          console.warn('[DropResolver] ⚠️ BLOCK_SLOT_DEBUG: between gap detected but guideRect is null');
        }
      }
    }

    // ✅ フェーズ6: tolerance内のgapが見つからない場合、nearest gap fallbackを使用
    if (nearestGapIndex < 0 && nearestGapIndexFallback >= 0) {
      // ✅ fallback: 最も近いgapを使用（isFallbackフラグを設定）
      const guideRect = this.calculateBetweenGuideRect(
        containerNode,
        nearestGapIndexFallback,
        false, // ✅ blockは縦方向（isRow = false）
        sortedChildren,
        actualContainerBounds,
        actualContainerId,
        mouseX,
        mouseY
      );
      if (guideRect) {
        // ✅ フェーズ6: fallback使用時のログ
        console.log('[DropResolver] 🔍 PHASE6: nearest gap fallback used (block)', {
          containerId: actualContainerId,
          insertionIndex: nearestGapIndexFallback,
          nearestGapDistanceFallback,
          gapStart: sortedChildren[nearestGapIndexFallback - 1]?.bounds.top + sortedChildren[nearestGapIndexFallback - 1]?.bounds.height,
          gapEnd: sortedChildren[nearestGapIndexFallback]?.bounds.top,
          gapCenter: (sortedChildren[nearestGapIndexFallback - 1]?.bounds.top + sortedChildren[nearestGapIndexFallback - 1]?.bounds.height + sortedChildren[nearestGapIndexFallback]?.bounds.top) / 2,
          mouseY,
        });

        return {
          kind: 'between',
          axis: 'column',
          containerId: actualContainerId,
          insertionParentId: actualContainerId,
          insertion: undefined,
          insertionIndex: nearestGapIndexFallback,
          renderGuideRect: guideRect,
          guideStyle: 'line',
          confidence: 0.6, // ✅ フェーズ6: fallbackのconfidenceは通常より低く設定
          isFallback: true, // ✅ フェーズ6: fallback slotとして明示
        };
      }
    }

    // ✅ フェーズ7: Conditional Inside / Empty
    // betweenが論理的に存在しない場合、または意図的に中に入れたい場合のみinside/emptyを返す
    const hasStrictGap = nearestGapIndex >= 0;
    const hasFallbackGap = nearestGapIndexFallback >= 0;

    // ✅ フェーズ7: inside/emptyを返していい条件
    const ALLOW_INSIDE_DEPTH_LIMIT = 2; // ✅ フェーズ7対策: 深いネストでinsideが出過ぎるのを防ぐ
    const allowInside =
      // depth制限（深いネストでinsideが出過ぎるのを防ぐ）
      depth <= ALLOW_INSIDE_DEPTH_LIMIT &&
      (
        // betweenが論理的に存在しない
        sortedChildren.length <= 1 ||
        // コンテナ自体に「中に入れる意味」がある（block）
        containerNode.layoutType === 'block'
      );

    // ✅ フェーズ7対策: inside intent hysteresis（ちらつき防止）
    // 一度 inside に入ったら数px/数ms固定
    const INSIDE_INTENT_HYSTERESIS_DISTANCE = 15; // 15px以内なら固定
    const INSIDE_INTENT_HYSTERESIS_DURATION_MS = 200; // 200ms以内なら固定
    const isInsideIntentHysteresis =
      this.lastInsideIntentContainerId === actualContainerId &&
      (Date.now() - this.lastInsideIntentTimestamp) < INSIDE_INTENT_HYSTERESIS_DURATION_MS &&
      Math.abs(mouseX - this.lastInsideIntentMouseX) < INSIDE_INTENT_HYSTERESIS_DISTANCE &&
      Math.abs(mouseY - this.lastInsideIntentMouseY) < INSIDE_INTENT_HYSTERESIS_DISTANCE;

    // ✅ フェーズ7: マウスがcontainerの中心領域にいるか（isInsideIntent）
    const INNER_ZONE_PADDING = 30; // ✅ 中心領域の判定
    const isInsideIntentRaw =
      mouseX >= actualContainerBounds.left + INNER_ZONE_PADDING &&
      mouseX <= actualContainerBounds.left + actualContainerBounds.width - INNER_ZONE_PADDING &&
      mouseY >= actualContainerBounds.top + INNER_ZONE_PADDING &&
      mouseY <= actualContainerBounds.top + actualContainerBounds.height - INNER_ZONE_PADDING;

    // ✅ フェーズ7対策: hysteresisを適用
    const isInsideIntent = isInsideIntentRaw || isInsideIntentHysteresis;

    // ✅ フェーズ7: Conditional Inside / Empty
    // betweenが検出されていない、かつ条件を満たす場合のみinside/emptyを返す
    if (!hasStrictGap && !hasFallbackGap && allowInside && (sortedChildren.length <= 1 || isInsideIntent)) {
      const renderGuideRect = this.boundsToDOMRect(actualContainerBounds);

      // ✅ フェーズ7対策: inside intentを記録（hysteresis用）
      if (isInsideIntentRaw) {
        this.lastInsideIntentContainerId = actualContainerId;
        this.lastInsideIntentTimestamp = Date.now();
        this.lastInsideIntentMouseX = mouseX;
        this.lastInsideIntentMouseY = mouseY;
      }

      // ✅ フェーズ7: empty slot（sortedChildren.length === 0）
      if (sortedChildren.length === 0) {
        console.log('[DropResolver] 🔍 PHASE7: conditional empty used (block)', {
          containerId: actualContainerId,
          allowInside,
          isInsideIntent,
          isInsideIntentRaw,
          isInsideIntentHysteresis,
          hasStrictGap,
          hasFallbackGap,
          depth,
        });
        return {
          kind: 'empty',
          axis: 'column',
          containerId: actualContainerId,
          insertionParentId: actualContainerId,
          insertion: undefined,
          insertionIndex: 0,
          renderGuideRect,
          guideStyle: 'dashed',
          confidence: 0.5, // ✅ フェーズ7: fallbackのconfidenceは0.4〜0.5
          isFallback: true, // ✅ フェーズ7: fallback slotとして明示
        };
      } else {
        // ✅ フェーズ7: inside slot（sortedChildren.length > 0）
        console.log('[DropResolver] 🔍 PHASE7: conditional inside used (block)', {
          containerId: actualContainerId,
          childrenLength: sortedChildren.length,
          allowInside,
          isInsideIntent,
          isInsideIntentRaw,
          isInsideIntentHysteresis,
          hasStrictGap,
          hasFallbackGap,
          depth,
        });
        return {
          kind: 'inside',
          axis: 'column',
          containerId: actualContainerId,
          insertionParentId: actualContainerId,
          insertion: undefined,
          insertionIndex: sortedChildren.length,
          renderGuideRect,
          guideStyle: 'outline',
          confidence: 0.4, // ✅ フェーズ7: fallbackのconfidenceは0.4〜0.5
          isFallback: true, // ✅ フェーズ7: fallback slotとして明示
        };
      }
    }

    // ✅ GUIDE_GLITCH_FIX: gapが見つからない場合はnullを返す（inside slotを返さない）
    // ✅ BLOCK_AND_PARENT: 常に出力されるログ（DEBUG_DNDに関係なく）
    console.log('[DropResolver] 🔍 BLOCK_SLOT_ALWAYS: no gap found, returning null', {
      nearestGapIndex,
      nearestGapIndexFallback,
      sortedChildrenCount: sortedChildren.length,
      mouseY,
      containerTop: actualContainerBounds.top,
      containerBottom: actualContainerBounds.top + actualContainerBounds.height,
      firstChildTop: sortedChildren.length > 0 ? sortedChildren[0].bounds.top : null,
      lastChildBottom: sortedChildren.length > 0 ? sortedChildren[sortedChildren.length - 1].bounds.top + sortedChildren[sortedChildren.length - 1].bounds.height : null,
      allowInside,
      isInsideIntent,
    });

    return null;
  }

  /**
   * Absolute スロットを解決
   * ✅ STEP 4: map/absolute: insideのみ許可（between禁止）
   * ✅ CRITICAL FIX: absolute/map レイアウトでは insertionIndex は意味を持たないため undefined にする
   * ✅ CRITICAL FIX: effectiveId 基準に一本化（一貫性のため）
   */
  private resolveAbsoluteSlot(
    containerNode: LayoutNode,
    draggedNode: LayoutNode,
    mouseX: number,
    mouseY: number,
    containerBounds?: LayoutNode['bounds'],
    effectiveId?: string
  ): Slot | null {
    // ✅ CRITICAL FIX: effectiveId 基準に一本化
    // effectiveId は実際に子要素が並んでいる親の要素ID（wrapper または block親）
    // フォールバック（containerNode.elementId）は安全のため残すが、通常は使用されない
    const actualContainerBounds = containerBounds ?? containerNode.bounds;
    const actualContainerId = effectiveId ?? containerNode.elementId;

    // ✅ STEP 4: map/absolute: insideのみ許可（between禁止）
    // ✅ CRITICAL FIX: absolute/map レイアウトでは insertionIndex は意味を持たないため undefined にする
    return {
      kind: containerNode.layoutType === 'block' ? 'map' : 'absolute',
      axis: undefined, // ✅ absolute/map は軸方向なし
      containerId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一（一貫性のため）
      insertionParentId: actualContainerId, // ✅ CRITICAL FIX: effectiveId に統一（一貫性のため）
      insertion: undefined, // ✅ CRITICAL FIX: absolute/map では insertion は意味を持たない
      insertionIndex: undefined, // ✅ CRITICAL FIX: absolute/map では insertionIndex は意味を持たない
      renderGuideRect: this.boundsToDOMRect(actualContainerBounds),
      guideStyle: 'outline', // ✅ STEP 4: inside は outline
      confidence: 1.0, // ✅ STEP 4: 信頼度
    };
  }

  /**
   * bounds を DOMRect に変換
   */
  /**
   * ✅ FIX: slotにrenderGuideRectが無い場合、fallback rectを設定する
   * candidateSlots.push直前で必ず呼ぶことで、描画可能なslotを保証する
   */
  private ensureRenderGuideRect(
    slot: Slot,
    containerBounds: LayoutNode['bounds'],
    isRow: boolean = false
  ): void {
    if (!slot.renderGuideRect) {
      // ✅ fallback rect: コンテナ幅の細いライン
      // column: height: 2, width: container.width
      // row: width: 2, height: container.height
      const fallbackRect = isRow
        ? new DOMRect(containerBounds.left, containerBounds.top, 2, containerBounds.height)
        : new DOMRect(containerBounds.left, containerBounds.top, containerBounds.width, 2);

      slot.renderGuideRect = fallbackRect;
      slot.guideStyle = slot.guideStyle ?? 'line';
      slot.isFallback = true; // ✅ 重要：スコアに反映される
    }
  }

  private boundsToDOMRect(bounds: LayoutNode['bounds']): DOMRect {
    return new DOMRect(bounds.left, bounds.top, bounds.width, bounds.height);
  }

  /**
   * ✅ PHASE2.5: viewport内かどうかを判定
   * Cursor同等: 見えていない候補は勝たせない
   *
   * @param bounds 判定するbounds（viewport座標）
   * @returns viewport内の場合true
   */
  private isInViewport(bounds: LayoutNode['bounds']): boolean {
    const viewport = {
      left: 0,
      top: 0,
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0,
    };

    // ✅ viewportとboundsが重なっているか判定
    return !(
      bounds.right < viewport.left ||
      bounds.left > viewport.left + viewport.width ||
      bounds.bottom < viewport.top ||
      bounds.top > viewport.top + viewport.height
    );
  }

  /**
   * ✅ PHASE3: スクロール可能なancestorを検出
   * Cursor同等: スクロール可能なancestorのviewportを基準にclipping
   *
   * @param elementId 要素ID
   * @returns スクロール可能なancestorのDOM要素、またはnull
   */
  /**
   * ✅ GUIDE_GLITCH_FIX STEP A: dragセッション中は固定されたscroll containerを返す
   */
  private findScrollContainer(elementId: string): HTMLElement | null {
    // ✅ dragセッション中は固定されたscroll containerを返す
    if (this.fixedScrollContainers.has(elementId)) {
      return this.fixedScrollContainers.get(elementId) ?? null;
    }
    if (!this.layoutTree) {
      return null;
    }

    const elementRegistry = ElementRegistry.getInstance();
    const element = elementRegistry.get(elementId);
    if (!element) {
      return null;
    }

    // ✅ 親要素を遡ってスクロール可能な要素を探す
    let current: HTMLElement | null = element.parentElement;
    while (current) {
      // ✅ [data-scroll-container="true"]を優先的にチェック
      if (current.hasAttribute('data-scroll-container') &&
          current.getAttribute('data-scroll-container') === 'true') {
        return current;
      }

      // ✅ overflow: auto/scroll の要素もチェック
      const computed = window.getComputedStyle(current);
      const overflowX = computed.overflowX;
      const overflowY = computed.overflowY;
      if ((overflowX === 'auto' || overflowX === 'scroll') ||
          (overflowY === 'auto' || overflowY === 'scroll')) {
        // ✅ スクロール可能な要素を確認（実際にスクロールできるか）
        if (current.scrollHeight > current.clientHeight ||
            current.scrollWidth > current.clientWidth) {
          return current;
        }
      }

      current = current.parentElement;
    }

    return null;
  }

  /**
   * ✅ PHASE3: スクロールコンテナのviewportを取得
   * Cursor同等: スクロールコンテナのviewportを基準にclipping
   *
   * @param scrollContainer スクロールコンテナのDOM要素
   * @returns viewport bounds（viewport座標）
   */
  private getScrollContainerViewport(scrollContainer: HTMLElement): {
    left: number;
    top: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
  } {
    const rect = scrollContainer.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    };
  }

  /**
   * ✅ PHASE3: スクロールコンテナのviewport内かどうかを判定
   * Cursor同等: スクロールコンテナのviewport外の候補は勝たせない
   *
   * @param bounds 判定するbounds（viewport座標）
   * @param containerId コンテナの要素ID
   * @returns viewport外の場合penalty値、viewport内の場合0
   */
  private getScrollViewportPenalty(bounds: LayoutNode['bounds'], containerId: string): number {
    const scrollContainer = this.findScrollContainer(containerId);
    if (!scrollContainer) {
      return 0; // ✅ スクロールコンテナがない場合はpenaltyなし
    }

    const viewport = this.getScrollContainerViewport(scrollContainer);

    // ✅ viewportとboundsが重なっているか判定
    const isInViewport = !(
      bounds.right < viewport.left ||
      bounds.left > viewport.right ||
      bounds.bottom < viewport.top ||
      bounds.top > viewport.bottom
    );

    if (!isInViewport) {
      return SCROLL_CONTAINER_CONFIG.scrollViewportOutPenalty;
    }

    return 0;
  }

  /**
   * ガイド矩形を計算（後方互換性のため保持）
   * @deprecated 新しい実装では calculateBetweenGuideRect を使用
   */
  private calculateGuideRect(containerNode: LayoutNode, insertion: number): DOMRect | null {
    const isRow = containerNode.layoutType === 'flex-row';
    return this.calculateBetweenGuideRect(containerNode, insertion, isRow, undefined, containerNode.bounds);
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  const dropResolver = DropResolver.getInstance();

  (window as any).DropResolver = DropResolver;
  (window as any).getDropResolver = function() {
    return dropResolver;
  };
}
