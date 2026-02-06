/**
 * Preview HTML ビルダー
 * ✅ Cursor 2.2準拠: webview.asWebviewUri で Runtime を読み込む
 *
 * 原則:
 * - Runtime はビルド時に ES2018 + IIFE にバンドルされる
 * - Webview では <script src> で読み込む（webview.asWebviewUri 経由）
 * - HTML文字列内にTypeScript構文を一切含めない
 * - fs.readFileSync による実行時注入は禁止
 * - 新しい実装（STEP 0-7）を使用
 */

import * as vscode from 'vscode';
import { previewCss } from './previewCss';

/**
 * DesignSurface HTML を生成
 * ✅ Cursor 2.2準拠: webview.asWebviewUri で Runtime を読み込む
 *
 * @param webview VSCode Webview インスタンス
 * @param context Extension Context
 * @returns HTML文字列
 */
export function buildPreviewHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  // ✅ Runtime JS の URI を取得（webview.asWebviewUri 経由）
  const runtimeUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'out', 'ai-fullcode-ui-editor', 'preview', 'runtime', 'runtime.js')
  );

  // ✅ CSP nonce を取得
  const nonce = getNonce();

  return `
    <!DOCTYPE html>
    <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-inline' https://unpkg.com; img-src data: https:;">
        <title>Preview - Design Surface</title>
        <style>
          ${previewCss}
        </style>
      </head>
      <body>
        <div id="root"></div>

        <!-- React & ReactDOM (CDN) -->
        <script nonce="${nonce}" crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
        <script nonce="${nonce}" crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

        <!-- Runtime: webview.asWebviewUri 経由で読み込む -->
        <!-- ✅ Cursor 2.2準拠: Runtime はビルド時に ES2018 + IIFE にバンドルされ、<script src> で読み込む -->
        <script nonce="${nonce}" src="${runtimeUri}"></script>

        <script nonce="${nonce}">
          (function() {
            'use strict';

            // ✅ BUG-001 FIX: グローバルエラーハンドラーを追加（VSCode本体のエラーを抑制）
            // ✅ navigator.locks API のエラーをキャッチして無視
            // ✅ より確実にキャッチするため、複数の方法でエラーを抑制

            // 1. window.error イベントハンドラー（キャプチャフェーズ）
            window.addEventListener('error', function(event) {
              const error = event.error || event;
              const message = event.message || (error && error.message) || String(error) || '';
              const errorName = (error && error.name) || '';
              const errorString = String(error);

              // ✅ より広範囲にキャッチ: InvalidStateError かつ lock 関連
              if ((errorName === 'InvalidStateError' || message.includes('InvalidStateError') || errorString.includes('InvalidStateError')) &&
                  (message.includes('lock()') || message.includes('lock') || message.includes('navigator.locks') ||
                   message.includes('request could not be registered') || errorString.includes('lock'))) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return false;
              }
            }, true);

            // 2. window.error イベントハンドラー（バブリングフェーズ）
            window.addEventListener('error', function(event) {
              const error = event.error || event;
              const message = event.message || (error && error.message) || String(error) || '';
              const errorName = (error && error.name) || '';
              const errorString = String(error);

              if ((errorName === 'InvalidStateError' || message.includes('InvalidStateError') || errorString.includes('InvalidStateError')) &&
                  (message.includes('lock()') || message.includes('lock') || message.includes('navigator.locks') ||
                   message.includes('request could not be registered') || errorString.includes('lock'))) {
                event.preventDefault();
                event.stopPropagation();
                return false;
              }
            }, false);

            // 3. 未処理のPromise rejectionをキャッチ
            window.addEventListener('unhandledrejection', function(event) {
              const reason = event.reason || {};
              const message = reason.message || String(reason) || '';
              const errorName = reason.name || '';
              const reasonString = String(reason);

              if ((errorName === 'InvalidStateError' || message.includes('InvalidStateError') || reasonString.includes('InvalidStateError')) &&
                  (message.includes('lock()') || message.includes('lock') || message.includes('navigator.locks') ||
                   message.includes('request could not be registered') || reasonString.includes('lock'))) {
                event.preventDefault();
                event.stopPropagation();
                return false;
              }
            });

            // 4. console.error をオーバーライドして、navigator.locks 関連のエラーを抑制
            const originalConsoleError = console.error;
            console.error = function(...args) {
              const message = args.join(' ');
              // ✅ より広範囲にキャッチ
              if (message.includes('lock()') ||
                  message.includes('InvalidStateError') && (message.includes('lock') || message.includes('request could not be registered')) ||
                  message.includes('request could not be registered') && message.includes('lock')) {
                return;
              }
              originalConsoleError.apply(console, args);
            };

            // 5. console.warn もオーバーライド（念のため）
            const originalConsoleWarn = console.warn;
            console.warn = function(...args) {
              const message = args.join(' ');
              if (message.includes('lock()') ||
                  message.includes('InvalidStateError') && (message.includes('lock') || message.includes('request could not be registered')) ||
                  message.includes('request could not be registered') && message.includes('lock')) {
                return;
              }
              originalConsoleWarn.apply(console, args);
            };

            // ✅ VSCode API を取得
            const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

            // React & ReactDOM の確認
            if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
              document.getElementById('root').innerHTML =
                '<div style="padding: 40px; text-align: center; color: #f48771;">' +
                '<h2>Error</h2><p>React or ReactDOM failed to load</p></div>';
              return;
            }


            // ✅ 新しい実装（STEP 0-7）を使用
            // DesignSurface: Preview + UI操作レイヤー
            function DesignSurface() {
              const [selectionState, setSelectionState] = React.useState(null);
              const containerRef = React.useRef(null);
              const previewSourceRef = React.useRef(null);

              React.useEffect(() => {
                const container = containerRef.current;

                if (!container) {
                  return;
                }

                // ✅ STEP 1: PlaceholderPreviewSource をマウント
                try {
                  if (typeof window.PlaceholderPreviewSource !== 'undefined') {
                    const previewSource = new window.PlaceholderPreviewSource();
                    previewSource.mount(container);
                    previewSourceRef.current = previewSource;
                  } else {
                    container.innerHTML =
                      '<div style="padding: 40px; text-align: center; color: #f48771;">' +
                      '<h2>Error</h2><p>PlaceholderPreviewSource not loaded</p></div>';
                    return;
                  }
                } catch (error) {
                  container.innerHTML =
                    '<div style="padding: 40px; text-align: center; color: #f48771;">' +
                    '<h2>Error</h2><p>Failed to mount PreviewSource</p><pre>' +
                    String(error) + '</pre></div>';
                  return;
                }

                // ✅ CRITICAL FIX: STEP 2: initPreviewRuntime を呼び出す（React 18非同期レンダリング対応）
                // setTimeout依存を廃止し、requestAnimationFrame + DOMゲート + リトライに置換
                // Cursor同等の安定初期化: DOM確定→Registry scan→LayoutTree build の順序保証

                // ✅ 必須IDのリスト（DOMゲート判定用）
                const REQUIRED_IDS = [
                  'dom:placeholder-root',
                  'dom:placeholder-group-column-wrapper',
                  'dom:placeholder-group-row-wrapper'
                ];

                // ✅ DOMゲート判定: 必須IDが存在するか確認
                const checkDOMGate = () => {
                  const allElements = container.querySelectorAll('[data-element-id]');
                  if (allElements.length === 0) {
                    return false;
                  }

                  // 必須IDのうち、少なくとも1つは存在する必要がある
                  const hasRequiredId = REQUIRED_IDS.some(id => {
                    return container.querySelector('[data-element-id="' + id + '"]') !== null;
                  });

                  return hasRequiredId;
                };

                // ✅ 初期化関数
                const initializeRuntime = () => {
                  try {
                    if (typeof window.initPreviewRuntime === 'function') {
                      console.log('[DesignSurface] 🚀 Initializing PreviewRuntime...');
                      window.initPreviewRuntime(container);

                      // ✅ SelectionController の状態変更コールバックを設定（React state更新用）
                      if (typeof window.getSelectionController === 'function') {
                        const selectionController = window.getSelectionController();
                        if (selectionController) {
                          selectionController.init((state) => {
                            setSelectionState(state);
                          });
                        }
                      }

                      console.log('[DesignSurface] ✅ PreviewRuntime initialized successfully');

                      // ✅ CRITICAL FIX: MutationObserver（保険として、初期化後の短時間のみ有効）
                      // React側のDOM反映が遅延する特殊ケースに備えて、data-element-id追加を検知したら再scan/rebuild
                      const observerTimeout = 2000; // 2秒で解除
                      const observer = new MutationObserver((mutations) => {
                        const hasNewElements = mutations.some(mutation =>
                          Array.from(mutation.addedNodes).some(node => {
                            // ✅ TypeScript構文を避けるため、instanceof でチェック
                            if (node.nodeType === 1 && node instanceof HTMLElement) {
                              return node.hasAttribute('data-element-id');
                            }
                            return false;
                          })
                        );

                        if (hasNewElements) {
                          console.log('[DesignSurface] 🔍 MutationObserver: New elements detected, re-scanning...');
                          try {
                            if (typeof window.initPreviewRuntime === 'function') {
                              // ✅ 再初期化（再scan/rebuildが実行される）
                              window.initPreviewRuntime(container);
                            }
                          } catch (error) {
                            console.error('[DesignSurface] ❌ MutationObserver: Re-initialization failed:', error);
                          }
                        }
                      });

                      // ✅ 初期化後の一定時間（2秒）だけ監視
                      observer.observe(container, {
                        childList: true,
                        subtree: true
                      });

                      setTimeout(() => {
                        observer.disconnect();
                        console.log('[DesignSurface] 🔍 MutationObserver: Disconnected (2s timeout)');
                      }, observerTimeout);
                    }
                  } catch (error) {
                    console.error('[DesignSurface] ❌ Failed to initialize PreviewRuntime:', error);
                  }
                };

                // ✅ リトライ設定
                const MAX_RETRIES = 20; // 最大20回
                const RETRY_TIMEOUT = 2000; // 2秒でタイムアウト
                let retryCount = 0;
                const startTime = Date.now();

                // ✅ requestAnimationFrameを2回使って、React 18のレンダリング完了を待つ
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    // ✅ DOMゲート判定
                    if (checkDOMGate()) {
                      console.log('[DesignSurface] ✅ DOM gate passed, initializing runtime');
                      initializeRuntime();
                    } else {
                      // ✅ DOMゲート未達: リトライ
                      const retry = () => {
                        retryCount++;
                        const elapsed = Date.now() - startTime;

                        if (elapsed > RETRY_TIMEOUT) {
                          console.error('[DesignSurface] ❌ Timeout: DOM gate not passed after ' + RETRY_TIMEOUT + 'ms');
                          console.error('[DesignSurface] Required IDs:', REQUIRED_IDS);
                          console.error('[DesignSurface] Found elements:', Array.from(container.querySelectorAll('[data-element-id]')).map(el => el.getAttribute('data-element-id')));
                          return;
                        }

                        if (retryCount > MAX_RETRIES) {
                          console.error('[DesignSurface] ❌ Max retries reached: DOM gate not passed after ' + retryCount + ' retries');
                          console.error('[DesignSurface] Required IDs:', REQUIRED_IDS);
                          console.error('[DesignSurface] Found elements:', Array.from(container.querySelectorAll('[data-element-id]')).map(el => el.getAttribute('data-element-id')));
                          return;
                        }

                        if (checkDOMGate()) {
                          console.log('[DesignSurface] ✅ DOM gate passed after ' + retryCount + ' retries, initializing runtime');
                          initializeRuntime();
                        } else {
                          // ✅ 次のフレームで再試行
                          requestAnimationFrame(retry);
                        }
                      };

                      console.log('[DesignSurface] ⏳ DOM gate not passed, retrying...');
                      requestAnimationFrame(retry);
                    }
                  });
                });

                return () => {
                  if (previewSourceRef.current) {
                    previewSourceRef.current.unmount();
                  }
                };
              }, []);

              // ✅ React でオーバーレイをレンダリング
              // ✅ スクロール責任者: [data-scroll-container="true"] が唯一のスクロール責任者（Cursor準拠）
              return React.createElement('div', {
                'data-scroll-container': 'true', // ✅ 唯一のスクロール責任者
                style: { width: '100%', position: 'relative' }, // ✅ height は一切指定しない（CSSで height: 100% を設定）
              }, [
                React.createElement('div', {
                  key: 'container',
                  ref: containerRef,
                  id: 'design-surface-container',
                  'data-design-surface': 'true',
                  style: { width: '100%' }, // ✅ height は auto（CSSで制御）
                }),
              ]);
            }

            // DesignSurface をマウント
            const container = document.getElementById('root');
            if (container) {
              const root = ReactDOM.createRoot(container);
              root.render(React.createElement(DesignSurface));
            }
          })();
        </script>
      </body>
    </html>
  `;
}

/**
 * CSP nonce を生成
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
