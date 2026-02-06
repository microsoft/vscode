/// <reference lib="dom" />

/**
 * Layout Introspection（レイアウトタイプ判定）
 *
 * container の layoutType を一元化して判定する
 */

/**
 * レイアウトタイプ
 */
export type LayoutType = 'grid' | 'flex-row' | 'flex-column' | 'absolute' | 'block';

/**
 * レイアウトタイプを判定
 *
 * @param element DOM要素
 * @returns レイアウトタイプ
 */
export function detectLayoutType(element: HTMLElement | null): LayoutType {
  if (!element) {
    return 'block';
  }

  const style = (globalThis as any).window?.getComputedStyle?.(element) || (element as any).ownerDocument?.defaultView?.getComputedStyle?.(element);
  if (!style) {
    return 'block';
  }
  const display = style.display;
  const position = style.position;

  // Grid
  if (display === 'grid') {
    return 'grid';
  }

  // Flex
  if (display === 'flex' || display === 'inline-flex') {
    const flexDirection = style.flexDirection || 'row';
    return flexDirection === 'column' || flexDirection === 'column-reverse'
      ? 'flex-column'
      : 'flex-row';
  }

  // Absolute
  if (position === 'absolute' || position === 'fixed' || position === 'relative') {
    // 親要素が flex/grid の場合は absolute として扱う
    const parent = (element as any).parentElement;
    if (parent) {
      const parentStyle = (globalThis as any).window?.getComputedStyle?.(parent) || (parent as any).ownerDocument?.defaultView?.getComputedStyle?.(parent);
      if (parentStyle.display === 'flex' || parentStyle.display === 'grid') {
        return 'absolute';
      }
    }
    return 'absolute';
  }

  // Block（デフォルト）
  return 'block';
}

/**
 * コンテナが子要素を受け入れられるか判定
 *
 * @param layoutType レイアウトタイプ
 * @returns 受け入れ可能かどうか
 */
export function canAcceptChildren(layoutType: LayoutType): boolean {
  return layoutType === 'grid' ||
         layoutType === 'flex-row' ||
         layoutType === 'flex-column';
}

