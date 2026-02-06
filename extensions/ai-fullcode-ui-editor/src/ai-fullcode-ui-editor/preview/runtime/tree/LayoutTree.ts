/**
 * LayoutTree
 * ✅ Cursor 2.x準拠: tree 構築・検索
 *
 * 原則:
 * - tree は drag 開始前に必ず rebuild
 * - 空ツリーは例外
 * - ElementRegistry を唯一の真実とする
 */

import { ElementRegistry } from '../core/ElementRegistry';
import { LayoutNode, createLayoutNode, detectLayoutType } from './LayoutNode';

const SYNTHETIC_ROOT_ID = 'dom:__preview_root__';

/**
 * Within `previewRoot`, return IDs whose nearest registered ancestor is null.
 * These become children of the synthetic root.
 */
function collectTopLevelIds(previewRoot: HTMLElement, registry: ElementRegistry): string[] {
  const result: string[] = [];
  const allIds = registry.getAllIds();

  for (const id of allIds) {
    const el = registry.get(id);
    if (!el) continue;
    if (!previewRoot.contains(el)) continue;

    let p: HTMLElement | null = el.parentElement;
    let foundRegisteredAncestor = false;
    while (p && p !== previewRoot) {
      const pid = registry.getIdFromElement(p);
      if (pid && registry.has(pid)) {
        foundRegisteredAncestor = true;
        break;
      }
      p = p.parentElement;
    }

    if (!foundRegisteredAncestor) {
      result.push(id);
    }
  }

  // Stable ordering helps deterministic guides.
  result.sort();
  return result;
}

type ParentChildIndex = {
  parentById: Map<string, string | null>; // childId -> parentId (nearest registered ancestor) or null
  childrenById: Map<string, string[]>;    // parentId -> childIds
};

function buildParentChildIndex(root: HTMLElement, registry: ElementRegistry): ParentChildIndex {
  const parentById = new Map<string, string | null>();
  const childrenById = new Map<string, string[]>();

  const allIds = registry.getAllIds();

  // First, determine the nearest registered ancestor for each id.
  for (const id of allIds) {
    const el = registry.get(id);
    if (!el) continue;
    if (!root.contains(el)) continue;

    let parent: string | null = null;
    let p: HTMLElement | null = el.parentElement;

    while (p) {
      // Stop if we walked above the preview root.
      if (p === root) {
        const rid = registry.getIdFromElement(p);
        if (rid && registry.has(rid) && rid !== id) {
          parent = rid;
        }
        break;
      }

      const pid = registry.getIdFromElement(p);
      if (pid && registry.has(pid) && pid !== id) {
        parent = pid;
        break;
      }

      p = p.parentElement;
    }

    parentById.set(id, parent);
  }

  // ✅ BUG-001 FIX: DOM順序を保持するため、親要素から直接DOMを走査
  // ✅ 親要素から直接DOMを走査することで、DOM順序を確実に保持
  for (const parentId of Array.from(new Set(parentById.values())).filter((id): id is string => id !== null)) {
    const parentElement = registry.get(parentId);
    if (!parentElement) continue;

    // ✅ 親要素の直接の子要素をDOM順序で走査
    const childElements: HTMLElement[] = [];
    for (let i = 0; i < parentElement.children.length; i++) {
      const childElement = parentElement.children[i] as HTMLElement;
      if (!childElement) continue;

      // ✅ 登録されている子要素のみを追加
      const childId = registry.getIdFromElement(childElement);
      if (childId && registry.has(childId) && parentById.get(childId) === parentId) {
        childElements.push(childElement);
      }
    }

    // ✅ DOM順序で子要素IDを追加
    const childIds = childElements
      .map(el => registry.getIdFromElement(el))
      .filter((id): id is string => id !== null && registry.has(id));

    childrenById.set(parentId, childIds);
  }

  // ✅ BUG-001 FIX: DOM順序を保持するため、ソートしない
  // ✅ 注: ソートするとDOM順序と一致しなくなり、ギャップ検出が間違う
  // for (const [pid, arr] of childrenById.entries()) {
  //   arr.sort();
  //   childrenById.set(pid, arr);
  // }

  return { parentById, childrenById };
}

