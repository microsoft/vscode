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
    // ✅ 修正: viewport 外の要素検出を追加
    const updateSelectionOutline = React.useCallback(() => {
      if (!selectedElement || !container) {
        setRect(null);
        return;
      }

      try {
        // ✅ 重要: 毎回 getBoundingClientRect() を取得（キャッシュしない）
        const elementRect = selectedElement.getBoundingClientRect();

        // ✅ 修正: viewport 外の要素を検出
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const isOutOfViewport = elementRect.right < 0 ||
                                elementRect.bottom < 0 ||
                                elementRect.left > viewportWidth ||
                                elementRect.top > viewportHeight;

        // ✅ 修正: viewport 外の場合は選択を解除（Bubble 方式）
        if (isOutOfViewport) {
          setRect(null);
          // ✅ 選択を解除（親コンポーネントに通知）
          if (window.__selectionController) {
            window.__selectionController.clearSelection();
          }
          return;
        }

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
      return null;
    }
  }

  // ✅ Phase 0: 検証用 Preview UI カタログ
  // すべての検証ケースを一画面で確認できる構成
  // UI操作ロジック・Drag & Drop アルゴリズムは変更しない
  function PlaceholderApp() {
    // ✅ Phase 1: stable elementId 生成ヘルパー
    let elementIdCounter = 0;
    function generateElementId(prefix) {
      elementIdCounter++;
      return 'dom:' + prefix + '_' + elementIdCounter.toString(36);
    }

    // ✅ Phase 0: Conditional Render 用の state
    const [conditionA, setConditionA] = React.useState(true);
    const [conditionB, setConditionB] = React.useState(true);

    // ✅ Phase 0: Map 用のデータ
    const mapItems = [
      { id: 'item-1', label: 'Card 1', text: 'Text content 1' },
      { id: 'item-2', label: 'Card 2', text: 'Text content 2' },
      { id: 'item-3', label: 'Card 3', text: 'Text content 3' },
      { id: 'item-4', label: 'Card 4', text: 'Text content 4' },
      { id: 'item-5', label: 'Card 5', text: 'Text content 5' },
      { id: 'item-6', label: 'Card 6', text: 'Text content 6' },
    ];

    return React.createElement('div', {
      'data-element-id': generateElementId('root'),
      style: {
        width: '100%',
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        color: '#333333',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px',
        boxSizing: 'border-box',
      }
    }, [
      // ✅ Phase 0: ヘッダー
      React.createElement('div', {
        key: 'header',
        'data-element-id': generateElementId('header'),
        style: {
          textAlign: 'center',
          marginBottom: '30px',
          paddingBottom: '20px',
          borderBottom: '2px solid #e5e5e5',
        }
      }, [
        React.createElement('h1', {
          key: 'title',
          'data-element-id': generateElementId('title'),
          style: {
            color: '#007acc',
            marginBottom: '10px',
            fontSize: '24px',
          }
        }, '🧪 Phase 0: 検証用 Preview UI カタログ'),
        React.createElement('p', {
          key: 'desc',
          'data-element-id': generateElementId('desc'),
          style: {
            fontSize: '12px',
            color: '#888',
            marginTop: '10px',
          }
        }, 'すべての検証ケースを一画面で確認できます。要素をクリックして選択し、ドラッグ&ドロップで移動できます。'),
      ]),

      // ✅ Phase 0: ① Flex Column（縦レイアウト）
      React.createElement('section', {
        key: 'section-flex-column',
        'data-element-id': generateElementId('section-flex-column'),
        style: {
          marginBottom: '40px',
          padding: '20px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'rgba(59, 130, 246, 0.02)',
        }
      }, [
        React.createElement('h2', {
          key: 'h2-column',
          'data-element-id': generateElementId('h2-column'),
          style: {
            color: '#3b82f6',
            marginBottom: '15px',
            fontSize: '18px',
            borderBottom: '1px solid #e5e5e5',
            paddingBottom: '8px',
          }
        }, '① Flex Column（縦レイアウト）'),
        React.createElement('div', {
          key: 'flex-column-container',
          'data-element-id': generateElementId('flex-column-container'),
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            border: '2px solid #3b82f6',
            padding: '15px',
            minWidth: '250px',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
          }
        }, [
          React.createElement('div', {
            key: 'box-a',
            'data-element-id': generateElementId('box-a'),
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
            }
          }, 'Box A'),
          React.createElement('div', {
            key: 'box-b',
            'data-element-id': generateElementId('box-b'),
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
            }
          }, [
            'Box B',
            React.createElement('div', {
              key: 'nested-column-in-b',
              'data-element-id': generateElementId('nested-column-in-b'),
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '10px',
                padding: '10px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px dashed rgba(59, 130, 246, 0.3)',
                borderRadius: '4px',
              }
            }, [
              React.createElement('div', {
                key: 'nested-b-1',
                'data-element-id': generateElementId('nested-b-1'),
                style: {
                  padding: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.3)',
                  borderRadius: '2px',
                  fontSize: '12px',
                }
              }, 'Nested Column 1'),
              React.createElement('div', {
                key: 'nested-b-2',
                'data-element-id': generateElementId('nested-b-2'),
                style: {
                  padding: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.3)',
                  borderRadius: '2px',
                  fontSize: '12px',
                }
              }, 'Nested Column 2'),
            ]),
          ]),
          React.createElement('div', {
            key: 'box-c',
            'data-element-id': generateElementId('box-c'),
            style: {
              padding: '15px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '4px',
            }
          }, 'Box C'),
        ]),
      ]),

      // ✅ Phase 0: ② Flex Row（横レイアウト）
      React.createElement('section', {
        key: 'section-flex-row',
        'data-element-id': generateElementId('section-flex-row'),
        style: {
          marginBottom: '40px',
          padding: '20px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'rgba(34, 197, 94, 0.02)',
        }
      }, [
        React.createElement('h2', {
          key: 'h2-row',
          'data-element-id': generateElementId('h2-row'),
          style: {
            color: '#22c55e',
            marginBottom: '15px',
            fontSize: '18px',
            borderBottom: '1px solid #e5e5e5',
            paddingBottom: '8px',
          }
        }, '② Flex Row（横レイアウト）'),
        React.createElement('div', {
          key: 'flex-row-container',
          'data-element-id': generateElementId('flex-row-container'),
          style: {
            display: 'flex',
            flexDirection: 'row',
            gap: '16px',
            border: '2px solid #22c55e',
            padding: '15px',
            minWidth: '400px',
            backgroundColor: 'rgba(34, 197, 94, 0.05)',
          }
        }, [
          React.createElement('div', {
            key: 'item-1',
            'data-element-id': generateElementId('item-1'),
            style: {
              padding: '15px',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.5)',
              borderRadius: '4px',
            }
          }, 'Item 1'),
          React.createElement('div', {
            key: 'item-2',
            'data-element-id': generateElementId('item-2'),
            style: {
              padding: '15px',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.5)',
              borderRadius: '4px',
            }
          }, [
            'Item 2',
            React.createElement('div', {
              key: 'nested-column-in-item2',
              'data-element-id': generateElementId('nested-column-in-item2'),
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '10px',
                padding: '10px',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px dashed rgba(34, 197, 94, 0.3)',
                borderRadius: '4px',
              }
            }, [
              React.createElement('div', {
                key: 'nested-item2-1',
                'data-element-id': generateElementId('nested-item2-1'),
                style: {
                  padding: '8px',
                  backgroundColor: 'rgba(34, 197, 94, 0.3)',
                  borderRadius: '2px',
                  fontSize: '12px',
                }
              }, 'Nested Column 1'),
              React.createElement('div', {
                key: 'nested-item2-2',
                'data-element-id': generateElementId('nested-item2-2'),
                style: {
                  padding: '8px',
                  backgroundColor: 'rgba(34, 197, 94, 0.3)',
                  borderRadius: '2px',
                  fontSize: '12px',
                }
              }, 'Nested Column 2'),
            ]),
          ]),
          React.createElement('div', {
            key: 'item-3',
            'data-element-id': generateElementId('item-3'),
            style: {
              padding: '15px',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.5)',
              borderRadius: '4px',
            }
          }, 'Item 3'),
        ]),
      ]),

      // ✅ Phase 0: ③ Grid レイアウト（3x3）
      React.createElement('section', {
        key: 'section-grid',
        'data-element-id': generateElementId('section-grid'),
        style: {
          marginBottom: '40px',
          padding: '20px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'rgba(168, 85, 247, 0.02)',
        }
      }, [
        React.createElement('h2', {
          key: 'h2-grid',
          'data-element-id': generateElementId('h2-grid'),
          style: {
            color: '#a855f7',
            marginBottom: '15px',
            fontSize: '18px',
            borderBottom: '1px solid #e5e5e5',
            paddingBottom: '8px',
          }
        }, '③ Grid レイアウト（3x3）'),
        React.createElement('div', {
          key: 'grid-container',
          'data-element-id': generateElementId('grid-container'),
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridTemplateRows: 'repeat(3, 80px)',
            gap: '12px',
            border: '2px solid #a855f7',
            padding: '15px',
            backgroundColor: 'rgba(168, 85, 247, 0.05)',
          }
        }, [
          React.createElement('div', {
            key: 'cell-1',
            'data-element-id': generateElementId('cell-1'),
            style: {
              padding: '15px',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid rgba(168, 85, 247, 0.5)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'Cell 1'),
          React.createElement('div', {
            key: 'cell-2',
            'data-element-id': generateElementId('cell-2'),
            style: {
              gridColumn: 'span 2',
              padding: '15px',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid rgba(168, 85, 247, 0.5)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'Cell 2 (col-span:2)'),
          React.createElement('div', {
            key: 'cell-3',
            'data-element-id': generateElementId('cell-3'),
            style: {
              gridRow: 'span 2',
              padding: '15px',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid rgba(168, 85, 247, 0.5)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'Cell 3 (row-span:2)'),
          React.createElement('div', {
            key: 'cell-4',
            'data-element-id': generateElementId('cell-4'),
            style: {
              padding: '15px',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid rgba(168, 85, 247, 0.5)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'Cell 4'),
          React.createElement('div', {
            key: 'cell-5',
            'data-element-id': generateElementId('cell-5'),
            style: {
              padding: '15px',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid rgba(168, 85, 247, 0.5)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'Cell 5'),
          React.createElement('div', {
            key: 'cell-6',
            'data-element-id': generateElementId('cell-6'),
            style: {
              padding: '15px',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid rgba(168, 85, 247, 0.5)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }, 'Cell 6'),
        ]),
      ]),

      // ✅ Phase 0: ④ Map（繰り返し要素）
      React.createElement('section', {
        key: 'section-map',
        'data-element-id': generateElementId('section-map'), // ✅ 追加: section に ID
        style: {
          marginBottom: '40px',
          padding: '20px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'rgba(251, 191, 36, 0.02)',
        }
      }, [
        React.createElement('h2', {
          key: 'h2-map',
          'data-element-id': generateElementId('h2-map'), // ✅ 追加: h2 に ID
          style: {
            color: '#fbbf24',
            marginBottom: '15px',
            fontSize: '18px',
            borderBottom: '1px solid #e5e5e5',
            paddingBottom: '8px',
          }
        }, '④ Map（繰り返し要素）'),
        React.createElement('div', {
          key: 'map-container',
          'data-element-id': generateElementId('map-container'), // ✅ 追加: container に ID
          style: {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: '12px',
            border: '2px solid #fbbf24',
            padding: '15px',
            backgroundColor: 'rgba(251, 191, 36, 0.05)',
          }
        }, mapItems.map((item) => {
          return React.createElement('div', {
            key: item.id,
            'data-element-id': generateElementId('map-item-' + item.id), // ✅ 追加: 決定論的ID（item.id を含む）
            style: {
              padding: '15px',
              backgroundColor: 'rgba(251, 191, 36, 0.2)',
              border: '1px solid rgba(251, 191, 36, 0.5)',
              borderRadius: '4px',
              minWidth: '150px',
            }
          }, [
            React.createElement('div', {
              key: item.id + '-label',
              'data-element-id': generateElementId('map-item-' + item.id + '-label'), // ✅ 追加: label に ID
              style: {
                fontWeight: 'bold',
                marginBottom: '8px',
              }
            }, item.label),
            React.createElement('div', {
              key: item.id + '-text',
              'data-element-id': generateElementId('map-item-' + item.id + '-text'), // ✅ 追加: text に ID
              style: {
                fontSize: '12px',
                color: '#aaa',
              }
            }, item.text),
          ]);
        })),
      ]),

      // ✅ Phase 0: ⑤ Conditional Render
      React.createElement('section', {
        key: 'section-conditional',
        'data-element-id': generateElementId('section-conditional'),
        style: {
          marginBottom: '40px',
          padding: '20px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'rgba(239, 68, 68, 0.02)',
        }
      }, [
        React.createElement('h2', {
          key: 'h2-conditional',
          'data-element-id': generateElementId('h2-conditional'),
          style: {
            color: '#ef4444',
            marginBottom: '15px',
            fontSize: '18px',
            borderBottom: '1px solid #e5e5e5',
            paddingBottom: '8px',
          }
        }, '⑤ Conditional Render'),
        React.createElement('div', {
          key: 'conditional-controls',
          'data-element-id': generateElementId('conditional-controls'),
          style: {
            marginBottom: '20px',
            display: 'flex',
            gap: '15px',
            alignItems: 'center',
          }
        }, [
          React.createElement('label', {
            key: 'toggle-a',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }
          }, [
            React.createElement('input', {
              key: 'checkbox-a',
              type: 'checkbox',
              checked: conditionA,
              onChange: (e) => setConditionA(e.target.checked),
              style: {
                cursor: 'pointer',
              }
            }),
            React.createElement('span', {
              key: 'label-a',
              style: {
                fontSize: '12px',
              }
            }, 'Condition A (&&)'),
          ]),
          React.createElement('label', {
            key: 'toggle-b',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }
          }, [
            React.createElement('input', {
              key: 'checkbox-b',
              type: 'checkbox',
              checked: conditionB,
              onChange: (e) => setConditionB(e.target.checked),
              style: {
                cursor: 'pointer',
              }
            }),
            React.createElement('span', {
              key: 'label-b',
              style: {
                fontSize: '12px',
              }
            }, 'Condition B (?:)'),
          ]),
        ]),
        React.createElement('div', {
          key: 'conditional-container',
          'data-element-id': generateElementId('conditional-container'),
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            border: '2px solid #ef4444',
            padding: '15px',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
          }
        }, [
          // ✅ Phase 0: パターンA (condition && <Box />)
          React.createElement('div', {
            key: 'pattern-a',
            'data-element-id': generateElementId('pattern-a'),
            style: {
              padding: '10px',
              border: '1px dashed #ef4444',
              borderRadius: '4px',
            }
          }, [
            React.createElement('div', {
              key: 'pattern-a-label',
              'data-element-id': generateElementId('pattern-a-label'),
              style: {
                fontSize: '11px',
                color: '#888',
                marginBottom: '8px',
              }
            }, 'Pattern A: condition && <Box />'),
            conditionA && React.createElement('div', {
              key: 'conditional-box-a',
              'data-element-id': generateElementId('conditional-box-a'),
              style: {
                padding: '15px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: '4px',
              }
            }, 'Conditional Box A (visible when conditionA is true)'),
          ]),
          // ✅ Phase 0: パターンB (condition ? <A /> : <B />)
          React.createElement('div', {
            key: 'pattern-b',
            'data-element-id': generateElementId('pattern-b'),
            style: {
              padding: '10px',
              border: '1px dashed #ef4444',
              borderRadius: '4px',
            }
          }, [
            React.createElement('div', {
              key: 'pattern-b-label',
              'data-element-id': generateElementId('pattern-b-label'),
              style: {
                fontSize: '11px',
                color: '#888',
                marginBottom: '8px',
              }
            }, 'Pattern B: condition ? <A /> : <B />'),
            conditionB ? React.createElement('div', {
              key: 'conditional-box-b-true',
              'data-element-id': generateElementId('conditional-box-b-true'),
              style: {
                padding: '15px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: '4px',
              }
            }, 'Conditional Box B (true branch)') : React.createElement('div', {
              key: 'conditional-box-b-false',
              'data-element-id': generateElementId('conditional-box-b-false'),
              style: {
                padding: '15px',
                backgroundColor: 'rgba(100, 100, 100, 0.2)',
                border: '1px solid rgba(100, 100, 100, 0.5)',
                borderRadius: '4px',
              }
            }, 'Conditional Box B (false branch)'),
          ]),
        ]),
      ]),

      // ✅ Phase 0: ⑥ Absolute / Special ケース
      React.createElement('section', {
        key: 'section-absolute',
        'data-element-id': generateElementId('section-absolute'),
        style: {
          marginBottom: '40px',
          padding: '20px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'rgba(139, 92, 246, 0.02)',
          position: 'relative',
          minHeight: '200px',
        }
      }, [
        React.createElement('h2', {
          key: 'h2-absolute',
          'data-element-id': generateElementId('h2-absolute'),
          style: {
            color: '#8b5cf6',
            marginBottom: '15px',
            fontSize: '18px',
            borderBottom: '1px solid #e5e5e5',
            paddingBottom: '8px',
          }
        }, '⑥ Absolute / Special ケース'),
        React.createElement('div', {
          key: 'absolute-container',
          'data-element-id': generateElementId('absolute-container'),
          style: {
            position: 'relative',
            width: '100%',
            height: '180px',
            border: '2px solid #8b5cf6',
            padding: '15px',
            backgroundColor: 'rgba(139, 92, 246, 0.05)',
          }
        }, [
          // ✅ Phase 0: position: absolute の要素
          React.createElement('div', {
            key: 'absolute-1',
            'data-element-id': generateElementId('absolute-1'),
            style: {
              position: 'absolute',
              top: '20px',
              left: '20px',
              padding: '15px',
              backgroundColor: 'rgba(139, 92, 246, 0.3)',
              border: '1px solid rgba(139, 92, 246, 0.6)',
              borderRadius: '4px',
            }
          }, 'Absolute 1'),
          React.createElement('div', {
            key: 'absolute-2',
            'data-element-id': generateElementId('absolute-2'),
            style: {
              position: 'absolute',
              top: '60px',
              right: '20px',
              padding: '15px',
              backgroundColor: 'rgba(139, 92, 246, 0.3)',
              border: '1px solid rgba(139, 92, 246, 0.6)',
              borderRadius: '4px',
            }
          }, 'Absolute 2'),
          // ✅ Phase 0: z-index を持つ要素
          React.createElement('div', {
            key: 'z-index-element',
            'data-element-id': generateElementId('z-index-element'),
            style: {
              position: 'absolute',
              top: '100px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '15px',
              backgroundColor: 'rgba(139, 92, 246, 0.4)',
              border: '2px solid rgba(139, 92, 246, 0.7)',
              borderRadius: '4px',
              zIndex: 10,
            }
          }, 'Z-index: 10'),
          // ✅ Phase 0: 親よりはみ出す要素
          React.createElement('div', {
            key: 'overflow-element',
            'data-element-id': generateElementId('overflow-element'),
            style: {
              position: 'absolute',
              bottom: '-30px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '15px',
              backgroundColor: 'rgba(139, 92, 246, 0.3)',
              border: '1px solid rgba(139, 92, 246, 0.6)',
              borderRadius: '4px',
              width: '200px',
            }
          }, 'Overflow Element'),
        ]),
      ]),

      // ✅ Phase 0: ⑦ 巨大コンテナ（スクロール検証）
      React.createElement('section', {
        key: 'section-scroll',
        'data-element-id': generateElementId('section-scroll'), // ✅ 追加: section に ID
        style: {
          marginBottom: '40px',
          padding: '20px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'rgba(14, 165, 233, 0.02)',
        }
      }, [
        React.createElement('h2', {
          key: 'h2-scroll',
          'data-element-id': generateElementId('h2-scroll'), // ✅ 追加: h2 に ID
          style: {
            color: '#0ea5e9',
            marginBottom: '15px',
            fontSize: '18px',
            borderBottom: '1px solid #e5e5e5',
            paddingBottom: '8px',
          }
        }, '⑦ 巨大コンテナ（スクロール検証）'),
        React.createElement('div', {
          key: 'scroll-container',
          'data-element-id': generateElementId('scroll-container'), // ✅ 追加: container に ID
          style: {
            maxHeight: '400px',
            overflowY: 'auto',
            border: '2px solid #0ea5e9',
            padding: '15px',
            backgroundColor: 'rgba(14, 165, 233, 0.05)',
          }
        }, [
          // ✅ Phase 0: 高さが viewport の 2-3倍になるコンテンツ
          React.createElement('div', {
            key: 'scroll-content',
            'data-element-id': generateElementId('scroll-content'), // ✅ 追加: content に ID
            style: {
              height: '2000px', // viewport の 2-3倍
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }
          }, [
            // Column セクション
            React.createElement('div', {
              key: 'scroll-col-section',
              'data-element-id': generateElementId('scroll-col-section'), // ✅ 追加: section に ID
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '15px',
                border: '1px solid rgba(14, 165, 233, 0.3)',
                borderRadius: '4px',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
              }
            }, [
              React.createElement('div', {
                key: 'scroll-col-1',
                'data-element-id': generateElementId('scroll-col-1'), // ✅ 追加: item に ID
                style: {
                  padding: '15px',
                  backgroundColor: 'rgba(14, 165, 233, 0.2)',
                  border: '1px solid rgba(14, 165, 233, 0.5)',
                  borderRadius: '4px',
                }
              }, 'Scroll Column 1'),
              React.createElement('div', {
                key: 'scroll-col-2',
                'data-element-id': generateElementId('scroll-col-2'), // ✅ 追加: item に ID
                style: {
                  padding: '15px',
                  backgroundColor: 'rgba(14, 165, 233, 0.2)',
                  border: '1px solid rgba(14, 165, 233, 0.5)',
                  borderRadius: '4px',
                }
              }, 'Scroll Column 2'),
              React.createElement('div', {
                key: 'scroll-col-3',
                'data-element-id': generateElementId('scroll-col-3'), // ✅ 追加: item に ID
                style: {
                  padding: '15px',
                  backgroundColor: 'rgba(14, 165, 233, 0.2)',
                  border: '1px solid rgba(14, 165, 233, 0.5)',
                  borderRadius: '4px',
                }
              }, 'Scroll Column 3'),
            ]),
            // Row セクション
            React.createElement('div', {
              key: 'scroll-row-section',
              'data-element-id': generateElementId('scroll-row-section'), // ✅ 追加: section に ID
              style: {
                display: 'flex',
                flexDirection: 'row',
                gap: '16px',
                padding: '15px',
                border: '1px solid rgba(14, 165, 233, 0.3)',
                borderRadius: '4px',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
              }
            }, [
              React.createElement('div', {
                key: 'scroll-row-1',
                'data-element-id': generateElementId('scroll-row-1'), // ✅ 追加: item に ID
                style: {
                  padding: '15px',
                  backgroundColor: 'rgba(14, 165, 233, 0.2)',
                  border: '1px solid rgba(14, 165, 233, 0.5)',
                  borderRadius: '4px',
                }
              }, 'Scroll Row 1'),
              React.createElement('div', {
                key: 'scroll-row-2',
                'data-element-id': generateElementId('scroll-row-2'), // ✅ 追加: item に ID
                style: {
                  padding: '15px',
                  backgroundColor: 'rgba(14, 165, 233, 0.2)',
                  border: '1px solid rgba(14, 165, 233, 0.5)',
                  borderRadius: '4px',
                }
              }, 'Scroll Row 2'),
              React.createElement('div', {
                key: 'scroll-row-3',
                'data-element-id': generateElementId('scroll-row-3'), // ✅ 追加: item に ID
                style: {
                  padding: '15px',
                  backgroundColor: 'rgba(14, 165, 233, 0.2)',
                  border: '1px solid rgba(14, 165, 233, 0.5)',
                  borderRadius: '4px',
                }
              }, 'Scroll Row 3'),
            ]),
            // 繰り返しセクション（スクロール検証用）
            ...Array.from({ length: 20 }, (_, i) => {
              return React.createElement('div', {
                key: 'scroll-repeat-' + i,
                'data-element-id': generateElementId('scroll-repeat-' + i), // ✅ 追加: 決定論的ID（i を含む）
                style: {
                  padding: '15px',
                  backgroundColor: i % 2 === 0 ? 'rgba(14, 165, 233, 0.1)' : 'rgba(14, 165, 233, 0.15)',
                  border: '1px solid rgba(14, 165, 233, 0.3)',
                  borderRadius: '4px',
                  marginTop: i === 0 ? '0' : '10px',
                }
              }, 'Scroll Item ' + (i + 1));
            }),
          ]),
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

      // グローバルにrootを保存（unmount用）
      window.__designSurfaceRoot = root;
    } catch (error) {
      throw error;
    }
  }

  // ✅ エラー修正: PlaceholderApp をグローバルに公開（previewSourceRuntime.ts で使用）
  window.PlaceholderApp = PlaceholderApp;
`;

