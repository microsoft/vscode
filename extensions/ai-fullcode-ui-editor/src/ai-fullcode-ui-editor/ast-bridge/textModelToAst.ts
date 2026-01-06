/**
 * TextModel → astManager ブリッジ
 * 
 * Phase 2: エディタ統合
 * VSCode TextModelの変更を検知して、astManagerを更新します。
 */

import * as vscode from 'vscode';
import { syncManager } from './syncManager';
import { astManager } from './astManager';

/**
 * TextModel変更 → astManager更新
 * 
 * VSCodeのTextModelが変更されたときに、astManagerを更新します。
 * 無限ループを防ぐため、syncManagerを通じて呼び出されます。
 */
export function initTextModelToAstBridge(): void {
  vscode.workspace.onDidChangeTextDocument(async (event: vscode.TextDocumentChangeEvent) => {
    const { document } = event;
    
    // TypeScript/TSXファイルのみ処理
    if (document.languageId === 'typescript' || document.languageId === 'typescriptreact') {
      const code = document.getText();
      const filePath = document.uri.fsPath;
      
      // syncManagerを通じてastManagerを更新（無限ループ防止）
      await syncManager.syncFromTextModel(filePath, code);
    }
  });
}

/**
 * TextModelからコードを取得してastManagerを更新
 * 
 * @param filePath ファイルパス
 * @param code コード内容
 */
export async function updateAstFromTextModel(filePath: string, code: string): Promise<void> {
  // astManagerにファイルを読み込む（既存のIDを保持）
  astManager.loadFile(filePath, code);
}

