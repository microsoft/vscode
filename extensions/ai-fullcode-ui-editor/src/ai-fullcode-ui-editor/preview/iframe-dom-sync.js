/**
 * iframe内DOM同期スクリプト
 *
 * Phase 4: iframe内での要素選択とDOM操作のキャプチャ
 * このスクリプトはiframe内のページに注入され、DOM操作をキャプチャしてpostMessageで送信します。
 *
 * 注意: このスクリプトはiframe内のページに注入されるため、
 * クロスオリジン制約により、同じオリジンの場合のみ動作します。
 */

(function() {
  'use strict';

  // 既に注入されている場合はスキップ
  if (window.__DOM_SYNC_INJECTED__) {
    return;
  }
  window.__DOM_SYNC_INJECTED__ = true;

  // VSCode Webview APIが利用可能か確認
  const vscode = (window.parent && window.parent.__VSCODE__) || 
                 (window.top && window.top.__VSCODE__);

  if (!vscode) {
    // VSCode Webview APIが利用できない場合は、postMessageで親ウィンドウに送信
    // 親ウィンドウ（previewService.tsのWebview）が転送する
    console.log('[iframe-dom-sync] VSCode API not available, using postMessage');
  }

  /**
   * メッセージを送信
   */
  function sendMessage(message) {
    if (vscode) {
      vscode.postMessage(message);
    } else {
      // postMessageで親ウィンドウに送信
      window.parent.postMessage(message, '*');
    }
  }

  /**
   * 要素のdata-nodeidを取得（親要素まで遡る）
   */
  function getNodeId(element) {
    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      const nodeId = current.getAttribute('data-nodeid');
      if (nodeId) {
        return nodeId;
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * 要素をハイライト
   */
  let highlightedElement = null;
  let originalOutline = null;

  function highlightElement(element) {
    // 既存のハイライトを解除
    if (highlightedElement) {
      unhighlightElement();
    }

    highlightedElement = element;
    originalOutline = element.style.outline;
    element.style.outline = '2px solid #4ec9b0';
    element.style.outlineOffset = '2px';
  }

  function unhighlightElement() {
    if (highlightedElement) {
      highlightedElement.style.outline = originalOutline || '';
      highlightedElement = null;
      originalOutline = null;
    }
  }

  /**
   * 要素選択ハンドラー
   */
  function handleElementClick(event) {
    // 右クリックやCtrl+クリックなどは無視
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const nodeId = getNodeId(event.target);
    if (!nodeId) {
      return;
    }

    // 要素をハイライト
    highlightElement(event.target);

    // DOM_OPERATIONイベントを送信
    sendMessage({
      type: 'DOM_OPERATION',
      payload: {
        nodeId: nodeId,
        operation: 'SELECT',
        source: 'user',
        timestamp: Date.now(),
      },
    });

    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * MutationObserverでDOM変更をキャプチャ
   */
  let isUpdatingFromCode = false;
  const mutationObserver = new MutationObserver((mutations) => {
    // source: codeの場合はスキップ
    if (isUpdatingFromCode) {
      return;
    }

    for (const mutation of mutations) {
      // 属性変更を検出
      if (mutation.type === 'attributes') {
        const target = mutation.target;
        const nodeId = getNodeId(target);
        if (!nodeId) {
          continue;
        }

        const changedAttrs = {};
        const oldValue = mutation.oldValue;
        
        // 変更された属性を取得
        if (mutation.attributeName) {
          const currentValue = target.getAttribute(mutation.attributeName);
          if (currentValue !== oldValue) {
            changedAttrs[mutation.attributeName] = currentValue;
          }
        }

        if (Object.keys(changedAttrs).length > 0) {
          // style属性の変更はUPDATE_STYLEとして扱う
          if (mutation.attributeName === 'style') {
            const styleValue = target.getAttribute('style');
            const styleObj = {};
            if (styleValue) {
              styleValue.split(';').forEach(rule => {
                const [key, value] = rule.split(':').map(s => s.trim());
                if (key && value) {
                  styleObj[key] = value;
                }
              });
            }

            sendMessage({
              type: 'DOM_OPERATION',
              payload: {
                nodeId: nodeId,
                operation: 'UPDATE_STYLE',
                changes: {
                  style: styleObj,
                },
                source: 'user',
                timestamp: Date.now(),
              },
            });
          } else {
            // その他の属性変更はUPDATE_PROPSとして扱う
            sendMessage({
              type: 'DOM_OPERATION',
              payload: {
                nodeId: nodeId,
                operation: 'UPDATE_PROPS',
                changes: {
                  props: changedAttrs,
                },
                source: 'user',
                timestamp: Date.now(),
              },
            });
          }
        }
      }

      // 要素削除を検出
      if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
        for (const removedNode of Array.from(mutation.removedNodes)) {
          if (removedNode.nodeType === Node.ELEMENT_NODE) {
            const nodeId = getNodeId(removedNode);
            if (nodeId) {
              sendMessage({
                type: 'DOM_OPERATION',
                payload: {
                  nodeId: nodeId,
                  operation: 'REMOVE',
                  source: 'user',
                  timestamp: Date.now(),
                },
              });
            }
          }
        }
      }
    }
  });

  /**
   * AST_APPLIEDイベントを受信
   */
  window.addEventListener('message', (event) => {
    // 信頼できるソースからのメッセージのみ処理
    if (event.data && event.data.type === 'AST_APPLIED') {
      const { status } = event.data.payload;
      
      if (status === 'success') {
        // 成功時は何もしない（dev serverのHMRが自動的に反映する）
        isUpdatingFromCode = true;
        setTimeout(() => {
          isUpdatingFromCode = false;
        }, 100);
      } else {
        // エラー時はログに出力
        console.error('[iframe-dom-sync] AST適用エラー:', event.data.payload.error);
      }
    }

    // INJECT_DOM_SYNC_SCRIPTメッセージを受信した場合は既に注入済みなので何もしない
    if (event.data && event.data.type === 'INJECT_DOM_SYNC_SCRIPT') {
      // 既に注入済み
    }
  });

  /**
   * 初期化
   */
  function init() {
    // クリックイベントリスナーを追加
    document.addEventListener('click', handleElementClick, true);

    // MutationObserverを開始
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      subtree: true,
    });

    console.log('[iframe-dom-sync] DOM同期スクリプトが注入されました');
  }

  // DOMContentLoaded後に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

