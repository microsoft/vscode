/**
 * Bridge統合
 *
 * Phase 4: プレビュー連携
 * postMessage Bridge（既存のbridge.tsを流用）
 *
 * 注意: 既存のapps/web/preview/src/bridge.tsをそのまま利用します。
 * このファイルは、VSCode Webviewとの統合ポイントを提供します。
 */

/**
 * Preview Bridge
 *
 * VSCode WebviewとPreview（iframe）間のpostMessage通信を管理します。
 * メッセージキュー機能により、Preview Panelが作成される前に送信されたメッセージも
 * 確実に配信されます。
 */
export class PreviewBridge {
  private messageHandlers = new Map<string, (message: unknown) => void>();
  private previewPanel: { postMessage: (message: any) => void } | null = null;
  private pendingMessages: Array<{ type: string; [key: string]: unknown }> = [];

  /**
   * Preview Panelを設定
   *
   * Preview Panelが設定された時点で、保留中のメッセージをすべて送信します。
   *
   * @param panel Preview Panelインスタンス
   */
  setPreviewPanel(panel: { postMessage: (message: any) => void }): void {
    this.previewPanel = panel;

    // 保留中のメッセージをすべて送信（順序を保持）
    for (const message of this.pendingMessages) {
      this.previewPanel.postMessage(message);
    }

    // キューをクリア
    this.pendingMessages = [];
  }

  /**
   * メッセージを送信
   *
   * Preview Panelが存在する場合は即座に送信し、
   * 存在しない場合はキューに保存して後で送信します。
   *
   * @param message メッセージ
   */
  send(message: { type: string; [key: string]: unknown }): void {
    if (this.previewPanel) {
      this.previewPanel.postMessage(message);
    } else {
      // Preview Panelが設定されるまでメッセージをキューに保存
      this.pendingMessages.push(message);
    }
  }

  /**
   * メッセージハンドラーを登録
   *
   * @param type メッセージタイプ
   * @param handler ハンドラー関数
   */
  on(type: string, handler: (message: unknown) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * メッセージハンドラーを削除
   *
   * @param type メッセージタイプ
   */
  off(type: string): void {
    this.messageHandlers.delete(type);
  }

  /**
   * メッセージを受信
   *
   * @param message メッセージ
   */
  handleMessage(message: { type: string; [key: string]: unknown }): void {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    }
  }
}

// シングルトンインスタンスをエクスポート
export const previewBridge = new PreviewBridge();

