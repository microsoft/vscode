/**
 * PreviewSource.ts
 *
 * Previewの供給元を抽象化するインターフェース。
 *
 * DesignSurfaceは PreviewSource に依存し、実体を知らない。
 * これにより、Placeholder / External Preview を切り替え可能にする。
 */

/**
 * DOM Snapshot（読み取り専用）
 */
export interface DOMSnapshot {
  root: HTMLElement;
  timestamp: number;
}

/**
 * PreviewSource インターフェース
 *
 * Previewの供給元を抽象化する。
 * mount は「描画する」責務のみ。DOM操作・UI操作は含めない。
 */
export interface PreviewSource {
  /**
   * Previewをコンテナにマウントする
   *
   * @param container マウント先のDOM要素
   */
  mount(container: HTMLElement): void;

  /**
   * Previewをアンマウントする
   */
  unmount(): void;

  /**
   * DOM Snapshotを取得する（オプション）
   *
   * Phase 3で使用する。読み取り専用。
   *
   * @returns DOM Snapshot（存在しない場合はnull）
   */
  getDOMSnapshot?(): DOMSnapshot | null;

  /**
   * Previewがマウントされているかどうか
   */
  isMounted(): boolean;
}

