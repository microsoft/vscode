/**
 * DOMObserverBridge JavaScript文字列（Webview用）
 * Phase 2.5-b: DOM観測ブリッジ（Phase 3向け準備・安定化）
 */

export const domObserverBridgeJs = `
  // ============================================
  // Phase 2.5-b: DOM観測ブリッジ（Phase 3向け準備・安定化）
  // ============================================

  // DOMObserverBridge: DOM情報を安全に取得（読み取り専用）
  // Phase 2.5-b: 「存在はするが何もしない」実装で安定化
  class DOMObserverBridge {
    constructor(container) {
      // Phase 2.5-b: 何もしない（Phase 3で実装）
      this.container = container || null;
      this.observer = null;
      this.isObserving = false;
      console.log('[DOMObserverBridge] ✅ Created (Phase 2.5-b: no-op implementation)');
    }

    startObserving(container) {
      // Phase 2.5-b: 何もしない（Phase 3で実装）
      if (this.isObserving) {
        console.log('[DOMObserverBridge] Already observing (no-op)');
        return;
      }

      this.container = container || this.container;
      this.isObserving = true;
      console.log('[DOMObserverBridge] ✅ Started observing (Phase 2.5-b: no-op, Phase 3 will implement)');

      // Phase 3 で実装予定:
      // - MutationObserver で DOM 変更を監視（読み取り専用）
      // - DOM変更を記録（書き換えはしない）
      // - UI操作AST に接続
    }

    stopObserving() {
      // Phase 2.5-b: 何もしない（Phase 3で実装）
      if (!this.isObserving) {
        return;
      }

      // Phase 3 で実装予定:
      // if (this.observer) {
      //   this.observer.disconnect();
      //   this.observer = null;
      // }

      this.isObserving = false;
      console.log('[DOMObserverBridge] ✅ Stopped observing (Phase 2.5-b: no-op)');
    }

    getNodeInfo(element) {
      // Phase 2.5-b: 何もしない（Phase 3で実装）
      // Phase 3 で実装予定:
      // - DOM情報を取得（変更はしない）
      // - tagName, className, id, rect などを返す
      return null;
    }
  }
`;

