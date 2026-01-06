/**
 * コマンド登録
 * 
 * Phase 3: UI操作連携
 * VSCodeコマンドとしてUI操作を登録
 */

import * as vscode from 'vscode';
import { executeUIOperation } from './uiStructureBridge';

/**
 * UI操作コマンドを登録
 * 
 * VSCodeコマンドとしてUI操作を登録します。
 * すべてのUIOperationタイプに対応します。
 * 
 * @param context VSCode拡張機能コンテキスト（コマンドの登録解除用）
 */
export function registerUIOperationCommands(context: vscode.ExtensionContext): void {
  // 基本操作
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.move', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.remove', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.insert', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  // Props/Style/Text操作
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.updateProps', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.updateTextContent', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.setStyleTokens', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  // Group操作
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.group', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.wrapWithGroup', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  // Repeat操作
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.unwrapRepeat', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.extractFromRepeat', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  // Condition操作
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.unwrapCondition', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.updateCondition', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  // その他の操作
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.duplicateNode', async (operation: any) => {
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );

  // AI操作（特殊処理が必要な場合は別途実装）
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.aiOperation', async (operation: any) => {
      // AI操作はapplyUiStructureOperationWithAIを使用する必要があるため、
      // 別途実装が必要
      await executeUIOperation(operation.filePath, operation, operation.projectId);
    })
  );
}

/**
 * 登録済みコマンドの一覧
 * 
 * デバッグ用に、登録済みコマンドの一覧を返します。
 * すべてのUIOperationタイプに対応します。
 */
export function getRegisteredCommands(): string[] {
  return [
    // 基本操作
    'ai-fullcode-ui-editor.move',
    'ai-fullcode-ui-editor.remove',
    'ai-fullcode-ui-editor.insert',
    // Props/Style/Text操作
    'ai-fullcode-ui-editor.updateProps',
    'ai-fullcode-ui-editor.updateTextContent',
    'ai-fullcode-ui-editor.setStyleTokens',
    // Group操作
    'ai-fullcode-ui-editor.group',
    'ai-fullcode-ui-editor.wrapWithGroup',
    // Repeat操作
    'ai-fullcode-ui-editor.unwrapRepeat',
    'ai-fullcode-ui-editor.extractFromRepeat',
    // Condition操作
    'ai-fullcode-ui-editor.unwrapCondition',
    'ai-fullcode-ui-editor.updateCondition',
    // その他の操作
    'ai-fullcode-ui-editor.duplicateNode',
    // AI操作
    'ai-fullcode-ui-editor.aiOperation',
  ];
}

