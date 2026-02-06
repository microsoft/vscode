/**
 * LayoutNode
 * ✅ Cursor 2.x準拠: ツリーの最小単位
 *
 * 原則:
 * - 不変オブジェクト
 * - 親子関係を保持
 * - レイアウトタイプを保持
 */

/**
 * LayoutNode: レイアウトツリーのノード
 */
export interface LayoutNode {
  /** 要素ID（data-element-id） */
  elementId: string;
  /** 親要素のID（ルートの場合はnull） */
  parentId: string | null;
  /** 子要素のID配列 */
  children: string[];
  /** 実際に子要素が並んでいる親の要素ID - ✅ ROW_LAYOUT_FIX: wrapper pattern 対応（block親の直下にflex/grid wrapperがある場合） */
  childrenParentId?: string;
  /** タグ名 */
  tagName: string;
  /** レイアウトタイプ */
  layoutType: 'block' | 'flex-row' | 'flex-column' | 'grid' | 'absolute';
  /** コンテナとして機能するか */
  isContainer: boolean;
  /** 境界情報 */
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
  };
}

/**
 * LayoutNode を作成
 */
export function createLayoutNode(
  elementId: string,
  parentId: string | null,
  children: string[],
  tagName: string,
  layoutType: LayoutNode['layoutType'],
  isContainer: boolean,
  bounds: DOMRect,
  childrenParentId?: string
): LayoutNode {
  return {
    elementId,
    parentId,
    children,
    childrenParentId,
    tagName,
    layoutType,
    isContainer,
    bounds: {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      right: bounds.right,
      bottom: bounds.bottom,
    },
  };
}

/**
 * レイアウトタイプを判定
 */
export function detectLayoutType(element: HTMLElement): LayoutNode['layoutType'] {
  const style = window.getComputedStyle(element);
  const display = style.display || 'block';
  const position = style.position || 'static';

  if (display === 'grid') {
    return 'grid';
  } else if (display === 'flex' || display === 'inline-flex') {
    const flexDirection = style.flexDirection || 'row';
    return flexDirection === 'column' || flexDirection === 'column-reverse'
      ? 'flex-column'
      : 'flex-row';
  } else if (position === 'absolute' || position === 'fixed' || position === 'relative') {
    return 'absolute';
  }

  return 'block';
}