/**
 * LayoutTree: レイアウトツリーの管理
 * ✅ Cursor 2.x準拠: シングルトンで管理
 */
export class LayoutTree {
  private static instance: LayoutTree | null = null;
  private nodes: Map<string, LayoutNode>; // elementId -> LayoutNode
  private rootId: string | null;

  private constructor() {
    this.nodes = new Map();
    this.rootId = null;
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): LayoutTree {
    if (!LayoutTree.instance) {
      LayoutTree.instance = new LayoutTree();
    }
    return LayoutTree.instance;
  }

  /**
   * ツリーを再構築
   * ✅ 必須: ElementRegistry を唯一の真実とする
   * ✅ 必須: size() === 0 は例外
   *
   * @param root ルート要素
   * @param registry ElementRegistry
   */
  rebuild(root: HTMLElement, registry: ElementRegistry): void {
    if (!root) {
      throw new Error('[LayoutTree] ❌ CRITICAL: rebuild() called with null root');
    }

    if (!registry) {
      throw new Error('[LayoutTree] ❌ CRITICAL: rebuild() called with null registry');
    }

    // ✅ 既存のノードをクリア
    this.nodes.clear();
    this.rootId = null;

    // ✅ ElementRegistry からすべてのIDを取得
    const allIds = registry.getAllIds();

    if (allIds.length === 0) {
      const error = '[LayoutTree] ❌ CRITICAL: ElementRegistry is empty, cannot build tree';
      throw new Error(error);
    }

    // ✅ Build nearest-registered-ancestor index (more correct than direct DOM children)
    const index = buildParentChildIndex(root, registry);

    // ✅ Determine root handling
    // If the preview root itself is not registered (no data-element-id), create a synthetic root.
    const registeredRootId = registry.getIdFromElement(root);
    const hasRegisteredRoot = !!(registeredRootId && registry.has(registeredRootId));

    if (hasRegisteredRoot) {
      this.rootId = registeredRootId!;

      // Ensure the registered root has an entry even if parentById didn't set it.
      index.parentById.set(registeredRootId!, null);

      this.buildNodeTree(registeredRootId!, null, registry, index, root);
    } else {
      const topLevelIds = collectTopLevelIds(root, registry);
      if (topLevelIds.length === 0) {
        const error = '[LayoutTree] ❌ CRITICAL: No registered elements found under preview root';
        throw new Error(error);
      }

      // Create synthetic root node
      this.rootId = SYNTHETIC_ROOT_ID;

      // ✅ Cursor完全準拠: Synthetic root bounds = union of all registered nodes
      // This prevents "empty space at bottom" failures by ensuring the root bounds
      // cover all registered content, not just the previewRoot DOM element.
      const rootBounds = this.calculateUnionBounds(registry, topLevelIds, root);

      const syntheticNode = createLayoutNode(
        SYNTHETIC_ROOT_ID,
        null,
        topLevelIds,
        root.tagName.toLowerCase(),
        detectLayoutType(root),
        true, // ✅ Root is always a container
        rootBounds
      );
      this.nodes.set(SYNTHETIC_ROOT_ID, syntheticNode);

      // Re-parent top-level nodes under synthetic root.
      for (const id of topLevelIds) {
        index.parentById.set(id, SYNTHETIC_ROOT_ID);
      }

      // Build trees for each top-level registered id
      for (const childId of topLevelIds) {
        this.buildNodeTree(childId, SYNTHETIC_ROOT_ID, registry, index, root);
      }
    }

    const treeSize = this.size();

    // ✅ ハード制約: size() === 0 は例外
    if (treeSize === 0) {
      const error = '[LayoutTree] ❌ CRITICAL: rebuild() completed but size() is 0';
      throw new Error(error);
    }
  }

