/**
 * DOM同期の型定義
 *
 * Phase 4: iframe DOM操作とVSCode AST/コード更新の双方向同期
 */

/**
 * DOM操作の種類
 */
export type DomOperationType = 
  | 'SELECT'           // 要素選択
  | 'UPDATE_PROPS'     // プロパティ更新
  | 'UPDATE_STYLE'     // スタイル更新
  | 'INSERT'           // 要素挿入
  | 'REMOVE';          // 要素削除

/**
 * イベントの発生源
 */
export type EventSource = 'user' | 'code';

/**
 * DOM操作イベント
 */
export interface DomOperationEvent {
  type: 'DOM_OPERATION';
  payload: {
    nodeId: string;              // data-nodeid（AST-stable ID）
    operation: DomOperationType;
    changes?: {
      // UPDATE_PROPSの場合
      props?: Record<string, string | null>;
      // UPDATE_STYLEの場合
      style?: Record<string, string | null>;
      // INSERTの場合
      element?: {
        tag: string;
        props?: Record<string, string>;
        children?: string;
      };
      // REMOVEの場合（changesは不要）
    };
    source: EventSource;
    timestamp: number;
  };
}

/**
 * AST適用完了イベント
 */
export interface AstAppliedEvent {
  type: 'AST_APPLIED';
  payload: {
    nodeId: string;
    operation: DomOperationType;
    status: 'success' | 'error';
    error?: string;
    source: EventSource;
    timestamp: number;
  };
}

/**
 * ハンドシェイク要求イベント
 */
export interface HandshakeRequestEvent {
  type: 'HANDSHAKE_REQUEST';
  source: 'vscode-extension';
}

/**
 * ハンドシェイク応答イベント
 */
export interface HandshakeAckEvent {
  type: 'HANDSHAKE_ACK';
  capabilities: {
    'dom-sync'?: boolean;
    'node-selection'?: boolean;
    'mutation-report'?: boolean;
  };
}

/**
 * DOM変更情報（domToAst.ts互換）
 */
export interface DomMutation {
  targetId: string;              // data-nodeid
  type: 'update-attributes' | 'delete' | 'add' | 'move' | 'replace';
  attrs?: Record<string, string | null>;
}

