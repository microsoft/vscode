/**
 * DesignSurface JavaScript文字列（Webview用）
 * ElementOverlay / DesignSurface / PlaceholderApp / mountApp
 */

export const designSurfaceJs = `
  // ElementOverlay: 選択枠を描画するコンポーネント
  // ✅ Phase 7: リサイズハンドルと仮想スタイルを追加
  // ✅ Cursor 2.2 準拠: position: fixed で viewport 基準、常時同期
  function ElementOverlay({ selectedElement, container, virtualStyle, elementId }) {
    const [rect, setRect] = React.useState(null);
    const animationFrameRef = React.useRef(null);

    // ✅ Cursor 2.2 準拠: 選択枠の位置を更新（毎回 getBoundingClientRect を取得）
    const updateSelectionOutline = React.useCallback(() => {
      if (!selectedElement || !container) {
        setRect(null);
        return;
      }

      try {
        // ✅ 重要: 毎回 getBoundingClientRect() を取得（キャッシュしない）
        const elementRect = selectedElement.getBoundingClientRect();

        let left = elementRect.left;
        let top = elementRect.top;
        let width = elementRect.width;
        let height = elementRect.height;

        // ✅ Phase 7: 仮想スタイルを適用（Preview DOMは変更しない）
        if (virtualStyle) {
          if (virtualStyle.left !== undefined) {
            left += virtualStyle.left;
          }
          if (virtualStyle.top !== undefined) {
            top += virtualStyle.top;
          }
          if (virtualStyle.width !== null) {
            width = virtualStyle.width;
          }
          if (virtualStyle.height !== null) {
            height = virtualStyle.height;
          }
        }

        setRect({ left, top, width, height });
      } catch (error) {
        console.error('[ElementOverlay] Failed to update selection outline:', error);
        setRect(null);
      }
    }, [selectedElement, container, virtualStyle]);

    // ✅ Cursor 2.2 準拠: requestAnimationFrame で常時同期
    React.useEffect(() => {
      if (!selectedElement || !container) {
        return;
      }

      // 初回更新
      updateSelectionOutline();

      // requestAnimationFrame で常時同期
      const animate = () => {
        updateSelectionOutline();
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animationFrameRef.current = requestAnimationFrame(animate);

      // クリーンアップ
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }, [selectedElement, container, updateSelectionOutline]);

    // ✅ Cursor 2.2 準拠: resize / scroll イベントでも再計算
    React.useEffect(() => {
      if (!selectedElement || !container) {
        return;
      }

      const handleResize = () => {
        updateSelectionOutline();
      };

      const handleScroll = () => {
        updateSelectionOutline();
      };

      window.addEventListener('resize', handleResize);
      container.addEventListener('scroll', handleScroll);

      return () => {
        window.removeEventListener('resize', handleResize);
        container.removeEventListener('scroll', handleScroll);
      };
    }, [selectedElement, container, updateSelectionOutline]);

    if (!selectedElement || !container || !rect) {
      return null;
    }

    try {
      // リサイズハンドルを生成
      const dragController = window.__dragInteractionController;
      const resizeHandles = dragController && elementId ? dragController.createResizeHandles(selectedElement, elementId) : [];

      return React.createElement('div', {
        className: 'selection-outline',
        style: {
          position: 'fixed', // ✅ Cursor 2.2 準拠: viewport 基準
          left: rect.left + 'px',
          top: rect.top + 'px',
          width: rect.width + 'px',
          height: rect.height + 'px',
          border: '2px solid #3b82f6',
          pointerEvents: 'none', // ✅ 重要: ヒットテストに参加しない
          zIndex: 10002, // ✅ Cursor 2.2 準拠: 最上層
          boxSizing: 'border-box',
        }
      }, resizeHandles);
    } catch (error) {
      console.error('[ElementOverlay] Failed to render overlay:', error);
      return null;
    }
  }

  // PlaceholderApp コンポーネント
  // ✅ Phase 1-2: PlaceholderAppでOK
  // 実プロジェクトの接続は別フェーズ（Phase 2.5）で行う
  // ✅ Phase 7.x2: デモレイアウト（column/row/grid）を追加
  function PlaceholderApp() {
    return React.createElement('div', {
      style: {
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1e1e1e',
        color: '#cccccc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px',
        boxSizing: 'border-box',
      }
    }, [
      // ✅ Phase 7.x2: 説明テキスト
      React.createElement('div', {
        key: 'header',
        style: {
          textAlign: 'center',
          marginBottom: '40px',
        }
      }, [
        React.createElement('h2', {
          key: 'title',
          style: {
            color: '#007acc',
            marginBottom: '20px',
          }
        }, '🎨 Design Surface'),
        React.createElement('p', {
          key: 'desc1',
          style: {
            lineHeight: '1.6',
            marginBottom: '10px',
          }
        }, 'Preview表示レイヤーが正常に動作しています。'),
        React.createElement('p', {
          key: 'desc2',
          style: {
            lineHeight: '1.6',
            marginBottom: '10px',
          }
        }, 'この上に UI操作レイヤーを安全に重ねることができます。'),
        React.createElement('p', {
          key: 'phase',
          style: {
            marginTop: '20px',
            fontSize: '12px',
            color: '#888',
          }
        }, 'Phase 7.x Flex: Drag & Drop + Flex Layout 完全対応（Column / Row / Wrap / Nested）'),
        React.createElement('p', {
          key: 'hint',
          style: {
            marginTop: '10px',
            fontSize: '11px',
            color: '#666',
          }
        }, '💡 要素をクリックして選択し、ドラッグ&ドロップで移動できます'),
      ]),
      // ✅ Phase 7.x2: デモレイアウト（Column / Row / Grid）
      React.createElement('div', {
        key: 'demo-layouts',
        style: {
          display: 'flex',
          gap: '20px',
          padding: '20px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }
      }, [
        // ✅ Phase 7.x Flex: Flex Column レイアウト
        React.createElement('div', {
          key: 'flex-column-demo',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            border: '2px solid #3b82f6',
            padding: '15px',
            minWidth: '200px',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
          }
        }, [
          React.createElement('div', {
            key: 'flex-col-a',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
            }
          }, 'Flex Column A'),
          React.createElement('div', {
            key: 'flex-col-b',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
            }
          }, 'Flex Column B'),
          React.createElement('div', {
            key: 'flex-col-c',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
            }
          }, 'Flex Column C'),
        ]),
        // ✅ Phase 7.x Flex: Flex Row レイアウト
        React.createElement('div', {
          key: 'flex-row-demo',
          style: {
            display: 'flex',
            flexDirection: 'row',
            gap: '10px',
            border: '2px solid #3b82f6',
            padding: '15px',
            minWidth: '350px',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
          }
        }, [
          React.createElement('div', {
            key: 'flex-row-a',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
            }
          }, 'Flex Row A'),
          React.createElement('div', {
            key: 'flex-row-b',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
            }
          }, 'Flex Row B'),
          React.createElement('div', {
            key: 'flex-row-c',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
            }
          }, 'Flex Row C'),
        ]),
        // ✅ Phase 7.x Flex: Flex Wrap レイアウト
        React.createElement('div', {
          key: 'flex-wrap-demo',
          style: {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: '10px',
            border: '2px solid #3b82f6',
            padding: '15px',
            width: '300px',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
          }
        }, [
          React.createElement('div', {
            key: 'wrap-1',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
              width: '120px',
            }
          }, 'Wrap 1'),
          React.createElement('div', {
            key: 'wrap-2',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
              width: '120px',
            }
          }, 'Wrap 2'),
          React.createElement('div', {
            key: 'wrap-3',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
              width: '120px',
            }
          }, 'Wrap 3'),
          React.createElement('div', {
            key: 'wrap-4',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
              width: '120px',
            }
          }, 'Wrap 4'),
          React.createElement('div', {
            key: 'wrap-5',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
              width: '120px',
            }
          }, 'Wrap 5'),
          React.createElement('div', {
            key: 'wrap-6',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
              width: '120px',
            }
          }, 'Wrap 6'),
          React.createElement('div', {
            key: 'wrap-7',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
              width: '120px',
            }
          }, 'Wrap 7'),
          React.createElement('div', {
            key: 'wrap-8',
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
              width: '120px',
            }
          }, 'Wrap 8'),
        ]),
        // ✅ Phase 7.x Flex: Nested Flex（Row内にColumn子）
        React.createElement('div', {
          key: 'nested-flex-demo',
          style: {
            display: 'flex',
            flexDirection: 'row',
            gap: '15px',
            border: '2px solid #3b82f6',
            padding: '15px',
            minWidth: '400px',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
          }
        }, [
          React.createElement('div', {
            key: 'nested-col-1',
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '10px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '4px',
            }
          }, [
            React.createElement('div', {
              key: 'nested-item-1',
              style: {
                padding: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.3)',
                borderRadius: '2px',
              }
            }, 'Nested 1'),
            React.createElement('div', {
              key: 'nested-item-2',
              style: {
                padding: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.3)',
                borderRadius: '2px',
              }
            }, 'Nested 2'),
          ]),
          React.createElement('div', {
            key: 'nested-col-2',
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '10px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '4px',
            }
          }, [
            React.createElement('div', {
              key: 'nested-item-3',
              style: {
                padding: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.3)',
                borderRadius: '2px',
              }
            }, 'Nested 3'),
            React.createElement('div', {
              key: 'nested-item-4',
              style: {
                padding: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.3)',
                borderRadius: '2px',
              }
            }, 'Nested 4'),
          ]),
        ]),
        // Grid レイアウト
        React.createElement('div', {
          key: 'grid-demo',
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 100px)',
            gridTemplateRows: 'repeat(2, 60px)',
            gap: '10px',
            border: '1px solid #444',
            padding: '10px',
          }
        }, [
          React.createElement('div', {
            key: 'g1',
            style: {
              padding: '10px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'G1'),
          React.createElement('div', {
            key: 'g2',
            style: {
              padding: '10px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'G2'),
          React.createElement('div', {
            key: 'g3',
            style: {
              padding: '10px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'G3'),
          React.createElement('div', {
            key: 'g4',
            style: {
              padding: '10px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'G4'),
          React.createElement('div', {
            key: 'g5',
            style: {
              padding: '10px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'G5'),
        ]),
      ]),
    ]);
  }

  // mountApp 関数
  function mountApp(container, AppComponent) {
    if (!container || !(container instanceof HTMLElement)) {
      throw new Error('[mountApp] Invalid container element');
    }

    // コンテナをクリア
    container.innerHTML = '';

    try {
      // React 18のcreateRootを使用
      const root = ReactDOM.createRoot(container);

      // React.StrictModeでラップしてレンダリング
      root.render(
        React.createElement(React.StrictMode, null,
          React.createElement(AppComponent)
        )
      );

      console.log('[mountApp] ✅ App mounted successfully');

      // グローバルにrootを保存（unmount用）
      window.__designSurfaceRoot = root;
    } catch (error) {
      console.error('[mountApp] ❌ Failed to mount app:', error);
      throw error;
    }
  }
`;

