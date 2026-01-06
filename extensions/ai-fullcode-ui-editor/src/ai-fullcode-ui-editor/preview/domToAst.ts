/**
 * DOM → AST変換（VSCode拡張機能版）
 *
 * Phase 4: DOM変更をASTに反映
 * iframe内のDOM操作をVSCode拡張機能側のASTに反映します。
 */

import {
  SourceFile,
  JsxElement,
  JsxSelfClosingElement,
  SyntaxKind,
} from 'ts-morph';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { astManager } from '../ast-bridge/astManager';
import type { DomMutation } from './domSync.types';

/**
 * AST更新結果
 */
export interface AstUpdateResult {
  success: boolean;
  updatedCode?: string;
  error?: string;
}

/**
 * DOM変更をASTに反映
 * @param filePath ファイルパス（ワークスペース相対パス）
 * @param mutation DOM変更情報
 * @returns 更新結果
 */
export function updateAstFromDom(
  filePath: string,
  mutation: DomMutation
): AstUpdateResult {
  try {
    // filePathは絶対パスまたはワークスペース相対パス
    // まず、絶対パスとして扱う
    let absolutePath = filePath;
    let relativePath = filePath;

    // ファイルが読み込まれているか確認（相対パスと絶対パスの両方をチェック）
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('ワークスペースが開かれていません');
    }

    // 絶対パスか相対パスかを判定
    if (!path.isAbsolute(filePath)) {
      // 相対パスの場合、ワークスペースルートからの相対パスとして扱う
      absolutePath = path.join(workspaceFolder.uri.fsPath, filePath);
      relativePath = filePath;
    } else {
      // 絶対パスの場合、ワークスペース相対パスに変換
      relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
      // Windowsの場合、バックスラッシュをスラッシュに変換
      relativePath = relativePath.replace(/\\/g, '/');
      // 先頭の/を削除
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
      absolutePath = filePath;
    }

    // ファイルが読み込まれていない場合は読み込む
    if (!astManager.hasFile(relativePath)) {
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      astManager.loadFile(relativePath, content);
    }

    const updatedCode = astManager.applyPatch(relativePath, (file: SourceFile) => {
      let element = astManager.findJsxElementById(relativePath, mutation.targetId);

      // root要素への対応
      if (!element && mutation.targetId === 'root') {
        const topLevelJsx = file.getFirstDescendant(node =>
          node.getKind() === SyntaxKind.JsxElement || node.getKind() === SyntaxKind.JsxSelfClosingElement
        ) as JsxElement | JsxSelfClosingElement | undefined;
        if (topLevelJsx) {
          element = topLevelJsx;
        }
      }

      if (!element) {
        throw new Error(`Element with id "${mutation.targetId}" not found`);
      }

      switch (mutation.type) {
        case 'update-attributes':
          if (mutation.attrs) {
            // D&D用の属性を除外するリスト
            const dndAttributesToIgnore = [
              'draggable',
              'data-dnd-setup',
              'data-ignore',
              'style', // D&D中のopacityなどが含まれる可能性がある
            ];
            
            Object.entries(mutation.attrs).forEach(([key, value]) => {
              // D&D用の属性はASTに反映しない
              if (dndAttributesToIgnore.includes(key)) {
                return;
              }
              
              if (value === null || value === undefined) {
                // 属性を削除
                astManager.removeJsxAttribute(element!, key);
              } else {
                // 属性を更新または追加
                astManager.setJsxAttribute(element!, key, value);
              }
            });
          }
          break;

        case 'delete':
          // 要素を削除（空文字に置き換え）
          if (element.getKind() === SyntaxKind.JsxElement) {
            (element as JsxElement).replaceWithText('');
          } else if (element.getKind() === SyntaxKind.JsxSelfClosingElement) {
            (element as JsxSelfClosingElement).replaceWithText('');
          } else {
            element.replaceWithText('');
          }
          break;

        case 'add':
          throw new Error('Add operation not yet implemented');

        case 'move':
          throw new Error('Move operation not yet implemented');

        case 'replace':
          throw new Error('Replace operation not yet implemented');

        default:
          throw new Error(`Unknown mutation type: ${(mutation as any).type}`);
      }
    });

    return {
      success: true,
      updatedCode,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

