"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MermaidWebviewManager = void 0;
/**
 * Manages all mermaid webviews (both chat output renderers and editor previews).
 * Tracks the active webview and provides methods for interacting with webviews.
 */
class MermaidWebviewManager {
    _activeWebviewId;
    _webviews = new Map();
    /**
     * Gets the currently active webview info.
     */
    get activeWebview() {
        return this._activeWebviewId ? this._webviews.get(this._activeWebviewId) : undefined;
    }
    registerWebview(id, webview, mermaidSource, title, type) {
        if (this._webviews.has(id)) {
            throw new Error(`Webview with id ${id} is already registered.`);
        }
        const info = {
            id,
            webview,
            mermaidSource,
            title,
            type
        };
        this._webviews.set(id, info);
        return { dispose: () => this.unregisterWebview(id) };
    }
    unregisterWebview(id) {
        this._webviews.delete(id);
        // Clear active if this was the active webview
        if (this._activeWebviewId === id) {
            this._activeWebviewId = undefined;
        }
    }
    setActiveWebview(id) {
        if (this._webviews.has(id)) {
            this._activeWebviewId = id;
        }
    }
    getWebview(id) {
        return this._webviews.get(id);
    }
    /**
     * Sends a reset pan/zoom message to a specific webview by ID.
     */
    resetPanZoom(id) {
        const target = id ? this._webviews.get(id) : this.activeWebview;
        target?.webview.postMessage({ type: 'resetPanZoom' });
    }
}
exports.MermaidWebviewManager = MermaidWebviewManager;
//# sourceMappingURL=webviewManager.js.map