  /**
   * ノードツリーを再帰的に構築
   */
  private buildNodeTree(
    elementId: string,
    parentId: string | null,
    registry: ElementRegistry,
    index: ParentChildIndex,
    previewRoot: HTMLElement
  ): void {
    // ✅ 既に構築済みの場合はスキップ
    if (this.nodes.has(elementId)) {
      return;
    }

    const element = registry.get(elementId);
    if (!element) {
      return;
    }

    // ✅ Children are based on nearest registered ancestor mapping (not direct DOM children)
    const children: string[] = (index.childrenById.get(elementId) ?? []).slice();

    // ✅ レイアウトタイプを判定
    const layoutType = detectLayoutType(element);

    // ✅ CRITICAL FIX: 並びを支配している要素（flex-row/flex-column/grid）を正式なDnDコンテナにする
    // Cursor仕様: DnDコンテナ = children が実際に並んでいる DOM
    // - flex-row/flex-column/grid 要素は必ず DnDコンテナとして扱う
    // - block/absolute の場合は従来通り（registered children がある場合のみ container）
    let isContainer: boolean;
    let childrenParentId: string | undefined = undefined;

    if (layoutType === 'flex-row' || layoutType === 'flex-column' || layoutType === 'grid') {
      // ✅ 並びを支配している要素自身を container にする
      isContainer = true;
      childrenParentId = elementId; // 自分自身を childrenParentId に設定
    } else {
      // ✅ block/absolute の場合は従来通り
      // - Any element with registered children acts as a container (even if display:block wrapper).
      // - Root / synthetic root is always a container.
      const hasRegisteredChildren = children.length > 0;
      const isRootNode = parentId === null;
      isContainer = hasRegisteredChildren || isRootNode;
      // childrenParentId は undefined のまま（block親は使わない）
    }

    // ✅ ノードを作成
    const bounds = element.getBoundingClientRect();
    const node = createLayoutNode(
      elementId,
      parentId,
      children,
      element.tagName.toLowerCase(),
      layoutType,
      isContainer,
      bounds,
      childrenParentId
    );

    this.nodes.set(elementId, node);

    // ✅ 子要素を再帰的に構築
    for (const childId of children) {
      this.buildNodeTree(childId, elementId, registry, index, previewRoot);
    }
  }

  /**
   * IDでノードを検索
   * ✅ 必須: draggedElementId not found → throw
   *
   * @param id elementId
   * @returns LayoutNode
   */
  findById(id: string): LayoutNode | null {
    if (!id || typeof id !== 'string') {
      return null;
    }

    const node = this.nodes.get(id);
    if (!node) {
      return null;
    }

    return node;
  }

  /**
   * IDでノードを検索（必須版）
   * ✅ 必須: draggedElementId not found → throw
   *
   * @param id elementId
   * @returns LayoutNode
   */
  requireById(id: string): LayoutNode {
    const node = this.findById(id);
    if (!node) {
      const error = `[LayoutTree] ❌ CRITICAL: Node not found for elementId: ${id}`;
      throw new Error(error);
    }
    return node;
  }

  /**
   * ツリーサイズを返す
   * ✅ 必須: size() === 0 は例外（rebuild後）
   *
   * @returns number
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * ルートノードを取得
   */
  getRoot(): LayoutNode | null {
    if (!this.rootId) {
      return null;
    }
    return this.findById(this.rootId);
  }

  /**
   * すべてのノードを取得
   */
  getAllNodes(): Map<string, LayoutNode> {
    return new Map(this.nodes);
  }

  /**
   * 親ノードを取得
   */
  getParent(elementId: string): LayoutNode | null {
    const node = this.findById(elementId);
    if (!node || !node.parentId) {
      return null;
    }
    return this.findById(node.parentId);
  }

  /**
   * 子ノードを取得
   * ✅ ROW_LAYOUT_FIX: childrenParentId がある場合、そちらの children を返す（wrapper pattern 対応）
   */
  getChildren(elementId: string): LayoutNode[] {
    const node = this.findById(elementId);
    if (!node) {
      return [];
    }

    // ✅ ROW_LAYOUT_FIX: childrenParentId がある場合、そちらの children を返す
    const actualParentId = node.childrenParentId ?? elementId;
    const actualParent = actualParentId === elementId ? node : this.findById(actualParentId);

    if (!actualParent) {
      return [];
    }

    // ✅ BUG-001 FIX: DOM順序を保持するため、ソートしない
    // ✅ buildParentChildIndex()でDOM順序を保持しているため、その順序を維持
    // ✅ 注: boundsでソートするとDOM順序と一致しなくなり、ギャップ検出が間違う
    const children = actualParent.children
      .map(childId => this.findById(childId))
      .filter((node): node is LayoutNode => node !== null);

    return children;
  }

