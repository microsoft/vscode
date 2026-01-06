/**
 * DOM同期ハンドラー（オプション機能）
 *
 * Phase 4: 協調ランタイムが存在する場合のみ有効化されるオプション機能
 * - 協調ランタイムが存在する場合: DOM_OPERATIONイベントを受信してASTに反映
 * - 協調ランタイムが存在しない場合: 静かに無効化（エラーなし、通常のPreview機能は正常動作）
 *
 * 重要: この機能は完全にオプションです。ユーザーは追加設定を一切する必要がありません。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { updateAstFromDom } from './domToAst';
import { updateTextModelFromAST } from '../ast-bridge/astToTextModel';
import { astManager } from '../ast-bridge/astManager';
import { previewBridge } from './bridge';
import type { DomOperationEvent, AstAppliedEvent, DomMutation } from './domSync.types';
import { syncManager } from '../ast-bridge/syncManager';

/**
 * DOM同期ハンドラー
 *
 * iframeからのDOM_OPERATIONイベントを受信し、ASTに反映してコードを更新します。
 * ハンドシェイク方式で協調ランタイムの存在を確認し、存在しない場合は静かにフォールバックします。
 */
export class DomSyncHandler {
  private isProcessing = false;
  private isDomSyncAvailable = false; // ハンドシェイクACK受信時にtrueになる
  private handshakeTimeout: NodeJS.Timeout | null = null;

  /**
   * 初期化
   */
  init(): void {
    // HANDSHAKE_ACKイベントを登録
    previewBridge.on('HANDSHAKE_ACK', (message: unknown) => {
      this.handleHandshakeAck(message as any);
    });

    // DOM_OPERATIONイベントを登録
    previewBridge.on('DOM_OPERATION', (message: unknown) => {
      // DOM同期が利用可能な場合のみ処理
      if (this.isDomSyncAvailable) {
        this.handleDomOperation(message as DomOperationEvent);
      }
      // 利用できない場合は静かに無視（エラーログは出さない）
    });

    // ハンドシェイクタイムアウト（5秒後、ACKが返らない場合はDOM同期を無効化）
    // 重要: ACKが来ない場合は正常な動作（協調ランタイムが読み込まれていない）
    // エラー・警告・ログを一切出さず、静かにフォールバックする
    // ユーザーは何も気づかない（これが正しい動作）
    this.handshakeTimeout = setTimeout(() => {
      if (!this.isDomSyncAvailable) {
        // 協調ランタイムが読み込まれていない場合、DOM同期を無効化
        // これは正常な動作であり、エラーではない
        // ログは一切出力しない（ユーザーに気づかせない）
        this.isDomSyncAvailable = false;
      }
    }, 5000);
  }

  /**
   * ハンドシェイクACKを処理
   *
   * 重要: この関数は協調ランタイムが存在する場合のみ呼ばれる
   * ACKが来ない場合は、タイムアウト後に静かにフォールバックする
   * ログは開発者向けのみ（ユーザーには見えない）
   */
  private handleHandshakeAck(event: any): void {
    if (this.handshakeTimeout) {
      clearTimeout(this.handshakeTimeout);
      this.handshakeTimeout = null;
    }

    // capabilitiesを確認
    const capabilities = event.capabilities || {};

    if (capabilities['dom-sync'] || capabilities['node-selection'] || capabilities['mutation-report']) {
      this.isDomSyncAvailable = true;
    } else {
      this.isDomSyncAvailable = false;
    }
  }

  /**
   * DOM同期が利用可能かどうか
   */
  isAvailable(): boolean {
    return this.isDomSyncAvailable;
  }

  /**
   * DOM操作イベントを処理
   */
  private async handleDomOperation(event: DomOperationEvent): Promise<void> {
    // 無限ループ防止: 既に処理中の場合はスキップ
    if (this.isProcessing) {
      return;
    }

    // source: codeの場合はスキップ（コード変更によるDOM更新は無視）
    if (event.payload.source === 'code') {
      return;
    }

    this.isProcessing = true;

    try {
      const { nodeId, operation, changes } = event.payload;

      // 現在開いているファイルを取得
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        this.sendAstApplied(event.payload.nodeId, operation, 'error', 'No active editor');
        return;
      }

      const filePath = activeEditor.document.fileName;
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        this.sendAstApplied(event.payload.nodeId, operation, 'error', 'No workspace folder');
        return;
      }

      // ワークスペース相対パスに変換（先頭の/を削除）
      let relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
      // Windowsの場合、バックスラッシュをスラッシュに変換
      relativePath = relativePath.replace(/\\/g, '/');
      // 先頭の/を削除（相対パスとして扱う）
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }

      // ファイルが読み込まれていない場合は読み込む
      if (!astManager.hasFile(relativePath)) {
        const content = activeEditor.document.getText();
        astManager.loadFile(relativePath, content);
      }

      // DOM操作をDomMutationに変換
      const mutation = this.convertToDomMutation(nodeId, operation, changes);

      // DOM → AST変換（絶対パスを使用）
      const result = updateAstFromDom(filePath, mutation);

      if (!result.success) {
        console.error('[DomSyncHandler] DOM → AST変換失敗:', result.error);
        this.sendAstApplied(nodeId, operation, 'error', result.error);
        return;
      }

      if (!result.updatedCode) {
        this.sendAstApplied(nodeId, operation, 'error', 'Updated code is empty');
        return;
      }

      // AST → コード更新（無限ループ防止フラグを使用）
      // 注意: syncFromASTは絶対パスを使用する
      await syncManager.syncFromAST(filePath, result.updatedCode);

      // 成功を通知
      this.sendAstApplied(nodeId, operation, 'success');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[DomSyncHandler] DOM操作処理エラー:', errorMessage);
      this.sendAstApplied(event.payload.nodeId, event.payload.operation, 'error', errorMessage);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * DOM操作をDomMutationに変換
   */
  private convertToDomMutation(
    nodeId: string,
    operation: string,
    changes?: {
      props?: Record<string, string | null>;
      style?: Record<string, string | null>;
      element?: {
        tag: string;
        props?: Record<string, string>;
        children?: string;
      };
    }
  ): DomMutation {
    switch (operation) {
      case 'UPDATE_PROPS':
        return {
          targetId: nodeId,
          type: 'update-attributes',
          attrs: changes?.props,
        };

      case 'UPDATE_STYLE':
        // スタイルはstyle属性として扱う
        const styleValue = changes?.style
          ? Object.entries(changes.style)
              .filter(([_, v]) => v !== null)
              .map(([k, v]) => `${k}: ${v}`)
              .join('; ')
          : null;
        return {
          targetId: nodeId,
          type: 'update-attributes',
          attrs: {
            style: styleValue,
          },
        };

      case 'REMOVE':
        return {
          targetId: nodeId,
          type: 'delete',
        };

      case 'INSERT':
        throw new Error('Insert operation not yet implemented');

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * AST適用完了をiframeに通知
   */
  private sendAstApplied(
    nodeId: string,
    operation: string,
    status: 'success' | 'error',
    error?: string
  ): void {
    const event = {
      type: 'AST_APPLIED',
      payload: {
        nodeId,
        operation: operation as any,
        status,
        error,
        source: 'code',
        timestamp: Date.now(),
      },
    } as any;

    previewBridge.send(event);
  }
}

// シングルトンインスタンス
export const domSyncHandler = new DomSyncHandler();

