/**
 * PlaceholderPreviewSource
 * ✅ Cursor 2.2準拠: PlaceholderApp を PreviewSource として実装
 */

import { PreviewSource } from '../PreviewSource';

/**
 * PlaceholderPreviewSource: PlaceholderApp を PreviewSource として実装
 */
export class PlaceholderPreviewSource implements PreviewSource {
  private root: any; // ReactDOM.Root
  private isMountedFlag: boolean;

  constructor() {
    this.root = null;
    this.isMountedFlag = false;
  }

  mount(container: HTMLElement): void {
    // ✅ PlaceholderApp を React でマウント
    // 注意: React と ReactDOM は CDN から読み込まれる
    const React = (window as any).React;
    const ReactDOM = (window as any).ReactDOM;

    if (!React || !ReactDOM) {
      throw new Error('[PlaceholderPreviewSource] React or ReactDOM not available');
    }

    // ✅ PlaceholderApp コンポーネントを定義（コンテナと子要素にdata-element-idを設定）
    const PlaceholderApp = () => {
      return React.createElement('div', {
        'data-element-id': 'dom:placeholder-root',
        style: {
          padding: '40px',
          fontFamily: 'system-ui, sans-serif',
          color: '#333',
          minHeight: '100vh', // ✅ スクロール可能にするため、最小高さを設定
          width: '100%',
        },
      }, [
        React.createElement('h1', {
          key: 'title',
          'data-element-id': 'dom:placeholder-title',
        }, 'Placeholder Preview'),
        React.createElement('p', {
          key: 'desc',
          'data-element-id': 'dom:placeholder-desc',
        }, 'This is a placeholder preview.'),
        // ✅ Column Container
        React.createElement('div', {
          key: 'column-container',
          'data-element-id': 'dom:placeholder-container',
          style: {
            marginTop: '20px',
            padding: '20px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          },
        }, [
          React.createElement('div', {
            key: 'item1',
            'data-element-id': 'dom:placeholder-item-1',
            style: { padding: '10px', margin: '5px', background: '#f0f0f0' },
          }, 'Item 1'),
          React.createElement('div', {
            key: 'item2',
            'data-element-id': 'dom:placeholder-item-2',
            style: { padding: '10px', margin: '5px', background: '#f0f0f0' },
          }, 'Item 2'),
          React.createElement('div', {
            key: 'item3',
            'data-element-id': 'dom:placeholder-item-3',
            style: { padding: '10px', margin: '5px', background: '#f0f0f0' },
          }, 'Item 3'),
        ]),
        // ✅ Row Container
        React.createElement('div', {
          key: 'row-container',
          'data-element-id': 'dom:placeholder-row-container',
          style: {
            marginTop: '20px',
            padding: '20px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            display: 'flex',
            flexDirection: 'row',
            gap: '5px',
          },
        }, [
          React.createElement('div', {
            key: 'row-item1',
            'data-element-id': 'dom:placeholder-row-item-1',
            style: { padding: '10px', margin: '5px', background: '#e0f0ff' },
          }, 'Row Item 1'),
          React.createElement('div', {
            key: 'row-item2',
            'data-element-id': 'dom:placeholder-row-item-2',
            style: { padding: '10px', margin: '5px', background: '#e0f0ff' },
          }, 'Row Item 2'),
          React.createElement('div', {
            key: 'row-item3',
            'data-element-id': 'dom:placeholder-row-item-3',
            style: { padding: '10px', margin: '5px', background: '#e0f0ff' },
          }, 'Row Item 3'),
        ]),
        // ✅ Grid Container
        React.createElement('div', {
          key: 'grid-container',
          'data-element-id': 'dom:placeholder-grid-container',
          style: {
            marginTop: '20px',
            padding: '20px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
          },
        }, [
          React.createElement('div', {
            key: 'grid-cell-1',
            'data-element-id': 'dom:placeholder-grid-cell-1',
            style: { padding: '10px', background: '#ffe0f0' },
          }, 'Grid 1'),
          React.createElement('div', {
            key: 'grid-cell-2',
            'data-element-id': 'dom:placeholder-grid-cell-2',
            style: { padding: '10px', background: '#ffe0f0' },
          }, 'Grid 2'),
          React.createElement('div', {
            key: 'grid-cell-3',
            'data-element-id': 'dom:placeholder-grid-cell-3',
            style: { padding: '10px', background: '#ffe0f0' },
          }, 'Grid 3'),
          React.createElement('div', {
            key: 'grid-cell-4',
            'data-element-id': 'dom:placeholder-grid-cell-4',
            style: { padding: '10px', background: '#ffe0f0' },
          }, 'Grid 4'),
          React.createElement('div', {
            key: 'grid-cell-5',
            'data-element-id': 'dom:placeholder-grid-cell-5',
            style: { padding: '10px', background: '#ffe0f0' },
          }, 'Grid 5'),
          React.createElement('div', {
            key: 'grid-cell-6',
            'data-element-id': 'dom:placeholder-grid-cell-6',
            style: { padding: '10px', background: '#ffe0f0' },
          }, 'Grid 6'),
        ]),
        // ✅ CRITICAL FIX: グループ要素（Columnレイアウト）のテスト
        // ✅ Cursor仕様完全準拠: Columnグループにもwrapperを追加（Rowと同じ構造）
        // DnD container = 実DOMとして存在する「並び支配ノード」（flex-column wrapper）
        React.createElement('div', {
          key: 'group-column-container',
          'data-element-id': 'dom:placeholder-group-column',
          style: {
            marginTop: '20px',
            padding: '20px',
            border: '2px solid #4CAF50',
            borderRadius: '4px',
            backgroundColor: '#f0f8f0',
          },
        }, [
          React.createElement('div', {
            key: 'group-column-wrapper',
            'data-element-id': 'dom:placeholder-group-column-wrapper',
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            },
          }, [
            React.createElement('div', {
              key: 'group-col-item1',
              'data-element-id': 'dom:placeholder-group-col-item-1',
              style: {
                padding: '15px',
                background: '#c8e6c9',
                border: '1px solid #4CAF50',
              },
            }, 'Group Column Item 1'),
            React.createElement('div', {
              key: 'group-col-item2',
              'data-element-id': 'dom:placeholder-group-col-item-2',
              style: {
                padding: '15px',
                background: '#c8e6c9',
                border: '1px solid #4CAF50',
              },
            }, 'Group Column Item 2'),
            React.createElement('div', {
              key: 'group-col-item3',
              'data-element-id': 'dom:placeholder-group-col-item-3',
              style: {
                padding: '15px',
                background: '#c8e6c9',
                border: '1px solid #4CAF50',
              },
            }, 'Group Column Item 3'),
          ]),
        ]),
        // ✅ BUG-005 FIX: グループ要素（Rowレイアウト）のテスト
        React.createElement('div', {
          key: 'group-row-container',
          'data-element-id': 'dom:placeholder-group-row',
          style: {
            marginTop: '20px',
            padding: '20px',
            border: '2px solid #FF9800',
            borderRadius: '4px',
            backgroundColor: '#fff3e0',
          },
        }, [
          React.createElement('div', {
            key: 'group-row-wrapper',
            'data-element-id': 'dom:placeholder-group-row-wrapper',
            style: {
              display: 'flex',
              flexDirection: 'row',
              gap: '10px',
            },
          }, [
            React.createElement('div', {
              key: 'group-row-item1',
              'data-element-id': 'dom:placeholder-group-row-item-1',
              style: {
                padding: '15px',
                background: '#ffe0b2',
                border: '1px solid #FF9800',
                flex: '1',
              },
            }, 'Group Row Item 1'),
            React.createElement('div', {
              key: 'group-row-item2',
              'data-element-id': 'dom:placeholder-group-row-item-2',
              style: {
                padding: '15px',
                background: '#ffe0b2',
                border: '1px solid #FF9800',
                flex: '1',
              },
            }, 'Group Row Item 2'),
            React.createElement('div', {
              key: 'group-row-item3',
              'data-element-id': 'dom:placeholder-group-row-item-3',
              style: {
                padding: '15px',
                background: '#ffe0b2',
                border: '1px solid #FF9800',
                flex: '1',
              },
            }, 'Group Row Item 3'),
          ]),
        ]),
      ]);
    };

    // ✅ React 18 の createRoot を使用
    this.root = ReactDOM.createRoot(container);
    this.root.render(React.createElement(PlaceholderApp));
    this.isMountedFlag = true;
  }

  unmount(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.isMountedFlag = false;
  }

  isMounted(): boolean {
    return this.isMountedFlag;
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.2準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  (window as any).PlaceholderPreviewSource = PlaceholderPreviewSource;
}