  /**
   * 実際に子要素が並んでいる親の要素IDを取得
   * ✅ ROW_LAYOUT_FIX: wrapper pattern 対応
   */
  getChildrenParentId(elementId: string): string | undefined {
    const node = this.findById(elementId);
    return node?.childrenParentId;
  }

  /**
   * 実効的な子要素の親IDを取得（wrapper pattern対応）
   * ✅ ROW_LAYOUT_FIX: effectiveChildrenParentId として使用
   */
  getEffectiveChildrenParentId(elementId: string): string | undefined {
    return this.getChildrenParentId(elementId);
  }

  /**
   * 実効的なレイアウトタイプを取得（wrapper pattern対応）
   * ✅ ROW_LAYOUT_FIX: effectiveLayoutType として使用
   * childrenParentId があればその layoutType を返す、なければ自身の layoutType を返す
   */
  getEffectiveLayoutType(elementId: string): LayoutNode['layoutType'] {
    const node = this.findById(elementId);
    if (!node) {
      return 'block';
    }

    const effectiveParentId = node.childrenParentId ?? elementId;
    if (effectiveParentId === elementId) {
      return node.layoutType;
    }

    const effectiveNode = this.findById(effectiveParentId);
    return effectiveNode?.layoutType ?? node.layoutType;
  }

  /**
   * 実効的な境界情報を取得（並びを支配している bounds を返す）
   * ✅ CRITICAL FIX: effectiveBounds として使用
   * childrenParentId が設定されている場合（wrapper: flex-row/flex-column/grid）のみ bounds を返す
   * childrenParentId が設定されていない場合（block親）は null を返す
   * これにより、findContainerAt で「並びを支配している container」を優先できる
   */
  getEffectiveBounds(elementId: string): LayoutNode['bounds'] | null {
    const node = this.findById(elementId);
    if (!node) {
      return null;
    }

    // ✅ CRITICAL FIX: childrenParentId が設定されている場合のみ effectiveBounds を返す
    // wrapper（flex-row/flex-column/grid）の場合は childrenParentId = elementId が設定されている
    // block親の場合は childrenParentId = undefined なので、null を返す
    if (node.childrenParentId === undefined) {
      return null;
    }

    // ✅ childrenParentId が設定されている場合、その bounds を返す
    // wrapper の場合は childrenParentId = elementId なので、自分自身の bounds を返す
    const effectiveNode = this.findById(node.childrenParentId);
    return effectiveNode?.bounds ?? null;
  }

  /**
   * ツリーをクリア
   */
  clear(): void {
    this.nodes.clear();
    this.rootId = null;
  }

  /**
   * ノードが別のノードの子孫かどうかを判定
   * ✅ PHASE0: Dragged Subtree Exclusion用
   */
  isDescendantOf(descendantId: string, ancestorId: string): boolean {
    let current: LayoutNode | null = this.findById(descendantId);
    if (!current) {
      return false;
    }

    while (current && current.parentId) {
      if (current.parentId === ancestorId) {
        return true;
      }
      current = this.findById(current.parentId);
    }
    return false;
  }

  /**
   * ノードの祖先パスを取得（rootからnodeまで）
   * ✅ PHASE0: 診断ログ用
   */
  getAncestorPath(elementId: string): string[] {
    const path: string[] = [];
    let current: LayoutNode | null = this.findById(elementId);

    while (current) {
      path.unshift(current.elementId);
      if (!current.parentId) {
        break;
      }
      current = this.findById(current.parentId);
    }

    return path;
  }

  /**
   * ノードの深さを取得（root = 0）
   * ✅ PHASE0: 診断ログ用
   */
  getDepth(elementId: string): number {
    let depth = 0;
    let current: LayoutNode | null = this.findById(elementId);

    while (current && current.parentId) {
      depth++;
      current = this.findById(current.parentId);
    }

    return depth;
  }

