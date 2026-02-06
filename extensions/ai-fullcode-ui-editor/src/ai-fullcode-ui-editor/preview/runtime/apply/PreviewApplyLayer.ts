/**
 * PreviewApplyLayer
 * ✅ Cursor 2.x準拠: DOM最終責務
 *
 * 原則:
 * - registry → DOM fallback の二段構え
 * - 見つからなければ即例外
 * - apply 時に DOM が必ず更新される
 */

import { ElementRegistry } from '../core/ElementRegistry';
import { ElementId } from '../core/ElementId';

/**
 * MoveElementAction: 要素移動アクション
 */
export interface MoveElementAction {
  /** 移動する要素ID */
  elementId: string;
  /** 移動先コンテナID */
  targetContainerId: string;
  /** 移動先インデックス */
  targetIndex: number;
  /** Grid用: 行インデックス */
  targetRowIndex?: number;
  /** Grid用: 列インデックス */
  targetColumnIndex?: number;
}

/**
 * UIAction: UI操作アクション（統一インターフェース）
 */
export type UIAction = MoveElementAction | InsertElementAction | RemoveElementAction;

/**
 * InsertElementAction: 要素挿入アクション（スタブ）
 */
export interface InsertElementAction {
  type: 'INSERT_ELEMENT';
  elementId: string;
  targetContainerId: string;
  targetIndex: number;
}

/**
 * RemoveElementAction: 要素削除アクション（スタブ）
 */
export interface RemoveElementAction {
  type: 'REMOVE_ELEMENT';
  elementId: string;
}

/**
 * PreviewApplyLayer: DOM変更を適用
 * ✅ Cursor 2.x準拠: シングルトンで管理
 */
export class PreviewApplyLayer {
  private static instance: PreviewApplyLayer | null = null;
  private elementRegistry: ElementRegistry | null;

  private constructor() {
    this.elementRegistry = null;
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): PreviewApplyLayer {
    if (!PreviewApplyLayer.instance) {
      PreviewApplyLayer.instance = new PreviewApplyLayer();
    }
    return PreviewApplyLayer.instance;
  }

  /**
   * 初期化
   */
  init(): void {
    // ✅ ElementRegistry を取得
    if (typeof window !== 'undefined' && typeof (window as any).getElementRegistry === 'function') {
      this.elementRegistry = (window as any).getElementRegistry();
    }

  }

  /**
   * 要素の存在をアサート
   * ✅ 必須: 見つからなければ即例外
   *
   * @param elementId 要素ID
   * @returns HTMLElement
   */
  assertElementExists(elementId: string): HTMLElement {
    if (!elementId || elementId === '') {
      throw new Error('[PreviewApplyLayer] ❌ CRITICAL: elementId is empty');
    }

    // ✅ 1. ElementRegistry から取得（優先）
    if (this.elementRegistry) {
      const element = this.elementRegistry.get(elementId);
      if (element) {
        return element;
      }
    }

    // ✅ 2. DOM fallback
    const element = document.querySelector<HTMLElement>(`[data-element-id="${elementId}"]`);
    if (element) {
      return element;
    }

    // ✅ 見つからなければ即例外
    const error = `[PreviewApplyLayer] ❌ CRITICAL: Element not found: ${elementId}`;
    throw new Error(error);
  }

