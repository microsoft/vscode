/**
 * PreviewSource JavaScript文字列（Webview用）
 * Phase 2.5: PreviewSource 抽象化
 */

export const previewSourceJs = `
  // ============================================
  // Phase 2.5: PreviewSource 抽象化
  // ============================================

  // PreviewSource インターフェース（抽象化）
  class PreviewSource {
    constructor() {
      this.container = null;
      this.isMountedFlag = false;
    }

    mount(container) {
      throw new Error('mount() must be implemented');
    }

    unmount() {
      throw new Error('unmount() must be implemented');
    }

    getDOMSnapshot() {
      return null;
    }

    isMounted() {
      return this.isMountedFlag;
    }
  }

  // PlaceholderPreviewSource: 既存のPlaceholderAppをPreviewSourceとして実装
  class PlaceholderPreviewSource extends PreviewSource {
    constructor() {
      super();
      this.root = null;
    }

    mount(container) {
      if (this.isMountedFlag && this.container) {
        console.warn('[PlaceholderPreviewSource] Already mounted, unmounting first...');
        this.unmount();
      }

      this.container = container;
      container.innerHTML = '';

      try {
        const root = ReactDOM.createRoot(container);
        root.render(
          React.createElement(React.StrictMode, null,
            React.createElement(PlaceholderApp)
          )
        );
        this.root = root;
        this.isMountedFlag = true;
        console.log('[PlaceholderPreviewSource] ✅ Mounted');
      } catch (error) {
        console.error('[PlaceholderPreviewSource] ❌ Failed to mount:', error);
        throw error;
      }
    }

    unmount() {
      if (this.root) {
        try {
          this.root.unmount();
          console.log('[PlaceholderPreviewSource] ✅ Unmounted');
        } catch (error) {
          console.error('[PlaceholderPreviewSource] ❌ Failed to unmount:', error);
        }
        this.root = null;
      }

      if (this.container) {
        this.container.innerHTML = '';
        this.container = null;
      }

      this.isMountedFlag = false;
    }

    getDOMSnapshot() {
      if (!this.container || !this.isMountedFlag) {
        return null;
      }

      const rootElement = this.container.firstElementChild;
      if (rootElement instanceof HTMLElement) {
        return {
          root: rootElement,
          timestamp: Date.now(),
        };
      }

      return null;
    }
  }

  // ExternalPreviewAdapter: 外部Preview接続（将来実装）
  class ExternalPreviewAdapter extends PreviewSource {
    constructor(externalUrl) {
      super();
      this.externalUrl = externalUrl || null;
      this.domSnapshot = null;
    }

    mount(container) {
      if (this.isMountedFlag && this.container) {
        console.warn('[ExternalPreviewAdapter] Already mounted, unmounting first...');
        this.unmount();
      }

      this.container = container;

      try {
        console.log('[ExternalPreviewAdapter] Mounting external preview...');

        // TODO: Phase 2.5 で実装
        // - 外部Previewの接続（Chrome DevTools Protocol等）
        // - DOM構造の取得
        // - UI操作レイヤーへの DOM参照提供

        // 現在はプレースホルダー
        container.innerHTML =
          '<div style="padding: 40px; text-align: center; color: #888; font-family: sans-serif;">' +
          '<h3>External Preview Adapter</h3>' +
          '<p>Not implemented yet</p>' +
          '<p style="font-size: 11px; color: #666;">Phase 2.5: External Preview connection will be implemented here</p>' +
          '</div>';

        this.isMountedFlag = true;
        console.log('[ExternalPreviewAdapter] ✅ Mounted (placeholder)');
      } catch (error) {
        console.error('[ExternalPreviewAdapter] ❌ Failed to mount:', error);
        throw error;
      }
    }

    unmount() {
      if (this.container) {
        this.container.innerHTML = '';
        this.container = null;
      }

      this.domSnapshot = null;
      this.isMountedFlag = false;
    }

    getDOMSnapshot() {
      if (!this.container || !this.isMountedFlag) {
        return null;
      }

      // 外部PreviewのDOMを取得（読み取り専用）
      // TODO: Phase 2.5 で実装
      return this.domSnapshot;
    }

    setExternalUrl(url) {
      this.externalUrl = url;
    }

    getExternalUrl() {
      return this.externalUrl;
    }
  }
`;