  /**
   * ドラッグ中のノードのすべての子孫IDを取得
   * ✅ PHASE0: Dragged Subtree Exclusion用
   */
  getDescendantIds(elementId: string): Set<string> {
    const descendants = new Set<string>();
    const node = this.findById(elementId);
    if (!node) {
      return descendants;
    }

    const collectDescendants = (id: string) => {
      const n = this.findById(id);
      if (!n) return;

      descendants.add(id);
      for (const childId of n.children) {
        collectDescendants(childId);
      }
    };

    // 自分自身は除外（子孫のみ）
    for (const childId of node.children) {
      collectDescendants(childId);
    }

    return descendants;
  }

  /**
   * 全登録ノードの外接矩形を計算
   * ✅ Cursor完全準拠: Synthetic root bounds = union of all registered nodes
   */
  private calculateUnionBounds(
    registry: ElementRegistry,
    topLevelIds: string[],
    previewRoot: HTMLElement
  ): DOMRect {
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    // ✅ すべての登録ノードの bounds を走査
    const allIds = registry.getAllIds();
    for (const id of allIds) {
      const el = registry.get(id);
      if (!el || !previewRoot.contains(el)) continue;

      const rect = el.getBoundingClientRect();
      minLeft = Math.min(minLeft, rect.left);
      minTop = Math.min(minTop, rect.top);
      maxRight = Math.max(maxRight, rect.right);
      maxBottom = Math.max(maxBottom, rect.bottom);
    }

    // ✅ フォールバック: ノードが見つからない場合は previewRoot の bounds を使用
    if (!Number.isFinite(minLeft) || !Number.isFinite(minTop)) {
      return previewRoot.getBoundingClientRect();
    }

    return new DOMRect(
      minLeft,
      minTop,
      maxRight - minLeft,
      maxBottom - minTop
    );
  }

  /**
   * マウス位置を含む最も深いコンテナを検索
   * ✅ Cursor 2.x準拠: DOMではなくLayoutTreeのboundsで判定
   * ✅ DOM要素が存在しない領域（padding、gap、余白）でも動作
   * ✅ EPS導入: 境界・小数座標・丸め誤差による失敗を防ぐ
   *
   * @param x マウスX座標（viewport座標）
   * @param y マウスY座標（viewport座標）
   * @param excludeElementId 除外する要素ID（ドラッグ中の要素など）
   * @returns 最も深いコンテナノード または null
   */
  findDeepestContainerByPoint(
    x: number,
    y: number,
    excludeElementId?: string
  ): LayoutNode | null {
    let result: LayoutNode | null = null;
    let maxDepth = -1;

    // ✅ EPS = 0.5: Cursor系はだいたいこれ（境界・小数座標・丸め誤差対策）
    const EPS = 0.5;

    // ✅ すべてのコンテナノードを走査
    for (const node of this.nodes.values()) {
      // ✅ コンテナでない場合はスキップ
      if (!node.isContainer) {
        continue;
      }

      // ✅ 除外対象の場合はスキップ
      if (excludeElementId && node.elementId === excludeElementId) {
        continue;
      }

      // ✅ bounds でマウス位置を含むか判定（EPS導入）
      // ✅ CRITICAL: bounds.right / bounds.bottom を信用しない（left+width / top+height で計算）
      const bounds = node.bounds;
      const right = bounds.left + bounds.width;
      const bottom = bounds.top + bounds.height;
      if (
        x >= bounds.left - EPS &&
        x <= right + EPS &&
        y >= bounds.top - EPS &&
        y <= bottom + EPS
      ) {
        // ✅ depth を計算（parentId を辿って root までの距離）
        let depth = 0;
        let current: LayoutNode | null = node;
        while (current && current.parentId) {
          depth++;
          current = this.findById(current.parentId);
        }

        // ✅ より深い（子に近い）ものを優先
        if (depth > maxDepth) {
          maxDepth = depth;
          result = node;
        }
      }
    }

    return result;
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  const layoutTree = LayoutTree.getInstance();

  (window as any).LayoutTree = LayoutTree;
  (window as any).getLayoutTree = function() {
    return layoutTree;
  };
}