  /**
   * 要素移動を適用
   * ✅ 必須: apply 時に DOM が必ず更新される
   * ✅ 必須: DOM ノードを再作成しない（既存ノードを移動）
   * ✅ 必須: Registry の整合性を保つ
   *
   * @param action 移動アクション
   */
  applyMove(action: MoveElementAction): void {

    // ✅ 要素の存在をアサート
    const element = this.assertElementExists(action.elementId);
    const targetContainer = this.assertElementExists(action.targetContainerId);

    // ✅ 移動先コンテナに挿入
    // ✅ 重要: removeChild 前に参照ノードを取得（removeChild後はインデックスが変わるため）
    const targetChildren = Array.from(targetContainer.children);
    let referenceNode: Node | null = null;

    // ✅ CRITICAL FIX: targetIndex が -1 の場合は最後に追加（absolute/map レイアウト用）
    if (action.targetIndex === -1) {
      referenceNode = null; // ✅ 最後に追加
    } else if (targetChildren.length <= action.targetIndex) {
      // ✅ 最後に追加: 参照ノードは null（appendChild を使用）
      referenceNode = null;
    } else {
      // ✅ 指定位置に挿入: 参照ノードを取得
      // ✅ 同じ親内での移動の場合、ドラッグ中の要素を除外して計算
      const currentParent = element.parentNode;
      if (currentParent === targetContainer) {
        // ✅ ドラッグ中の要素のインデックスを取得
        const draggedIndex = targetChildren.indexOf(element);

        // ✅ ドラッグ中の要素を除外したインデックスを計算
        if (action.targetIndex <= draggedIndex) {
          // ✅ 前方に移動: 参照ノードはそのまま
          referenceNode = targetChildren[action.targetIndex];
        } else {
          // ✅ 後方に移動: 参照ノードは1つ後ろ（ドラッグ中の要素を除外）
          referenceNode = targetChildren[action.targetIndex + 1] || null;
        }
      } else {
        // ✅ 異なる親への移動: 参照ノードはそのまま
        referenceNode = targetChildren[action.targetIndex];
      }
    }

    // ✅ 同じ親内での移動の最適化
    const currentParent = element.parentNode;
    if (currentParent === targetContainer) {
      // ✅ 同じ親内での移動: 現在のインデックスを取得
      const currentIndex = targetChildren.indexOf(element);

      // ✅ 既に正しい位置にある場合は何もしない
      if (currentIndex === action.targetIndex) {
        return;
      }

      // ✅ 同じ親内での移動: 一度削除してから再挿入
      targetContainer.removeChild(element);
    } else {
      // ✅ 異なる親への移動: 現在の親から削除
      if (currentParent) {
        currentParent.removeChild(element);
      }
    }

    // ✅ Grid の場合は grid-row-start / grid-column-start を設定
    if (action.targetRowIndex !== undefined && action.targetColumnIndex !== undefined) {
      const style = (element as HTMLElement).style;
      style.gridRowStart = String(action.targetRowIndex + 1);
      style.gridColumnStart = String(action.targetColumnIndex + 1);
    }

    // ✅ 移動先コンテナに挿入（参照ノードは既に取得済み）
    if (referenceNode === null) {
      // ✅ 最後に追加
      targetContainer.appendChild(element);
    } else {
      // ✅ 指定位置に挿入
      targetContainer.insertBefore(element, referenceNode);
    }

    // ✅ STEP 9: drop確定後に ElementRegistry.scan と LayoutTree.rebuild を1回だけ実行
    // ✅ drag中はscan/rebuild禁止（重い＆チラつき原因）
    if (this.elementRegistry) {
      // ✅ ElementRegistry は WeakMap を使用しているため、DOM 参照が変わっても自動的に追従する
      // ただし、DOM移動後に明示的にscanを実行して整合性を保つ（1回だけ）
      const previewRoot = targetContainer.closest('[data-design-surface="true"]') as HTMLElement;
      if (previewRoot) {
        this.elementRegistry.scan(previewRoot);
      }
    }

    const finalIndex = Array.from(targetContainer.children).indexOf(element);

    // ✅ 検証: 要素が正しく移動されたことを確認
    if (element.parentNode !== targetContainer) {
      throw new Error('[PreviewApplyLayer] ❌ CRITICAL: Element was not moved to target container');
    }

    if (finalIndex !== action.targetIndex && targetContainer.children.length > action.targetIndex) {
      // Silent validation
    }
  }

  /**
   * 要素を削除
   *
   * @param elementId 要素ID
   */
  applyRemove(elementId: string): void {

    // ✅ 要素の存在をアサート
    const element = this.assertElementExists(elementId);

    // ✅ 要素を削除
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  /**
   * 統一 apply メソッド
   * ✅ 必須: すべての UIAction を処理
   *
   * @param action UI操作アクション
   */
  apply(action: UIAction): void {
    if ('type' in action) {
      switch (action.type) {
        case 'INSERT_ELEMENT':
          this.applyInsert(action);
          break;
        case 'REMOVE_ELEMENT':
          this.applyRemove(action.elementId);
          break;
        default:
          // ✅ MoveElementAction は type フィールドがないため、applyMove を直接呼び出す
          if ('elementId' in action && 'targetContainerId' in action) {
            this.applyMove(action as MoveElementAction);
          } else {
            throw new Error(`[PreviewApplyLayer] ❌ Unknown action type: ${(action as any).type}`);
          }
      }
    } else {
      // ✅ MoveElementAction（後方互換性）
      this.applyMove(action as MoveElementAction);
    }
  }

  /**
   * 要素を挿入（INSERT_ELEMENT）
   * ✅ スタブ実装（将来の拡張用）
   *
   * @param action 挿入アクション
   */
  applyInsert(action: InsertElementAction): void {

    // ✅ 要素の存在をアサート
    const element = this.assertElementExists(action.elementId);
    const targetContainer = this.assertElementExists(action.targetContainerId);

    // ✅ 移動先コンテナに挿入
    const targetChildren = Array.from(targetContainer.children);
    if (targetChildren.length <= action.targetIndex) {
      // ✅ 最後に追加
      targetContainer.appendChild(element);
    } else {
      // ✅ 指定位置に挿入
      const referenceNode = targetChildren[action.targetIndex];
      targetContainer.insertBefore(element, referenceNode);
    }
  }

  /**
   * 要素を追加（後方互換性）
   *
   * @param elementId 要素ID
   * @param targetContainerId 移動先コンテナID
   * @param targetIndex 移動先インデックス
   */
  applyAdd(elementId: string, targetContainerId: string, targetIndex: number): void {
    this.applyInsert({
      type: 'INSERT_ELEMENT',
      elementId,
      targetContainerId,
      targetIndex,
    });
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  const previewApplyLayer = PreviewApplyLayer.getInstance();

  (window as any).PreviewApplyLayer = PreviewApplyLayer;
  (window as any).getPreviewApplyLayer = function() {
    return previewApplyLayer;
  };

}
