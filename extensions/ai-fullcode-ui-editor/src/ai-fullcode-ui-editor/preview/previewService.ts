/**
 * Preview Service（Cursor方式）
 *
 * iframeを完全に廃止し、同一プロセス内でアプリを直接マウント
 * - コードが唯一のSource of Truth
 * - UI操作 = AST操作（直接コード編集）
 */

import * as vscode from 'vscode';
import { previewSourceJs } from './runtime/previewSourceRuntime';
import { domObserverBridgeJs } from './runtime/domObserverBridgeRuntime';
import { designSurfaceJs } from './designView/designSurfaceRuntime';

/**
 * Preview Serviceクラス
 */
export class PreviewService {
  /**
   * Preview HTMLを生成（Cursor方式）
   *
   * DesignSurfaceを直接描画する。
   * iframe関連コードは完全に存在しない。
   */
  async getPreviewHtml(context?: vscode.ExtensionContext): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return this.getErrorHtml('ワークスペースが開かれていません。');
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    console.log(`[Preview] PreviewSession start workspace=${workspaceRoot}`);

    // ✅ Phase 1-2: PlaceholderAppでOK
    // 実プロジェクトの接続は別フェーズ（Phase 2.5）で行う
    return this.getDesignSurfaceHtml();
  }

  /**
   * エラーHTMLを生成
   */
  private getErrorHtml(message: string): string {
    return `
      <!DOCTYPE html>
      <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>プレビュー</title>
          <style>
            body {
              margin: 0;
              padding: 40px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #1e1e1e;
              color: #cccccc;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
            }
            .error {
              text-align: center;
            }
            .error h2 {
              color: #f48771;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>Preview Error</h2>
            <p>${message}</p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * DesignSurface HTMLを生成
   *
   * React（CDN）を読み込み、DesignSurfaceコンポーネントを直接描画する。
   * iframeは一切使用しない。
   *
   * ✅ Phase 1-2: PlaceholderAppでOK
   * 実プロジェクトの接続は別フェーズ（Phase 2.5）で行う
   */
  private getDesignSurfaceHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Preview - Design Surface</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100vh;
              overflow: hidden;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              cursor: default; /* ✅ カーソルを矢印に設定（Iビームカーソルを防ぐ） */
            }
            #design-surface-container {
              width: 100%;
              height: 100%;
              position: relative;
              overflow: auto;
              cursor: default; /* ✅ カーソルを矢印に設定（Iビームカーソルを防ぐ） */
            }
            #element-overlay {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
              z-index: 1000;
            }
            .selection-outline {
              position: fixed; /* ✅ Cursor 2.2 準拠: viewport 基準 */
              border: 2px solid #3b82f6;
              pointer-events: none; /* ✅ 重要: ヒットテストに参加しない */
              box-sizing: border-box;
            }
            /* ✅ Phase 7: リサイズハンドル */
            .resize-handle {
              position: absolute;
              width: 8px;
              height: 8px;
              background: #3b82f6;
              border: 1px solid #fff;
              border-radius: 2px;
              pointer-events: auto;
              z-index: 1001;
            }
            .resize-handle:hover {
              background: #2563eb;
            }
            /* ✅ Phase 7: Z-index レイヤー明確化（Cursor 2.2 準拠） */
            /* Slot Preview: 10000（最下層） */
            .slot-preview {
              position: fixed;
              pointer-events: none;
              z-index: 10000;
              background-color: rgba(59, 130, 246, 0.8);
              box-sizing: border-box;
            }
            /* Drag Ghost: 10001（中間層） */
            .drag-ghost {
              position: fixed;
              pointer-events: none;
              z-index: 10001;
              opacity: 0.6;
              background: rgba(59, 130, 246, 0.2);
              border: 2px dashed rgba(59, 130, 246, 0.8);
              box-sizing: border-box;
              transition: none;
            }
            /* Selection Outline: 10002（最上層） */
            .selection-outline {
              z-index: 10002;
            }
            /* ✅ Phase 7.x: Drop Guide（レイアウト対応ガイドライン） */
            .drop-guide-line {
              position: fixed;
              pointer-events: none;
              z-index: 10000; /* Slot Preview と同じ層 */
              background-color: rgba(59, 130, 246, 0.9);
              box-sizing: border-box;
            }
            .drop-guide-box {
              position: fixed;
              pointer-events: none;
              z-index: 10000; /* Slot Preview と同じ層 */
              border: 2px solid rgba(59, 130, 246, 0.9);
              background-color: rgba(59, 130, 246, 0.1);
              box-sizing: border-box;
            }
            /* ✅ プレビュー内の要素のカーソルスタイル */
            #design-surface-container * {
              cursor: default; /* デフォルトで矢印カーソル */
            }
            /* ✅ 選択可能な要素には move カーソルを設定 */
            #design-surface-container [data-selected="true"] {
              cursor: move !important;
            }
            /* ✅ ドラッグ中は grabbing カーソル */
            #design-surface-container.dragging {
              cursor: grabbing !important;
            }
            #design-surface-container.dragging * {
              cursor: grabbing !important;
            }
          </style>
        </head>
        <body>
          <div id="design-surface-container" data-design-surface="true"></div>
          <div id="element-overlay"></div>

          <!-- React & ReactDOM (CDN) -->
          <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
          <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

          <script>
            (function() {
              'use strict';

              // ✅ Phase 6: VSCode API を取得
              const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;
              if (vscode) {
                console.log('[DesignSurface] ✅ VSCode API acquired');
              } else {
                console.warn('[DesignSurface] ⚠️ VSCode API not available (file operations will be disabled)');
              }

              console.log('[DesignSurface] Initializing...');

              // React & ReactDOM の確認
              if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
                console.error('[DesignSurface] ❌ React or ReactDOM not loaded');
                document.getElementById('design-surface-container').innerHTML =
                  '<div style="padding: 40px; text-align: center; color: #f48771;">' +
                  '<h2>Error</h2><p>React or ReactDOM failed to load</p></div>';
                return;
              }

              console.log('[DesignSurface] ✅ React & ReactDOM loaded');

              ${previewSourceJs}

              ${domObserverBridgeJs}

              // ============================================
              // Phase 4: DOM → UI操作AST マッピング（Source Locator 導入）
              // ============================================

              // ============================================
              // Phase 6.5: Stable Element Identity Layer（Cursor方式・完全準拠）
              // ============================================

              // ElementIdRegistry: WeakMapによる要素↔ID対応
              class ElementIdRegistry {
                constructor() {
                  this.elementIdMap = new WeakMap();
                }

                set(element, id) {
                  this.elementIdMap.set(element, id);
                }

                get(element) {
                  return this.elementIdMap.get(element);
                }

                has(element) {
                  return this.elementIdMap.has(element);
                }
              }

              // DomPathGenerator: DOMフォールバック用（provisional ID生成）
              class DomPathGenerator {
                // DOM要素から domPath を生成
                // ⚠️ 重要: これは provisional（一時的）なID
                // AST ID が取得できたら必ず昇格すること
                // 例: "root/0:DIV/2:SECTION/1:H2"
                generateDomPath(element) {
                  if (!element || !(element instanceof HTMLElement)) {
                    return 'root';
                  }

                  // 親 → 子 方向で配列に積んでから join
                  const segments = [];
                  let current = element;

                  while (current && current.parentElement &&
                         current !== document.body &&
                         current !== document.documentElement) {
                    const parent = current.parentElement;
                    const siblings = Array.from(parent.children);
                    const index = siblings.indexOf(current);

                    if (index >= 0) {
                      const tag = current.tagName.toUpperCase();
                      segments.unshift(index + ':' + tag);
                    }

                    current = parent;
                  }

                  return 'root/' + segments.join('/');
                }

                // domPath から Provisional ElementId を生成（ハッシュ化）
                // ⚠️ 重要: これは provisional（一時的）なID
                // 形式: "dom:xxxx" (provisional)
                // AST ID が取得できたら必ず昇格すること
                // 例: "root/0:DIV/2:SECTION/1:H2" → "dom:ab39f2x"
                generateStableIdFromDomPath(domPath) {
                  // シンプルなハッシュ関数（文字列を数値に変換）
                  let hash = 0;
                  for (let i = 0; i < domPath.length; i++) {
                    const char = domPath.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash; // 32bit整数に変換
                  }
                  // provisional であることを明示
                  return 'dom:' + Math.abs(hash).toString(36); // provisional
                }
              }

              // AstNodeIdResolver: AST/SourceLocatorからStableElementIdを解決
              class AstNodeIdResolver {
                // SourceLocator から StableElementId を生成
                // 形式: "ast:{filePath}:{startLine}:{startColumn}:{nodeKind}"
                resolveFromSourceLocator(locator) {
                  if (!locator || !locator.filePath) {
                    return null;
                  }

                  // ファイルパスを正規化（スラッシュ統一、先頭スラッシュ削除）
                  const normalizedPath = locator.filePath.replace(/\\\\/g, '/').replace(/^\\//, '');

                  // ハッシュを生成（ファイルパスを含む）
                  let hash = 0;
                  const hashInput = normalizedPath + ':' + locator.startLine + ':' + locator.startColumn + ':' + (locator.nodeKind || 'Unknown');
                  for (let i = 0; i < hashInput.length; i++) {
                    const char = hashInput.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                  }

                  return 'ast:' + Math.abs(hash).toString(36) + '-' + locator.startLine + '-' + locator.startColumn + '-' + (locator.nodeKind || 'Unknown');
                }

                // AST Node ID を直接使用（将来実装）
                // 形式: "ast-{hash}-{pos}-{kind}"
                resolveFromAstNodeId(astNodeId) {
                  if (!astNodeId || !astNodeId.startsWith('ast-')) {
                    return null;
                  }
                  return astNodeId; // そのまま返す
                }
              }

              // StableElementIdService: 唯一の正式ID発行所
              class StableElementIdService {
                constructor() {
                  this.registry = new ElementIdRegistry();
                  this.domPathGenerator = new DomPathGenerator();
                  this.astNodeIdResolver = new AstNodeIdResolver();
                }

                // DOM要素から StableElementId を取得
                // 優先順位:
                // 1. WeakMap キャッシュ（セッション内安定・最速）
                // 2. AST Node ID（最優先・コード由来・canonical）
                // 3. SourceLocator ID（filePath + range + kind・canonical）
                // 4. domPath → hash（DOM構造ベース・provisional・フォールバック）
                getStableElementId(element) {
                  if (!element || !(element instanceof HTMLElement)) {
                    return null;
                  }

                  // 優先順位1: WeakMap キャッシュ（セッション内安定・最速）
                  const cachedId = this.registry.get(element);
                  if (cachedId) {
                    // canonical ID（ast:）の場合はそのまま返す
                    // provisional ID（dom:）の場合は、後でAST IDに昇格される可能性がある
                    console.log('[StableElementId] ✅ Resolved via WeakMap cache:', cachedId,
                                cachedId.startsWith('ast:') ? '(canonical)' : '(provisional)');
                    return cachedId;
                  }

                  // 優先順位2: 既存の data-nodeid / data-ide-node-id / data-ai-node-id（AST由来・canonical）
                  const existingAstId = element.getAttribute('data-nodeid') ||
                                       element.getAttribute('data-ide-node-id') ||
                                       element.getAttribute('data-ai-node-id');
                  if (existingAstId && existingAstId.startsWith('ast-')) {
                    const stableId = this.astNodeIdResolver.resolveFromAstNodeId(existingAstId);
                    if (stableId) {
                      this.registry.set(element, stableId);
                      console.log('[StableElementId] ✅ Resolved via AST Node ID (canonical):', stableId);
                      return stableId;
                    }
                  }

                  // 優先順位3: SourceLocator ID（非同期で取得する必要があるため、ここではプレースホルダー）
                  // 実際のSourceLocatorは createSourceLocator() で後から追加される
                  // この時点では SourceLocator はまだ取得できていない可能性がある
                  // そのため、domPath を生成してから、後で SourceLocator が取得できたら必ず昇格する

                  // 優先順位4: domPath → hash（DOM構造ベース・provisional・フォールバック）
                  // ⚠️ 重要: これは provisional（一時的）なID
                  // AST ID が取得できたら必ず昇格すること
                  const domPath = this.domPathGenerator.generateDomPath(element);
                  const domPathId = this.domPathGenerator.generateStableIdFromDomPath(domPath);
                  this.registry.set(element, domPathId);
                  console.log('[StableElementId] ⚠️ Resolved via domPath hash (provisional):', domPathId, 'domPath:', domPath);
                  console.log('[StableElementId] ⚠️ Note: This is a provisional ID. Will be upgraded to canonical (ast:) when SourceLocator is available.');

                  return domPathId;
                }

                // SourceLocator が取得できた後に、IDを更新（provisional → canonical に昇格）
                // ⚠️ 重要: この関数は必ず呼ばれること
                // provisional ID（dom:）を canonical ID（ast:）に昇格する
                updateElementIdWithSourceLocator(element, sourceLocator) {
                  if (!element || !sourceLocator) {
                    return;
                  }

                  const astId = this.astNodeIdResolver.resolveFromSourceLocator(sourceLocator);
                  if (astId) {
                    const previousId = this.registry.get(element);
                    this.registry.set(element, astId);

                    if (previousId && previousId.startsWith('dom:')) {
                      console.log('[StableElementId] ✅ Upgraded from provisional to canonical:', previousId, '→', astId);
                    } else {
                      console.log('[StableElementId] ✅ Updated via SourceLocator (canonical):', astId);
                    }
                    return astId;
                  }
                }
              }

              // グローバルStableElementIdServiceインスタンス（シングルトン）
              let globalStableElementIdService = null;
              function getStableElementIdService() {
                if (!globalStableElementIdService) {
                  globalStableElementIdService = new StableElementIdService();
                  console.log('[StableElementIdService] ✅ Created global service');
                }
                return globalStableElementIdService;
              }

              // DOMLocator: DOM要素から情報を抽出（DOMは変更しない）
              function extractDOMLocator(element) {
                if (!element || !(element instanceof HTMLElement)) {
                  return null;
                }

                // DOM階層パスを構築
                const domPath = [];
                let current = element;
                while (current && current !== document.body) {
                  const parent = current.parentElement;
                  if (parent) {
                    const siblings = Array.from(parent.children);
                    const index = siblings.indexOf(current);
                    if (index >= 0) {
                      domPath.unshift(index);
                    }
                  }
                  current = parent;
                }

                // クラスリストを取得
                const classList = element.classList ? Array.from(element.classList) : [];

                // テキスト内容を正規化（空白を削除、100文字まで）
                const textContent = element.textContent
                  ? element.textContent.trim().replace(/\\s+/g, ' ').substring(0, 100)
                  : undefined;

                // 属性情報を取得
                const attributes = {};
                if (element.attributes) {
                  for (let i = 0; i < element.attributes.length; i++) {
                    const attr = element.attributes[i];
                    attributes[attr.name] = attr.value;
                  }
                }

                return {
                  tagName: element.tagName,
                  classList: classList,
                  id: element.id || undefined,
                  domPath: domPath,
                  textContent: textContent,
                  parentTagName: element.parentElement ? element.parentElement.tagName : undefined,
                  attributes: attributes,
                };
              }

              // CodeLocator: コード上の位置を特定（Phase 4: 簡易版）
              // Phase 4 では簡易版を実装し、Phase 5 以降で精度を向上させる
              async function locateCodeFromDOM(domLocator) {
                // Phase 4: 簡易版実装
                // - ファイル探索（app/page.tsx, src/App.tsx など）
                // - 簡易的な文字列マッチング
                // - 候補を返す

                const candidates = [];

                try {
                  // TODO: Phase 4 では簡易版
                  // - VSCode APIを使ってファイルを読み取る（拡張機能側で実装）
                  // - AST解析（簡易版）
                  // - DOMLocator情報と一致するノードを探索

                  // 現在はプレースホルダー
                  // Phase 5 で実装予定:
                  // - プロジェクトファイルの探索
                  // - AST解析（Babel / SWC / TypeScript）
                  // - マッチングアルゴリズム

                  console.log('[CodeLocator] Phase 4: Simplified implementation (placeholder)');
                } catch (error) {
                  console.error('[CodeLocator] Failed to locate code:', error);
                }

                return candidates;
              }

              // SourceLocator: DOMとコードを結びつける
              async function createSourceLocator(element) {
                try {
                  // DOMLocator情報を抽出
                  const domLocator = extractDOMLocator(element);
                  if (!domLocator) {
                    return null;
                  }

                  // CodeLocator情報を取得
                  const codeLocators = await locateCodeFromDOM(domLocator);

                  if (codeLocators.length === 0) {
                    // マッピング不能
                    console.log('[SourceLocator] ⚠️ No code location found for element:', domLocator.tagName);
                    return null;
                  }

                  // 最初の候補をSourceLocatorに変換
                  const primary = codeLocators[0];
                  const sourceLocator = {
                    filePath: primary.filePath,
                    startLine: primary.start.line,
                    startColumn: primary.start.column,
                    endLine: primary.end?.line,
                    endColumn: primary.end?.column,
                    nodeKind: primary.nodeType,
                    confidence: 0.5, // Phase 4: 簡易版なので低め
                  };

                  // 複数候補がある場合は追加
                  if (codeLocators.length > 1) {
                    sourceLocator.candidates = codeLocators.slice(1).map(cl => ({
                      filePath: cl.filePath,
                      startLine: cl.start.line,
                      startColumn: cl.start.column,
                      nodeKind: cl.nodeType,
                      confidence: 0.3,
                    }));
                  }

                  console.log('[SourceLocator] ✅ Created:', {
                    filePath: sourceLocator.filePath,
                    line: sourceLocator.startLine,
                    column: sourceLocator.startColumn,
                    confidence: sourceLocator.confidence,
                    candidates: sourceLocator.candidates?.length || 0,
                  });

                  return sourceLocator;
                } catch (error) {
                  // SourceLocatorのエラーはUI操作ASTを壊さない
                  console.error('[SourceLocator] ❌ Failed to create locator (UI action AST continues):', error);
                  return null;
                }
              }

              // ============================================
              // Phase 5: UI操作AST → ChangePlan生成（非破壊 / 差分プレビュー）
              // ============================================

              // ChangeType: 変更タイプ
              const ChangeType = {
                LITERAL_CHANGE: 'LITERAL_CHANGE',
                CLASS_ADD: 'CLASS_ADD',
                CLASS_REMOVE: 'CLASS_REMOVE',
                STYLE_CHANGE: 'STYLE_CHANGE',
                ATTRIBUTE_ADD: 'ATTRIBUTE_ADD',
                ATTRIBUTE_REMOVE: 'ATTRIBUTE_REMOVE',
                ELEMENT_ADD: 'ELEMENT_ADD',
                ELEMENT_REMOVE: 'ELEMENT_REMOVE',
              };

              // RiskLevel: リスクレベル
              const RiskLevel = {
                LOW: 'low',
                MEDIUM: 'medium',
                HIGH: 'high',
              };

              // ChangePlanGenerator: UI操作ASTからChangePlanを生成
              // ✅ Phase 7: MOVE / RESIZE / SET_PROPERTY にも対応
              function generateChangePlan(uiActionAST) {
                try {
                  // ✅ Phase 6.5: elementId を必須とする
                  if (!uiActionAST.elementId) {
                    console.warn('[ChangePlanGenerator] ⚠️ elementId not found in UI action AST');
                  }

                  // ✅ Phase 7: MOVE_ELEMENT の処理（target 参照を完全排除）
                  if (uiActionAST.type === UIActionType.MOVE_ELEMENT) {
                    // MOVE_ELEMENT操作のChangePlan（elementId ベース）
                    return {
                      id: 'change-plan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      sourceOpId: uiActionAST.operationId,
                      elementId: uiActionAST.elementId || null,
                      filePath: uiActionAST.locator?.filePath || 'unknown',
                      changeType: ChangeType.STYLE_CHANGE, // MOVE_ELEMENTは構造変更として扱う
                      patch: {
                        before: '// TODO: Phase 7 - before position (fromParentId: ' + (uiActionAST.fromParentId || 'null') + ', fromIndex: ' + (uiActionAST.fromIndex ?? 'null') + ')',
                        after: '// TODO: Phase 7 - after position (toParentId: ' + (uiActionAST.toParentId || 'null') + ', toIndex: ' + (uiActionAST.toIndex ?? 'null') + ')',
                      },
                      range: { start: 0, end: 0 },
                      riskLevel: RiskLevel.MEDIUM,
                      requiresUserDecision: false,
                      confidence: uiActionAST.locator?.confidence || 0.5,
                      reason: 'Phase 7: MOVE_ELEMENT operation (structure change)',
                    };
                  }

                  // ✅ Phase 7: MOVE / RESIZE / SET_PROPERTY の処理
                  if (uiActionAST.type === UIActionType.MOVE) {
                    // MOVE操作のChangePlan（仮実装）
                    return {
                      id: 'change-plan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      sourceOpId: uiActionAST.operationId,
                      elementId: uiActionAST.elementId || null,
                      filePath: uiActionAST.locator?.filePath || 'unknown',
                      changeType: ChangeType.STYLE_CHANGE, // MOVEはスタイル変更として扱う
                      patch: {
                        before: '// TODO: Phase 7 - before position',
                        after: '// TODO: Phase 7 - after position (deltaX: ' + uiActionAST.deltaX + ', deltaY: ' + uiActionAST.deltaY + ')',
                      },
                      range: { start: 0, end: 0 },
                      riskLevel: RiskLevel.MEDIUM,
                      requiresUserDecision: false,
                      confidence: uiActionAST.locator?.confidence || 0.5,
                      reason: 'Phase 7: MOVE operation (virtual style)',
                    };
                  }

                  if (uiActionAST.type === UIActionType.RESIZE) {
                    // RESIZE操作のChangePlan（仮実装）
                    return {
                      id: 'change-plan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      sourceOpId: uiActionAST.operationId,
                      elementId: uiActionAST.elementId || null,
                      filePath: uiActionAST.locator?.filePath || 'unknown',
                      changeType: ChangeType.STYLE_CHANGE, // RESIZEはスタイル変更として扱う
                      patch: {
                        before: '// TODO: Phase 7 - before size',
                        after: '// TODO: Phase 7 - after size (width: ' + uiActionAST.width + ', height: ' + uiActionAST.height + ')',
                      },
                      range: { start: 0, end: 0 },
                      riskLevel: RiskLevel.MEDIUM,
                      requiresUserDecision: false,
                      confidence: uiActionAST.locator?.confidence || 0.5,
                      reason: 'Phase 7: RESIZE operation (virtual style)',
                    };
                  }

                  if (uiActionAST.type === UIActionType.SET_PROPERTY) {
                    // ✅ Phase 7.2: SET_PROPERTY操作のChangePlan（仮実装）
                    return {
                      id: 'change-plan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      sourceOpId: uiActionAST.operationId,
                      elementId: uiActionAST.elementId || null,
                      filePath: uiActionAST.locator?.filePath || 'unknown',
                      changeType: ChangeType.ATTRIBUTE_ADD, // プロパティ変更として扱う
                      patch: {
                        before: '// TODO: Phase 7.2 - before property',
                        after: '// TODO: Phase 7.2 - after property (' + uiActionAST.property + ': ' + uiActionAST.value + ')',
                      },
                      range: { start: 0, end: 0 },
                      riskLevel: RiskLevel.LOW,
                      requiresUserDecision: false,
                      confidence: uiActionAST.locator?.confidence || 0.5,
                      reason: 'Phase 7.2: SET_PROPERTY operation (virtual style)',
                    };
                  }

                  if (uiActionAST.type === UIActionType.SET_LAYOUT) {
                    // ✅ Phase 7.3: SET_LAYOUT操作のChangePlan（仮実装）
                    return {
                      id: 'change-plan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      sourceOpId: uiActionAST.operationId,
                      elementId: uiActionAST.elementId || null,
                      filePath: uiActionAST.locator?.filePath || 'unknown',
                      changeType: ChangeType.STYLE_CHANGE, // レイアウトはスタイル変更として扱う
                      patch: {
                        before: '// TODO: Phase 7.3 - before layout',
                        after: '// TODO: Phase 7.3 - after layout (display: ' + (uiActionAST.layout?.display || 'flex') + ', direction: ' + (uiActionAST.layout?.direction || 'column') + ')',
                      },
                      range: { start: 0, end: 0 },
                      riskLevel: RiskLevel.MEDIUM,
                      requiresUserDecision: false,
                      confidence: uiActionAST.locator?.confidence || 0.5,
                      reason: 'Phase 7.3: SET_LAYOUT operation (virtual style)',
                    };
                  }

                  // locator がない場合は生成できない（SELECT_ELEMENT等）
                  if (!uiActionAST.locator) {
                    return {
                      id: 'change-plan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      sourceOpId: uiActionAST.operationId,
                      elementId: uiActionAST.elementId || null, // ✅ Phase 6.5: elementId を保持
                      filePath: 'unknown',
                      changeType: ChangeType.LITERAL_CHANGE,
                      patch: { before: '', after: '' },
                      range: { start: 0, end: 0 },
                      riskLevel: RiskLevel.HIGH,
                      requiresUserDecision: true,
                      confidence: 0.0,
                      error: 'No locator found',
                    };
                  }

                  // Phase 5: 簡易版実装
                  // - ファイル読み取り（VSCode API）は拡張機能側で実装予定
                  // - AST解析（簡易版）
                  // - ChangePlan生成

                  // 現在はプレースホルダー
                  // TODO: Phase 5 で実装
                  // - ファイル内容の取得
                  // - AST解析
                  // - 変更箇所の特定
                  // - patch生成

                  const changePlan = {
                    id: 'change-plan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    sourceOpId: uiActionAST.operationId,
                    elementId: uiActionAST.elementId || null, // ✅ Phase 6.5: elementId を保持
                    filePath: uiActionAST.locator.filePath || 'unknown',
                    changeType: ChangeType.LITERAL_CHANGE,
                    patch: {
                      before: '// TODO: Phase 5 - before code',
                      after: '// TODO: Phase 5 - after code',
                    },
                    range: {
                      start: 0,
                      end: 0,
                    },
                    riskLevel: determineRiskLevel(ChangeType.LITERAL_CHANGE, uiActionAST.locator.confidence || 0.5),
                    requiresUserDecision: false,
                    confidence: uiActionAST.locator.confidence || 0.5,
                    reason: 'Phase 5: Simplified implementation (placeholder)',
                  };

                  console.log('[ChangePlanGenerator] ✅ Generated:', {
                    id: changePlan.id,
                    filePath: changePlan.filePath,
                    riskLevel: changePlan.riskLevel,
                    confidence: changePlan.confidence,
                  });

                  return changePlan;
                } catch (error) {
                  // 例外を投げない
                  console.error('[ChangePlanGenerator] ❌ Failed to generate:', error);
                  return {
                    id: 'change-plan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    sourceOpId: uiActionAST.operationId,
                    elementId: uiActionAST.elementId || null, // ✅ Phase 6.5: elementId を保持
                    filePath: 'unknown',
                    changeType: ChangeType.LITERAL_CHANGE,
                    patch: { before: '', after: '' },
                    range: { start: 0, end: 0 },
                    riskLevel: RiskLevel.HIGH,
                    requiresUserDecision: true,
                    confidence: 0.0,
                    error: error.message,
                  };
                }
              }

              // リスクレベルを判定する
              function determineRiskLevel(changeType, confidence) {
                // literal 由来 → riskLevel: low
                if (changeType === ChangeType.LITERAL_CHANGE) {
                  return RiskLevel.LOW;
                }

                // className 追記 → low〜medium
                if (changeType === ChangeType.CLASS_ADD || changeType === ChangeType.CLASS_REMOVE) {
                  return confidence > 0.7 ? RiskLevel.LOW : RiskLevel.MEDIUM;
                }

                // style object → medium
                if (changeType === ChangeType.STYLE_CHANGE) {
                  return RiskLevel.MEDIUM;
                }

                // props / state / derived → high
                if (
                  changeType === ChangeType.ATTRIBUTE_ADD ||
                  changeType === ChangeType.ATTRIBUTE_REMOVE ||
                  changeType === ChangeType.ELEMENT_ADD ||
                  changeType === ChangeType.ELEMENT_REMOVE
                ) {
                  return RiskLevel.HIGH;
                }

                // locator が low confidence → high
                if (confidence < 0.5) {
                  return RiskLevel.HIGH;
                }

                return RiskLevel.MEDIUM;
              }

              // DiffPreviewEngine: ChangePlan を差分として可視化
              function formatChangePlanAsDiff(changePlan) {
                if (changePlan.error) {
                  return 'Error: ' + changePlan.error;
                }

                const lines = [];
                lines.push('--- ' + changePlan.filePath + ' (before)');
                lines.push('+++ ' + changePlan.filePath + ' (after)');
                lines.push('@@ -' + changePlan.range.start + ' +' + changePlan.range.end + ' @@');
                lines.push('- ' + changePlan.patch.before);
                lines.push('+ ' + changePlan.patch.after);
                lines.push('');
                lines.push('Risk Level: ' + changePlan.riskLevel);
                lines.push('Confidence: ' + (changePlan.confidence * 100).toFixed(0) + '%');
                if (changePlan.requiresUserDecision) {
                  lines.push('⚠️ Requires user decision');
                }

                return lines.join('\\n');
              }

              // ChangePlanStore: ChangePlanを蓄積・取得するストア
              class ChangePlanStore {
                constructor() {
                  this.plans = [];
                  this.maxSize = 100; // 最大保持数
                }

                add(plan) {
                  if (!plan) return;
                  this.plans.push(plan);

                  // 最大保持数を超えた場合は古いものを削除
                  if (this.plans.length > this.maxSize) {
                    this.plans.shift();
                  }

                  console.log('[ChangePlanStore] ✅ Plan added:', {
                    id: plan.id,
                    filePath: plan.filePath,
                    riskLevel: plan.riskLevel,
                    totalPlans: this.plans.length,
                  });
                }

                getAll() {
                  return [...this.plans]; // コピーを返す
                }

                getBySourceOpId(sourceOpId) {
                  return this.plans.find(p => p.sourceOpId === sourceOpId);
                }

                clear() {
                  this.plans = [];
                  console.log('[ChangePlanStore] ✅ Cleared');
                }

                size() {
                  return this.plans.length;
                }

                getRecent(count) {
                  return this.plans.slice(-count);
                }
              }

              // グローバルChangePlanStoreインスタンス（シングルトン）
              let globalChangePlanStore = null;
              function getChangePlanStore() {
                if (!globalChangePlanStore) {
                  globalChangePlanStore = new ChangePlanStore();
                  console.log('[ChangePlanStore] ✅ Created global store');
                }
                return globalChangePlanStore;
              }

              // ============================================
              // Phase 3: UI操作ASTの導入（記録専用フェーズ）
              // ============================================

              // UI操作タイプ
              // ✅ Phase 7（完全版）: UI操作AST拡張
              const UIActionType = {
                SELECT_ELEMENT: 'SELECT_ELEMENT',
                HOVER_ELEMENT: 'HOVER_ELEMENT',
                MOVE: 'MOVE',                    // Phase 7: レイアウト移動（deltaX/deltaY）
                MOVE_ELEMENT: 'MOVE_ELEMENT',    // Phase 7.1.3: 要素移動（fromParentId/toParentId/index）
                RESIZE: 'RESIZE',                // Phase 7: リサイズ
                SET_PROPERTY: 'SET_PROPERTY',    // Phase 7.2: プロパティ変更
                SET_LAYOUT: 'SET_LAYOUT',        // Phase 7.3: レイアウト操作
              };

              // UI操作ASTを作成するヘルパー関数
              // ✅ Phase 6.5: operationId と elementId を完全分離
              function createUIActionAST(type, element) {
                if (!element || !(element instanceof HTMLElement)) {
                  return null;
                }

                const rect = element.getBoundingClientRect();

                // ✅ Phase 6.5: StableElementId を取得
                const stableElementIdService = getStableElementIdService();
                const elementId = stableElementIdService.getStableElementId(element);

                // ✅ Phase 6.5: operationId は操作単位の一時ID（Date.now + Math.random は許可）
                // elementId とは完全に分離
                const operationId = 'op-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

                return {
                  operationId: operationId,      // 一時・操作単位
                  elementId: elementId,          // 永続・再現可能（Phase 6.5）
                  type: type,
                  timestamp: Date.now(),
                  target: {
                    tagName: element.tagName,
                    className: element.className || undefined,
                    id: element.id || undefined,
                    rect: {
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                    },
                    textContent: element.textContent ? element.textContent.substring(0, 100) : undefined,
                  },
                };
              }

              // UIActionStore: UI操作ASTを蓄積・取得するストア
              class UIActionStore {
                constructor() {
                  this.actions = [];
                  this.maxSize = 1000; // 最大保持数（メモリ保護）
                }

                add(action) {
                  if (!action) return;
                  this.actions.push(action);

                  // 最大保持数を超えた場合は古いものを削除
                  if (this.actions.length > this.maxSize) {
                    this.actions.shift();
                  }

                  // ✅ Phase 7: type ごとに分岐処理（Cursor 2.2 準拠）
                  const logData = {
                    type: action.type,
                    operationId: action.operationId,
                    totalActions: this.actions.length,
                  };

                  // SELECT_ELEMENT の場合は target を参照
                  if (action.type === UIActionType.SELECT_ELEMENT || action.type === UIActionType.HOVER_ELEMENT) {
                    if (action.target && action.target.tagName) {
                      logData.target = action.target.tagName;
                    } else {
                      logData.target = 'unknown';
                    }
                  } else if (action.type === UIActionType.MOVE_ELEMENT) {
                    // ✅ Phase 7: MOVE_ELEMENT の場合は target を参照しない（elementId ベースで表示）
                    logData.elementId = action.elementId;
                    logData.fromParentId = action.fromParentId;
                    logData.fromIndex = action.fromIndex;
                    logData.toParentId = action.toParentId;
                    logData.toIndex = action.toIndex;
                    // ✅ UI表示用途: elementId ベースで表示
                    logData.displayText = 'MOVE_ELEMENT: ' + (action.elementId || 'unknown') + ' → ' + (action.toParentId || 'unknown');
                  } else {
                    // その他のタイプ
                    // ✅ 重要: target が存在し、tagName が存在する場合のみ参照
                    if (action.target && action.target.tagName) {
                      logData.target = action.target.tagName;
                    }
                    if (action.elementId) {
                      logData.elementId = action.elementId;
                    }
                  }

                  // Phase 4: SourceLocator情報を追加
                  if (action.locator) {
                    logData.locator = {
                      filePath: action.locator.filePath,
                      line: action.locator.startLine,
                      column: action.locator.startColumn,
                      confidence: action.locator.confidence,
                      candidates: action.locator.candidates?.length || 0,
                    };
                  } else {
                    logData.locator = 'not found';
                  }

                  console.log('[UIActionStore] ✅ Action added:', logData);

                  // ✅ Phase 5: ChangePlanを生成（非破壊）
                  try {
                    const changePlan = generateChangePlan(action);
                    if (changePlan) {
                      const planStore = getChangePlanStore();
                      planStore.add(changePlan);
                    }
                  } catch (error) {
                    // ChangePlan生成のエラーはUI操作ASTを壊さない
                    console.error('[UIActionStore] ❌ Failed to generate ChangePlan (UI action AST continues):', error);
                  }
                }

                getAll() {
                  return [...this.actions]; // コピーを返す
                }

                clear() {
                  this.actions = [];
                  console.log('[UIActionStore] ✅ Cleared');
                }

                size() {
                  return this.actions.length;
                }

                getRecent(count) {
                  return this.actions.slice(-count);
                }
              }

              // グローバルストアインスタンス（シングルトン）
              let globalUIActionStore = null;
              function getUIActionStore() {
                if (!globalUIActionStore) {
                  globalUIActionStore = new UIActionStore();
                  console.log('[UIActionStore] ✅ Created global store');
                }
                return globalUIActionStore;
              }

              // ============================================
              // Phase 2: UI操作レイヤー（観測・選択のみ）
              // ============================================

              // SelectionController: DOM観測・選択専用
              class SelectionController {
                constructor(onSelectionChange) {
                  this.selectedElement = null;
                  this.onSelectionChange = onSelectionChange;
                  this.setupListeners();
                }

                setupListeners() {
                  // クリックイベントを監視（キャプチャフェーズ）
                  document.addEventListener('click', (e) => {
                    // ✅ 修正: リサイズハンドルをクリックした場合は選択しない
                    if (e.target && e.target.classList && e.target.classList.contains('resize-handle')) {
                      return;
                    }

                    const element = this.findSelectableElement(e.target);
                    if (element) {
                      this.selectElement(element);
                      // PreviewのDOM操作を防ぐ（選択のみ）
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }, true);
                }

                findSelectableElement(target) {
                  // ✅ Cursor 2.2 準拠: 最も内側の要素を優先
                  // スキップするタグ
                  const skipTags = ['BODY', 'HTML', 'SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'NOSCRIPT'];

                  // テキストノードやコメントノードの場合は親要素を取得
                  if (target.nodeType === Node.TEXT_NODE || target.nodeType === Node.COMMENT_NODE) {
                    target = target.parentElement;
                  }

                  if (!target || !(target instanceof HTMLElement)) {
                    return null;
                  }

                  // ✅ 重要: 最も内側（深い）要素を優先
                  // 親要素を遡るのではなく、target から最も深い選択可能な要素を探す
                  let element = target;
                  let bestElement = null;
                  let bestDepth = -1;

                  // target から document.body まで、すべての要素をチェック
                  while (element && element !== document.body) {
                    // スキップタグは無視
                    if (skipTags.includes(element.tagName)) {
                      element = element.parentElement;
                      continue;
                    }

                    // ✅ 深さを計算（親の数を数える）
                    let depth = 0;
                    let current = element;
                    while (current && current.parentElement && current.parentElement !== document.body) {
                      depth++;
                      current = current.parentElement;
                    }

                    // ✅ より深い（内側の）要素を優先
                    if (depth > bestDepth) {
                      bestDepth = depth;
                      bestElement = element;
                    }

                    element = element.parentElement;
                  }

                  return bestElement;
                }

                async selectElement(element) {
                  this.selectedElement = element;
                  console.log('[SelectionController] Element selected:', element.tagName, element.className);

                  // ✅ Phase 3: UI操作ASTを生成してStoreに追加
                  try {
                    const actionAST = createUIActionAST(UIActionType.SELECT_ELEMENT, element);
                    if (actionAST) {
                      // ✅ Phase 4: SourceLocatorを追加（非同期、後付け）
                      try {
                        const sourceLocator = await createSourceLocator(element);
                        if (sourceLocator) {
                          actionAST.locator = sourceLocator;
                          console.log('[SelectionController] ✅ SourceLocator attached:', {
                            filePath: sourceLocator.filePath,
                            line: sourceLocator.startLine,
                            column: sourceLocator.startColumn,
                            confidence: sourceLocator.confidence,
                          });

                          // ✅ Phase 6.5: SourceLocator が取得できたら、elementId を更新（優先順位を上げる）
                          const stableElementIdService = getStableElementIdService();
                          const updatedElementId = stableElementIdService.updateElementIdWithSourceLocator(element, sourceLocator);
                          if (updatedElementId && updatedElementId !== actionAST.elementId) {
                            actionAST.elementId = updatedElementId;
                            console.log('[SelectionController] ✅ ElementId updated via SourceLocator:', updatedElementId);
                          }
                        } else {
                          console.log('[SelectionController] ⚠️ SourceLocator not found (mapping failed)');
                        }
                      } catch (locatorError) {
                        // SourceLocatorのエラーはUI操作ASTを壊さない
                        console.error('[SelectionController] ❌ Failed to create SourceLocator (UI action AST continues):', locatorError);
                      }

                      const store = getUIActionStore();
                      store.add(actionAST);
                    }
                  } catch (error) {
                    // UI操作ASTのエラーはSelectionControllerを壊さない
                    console.error('[SelectionController] ❌ Failed to record UI action AST (selection continues):', error);
                  }

                  if (this.onSelectionChange) {
                    this.onSelectionChange(element);
                  }
                }

                getSelectedElement() {
                  return this.selectedElement;
                }

                clearSelection() {
                  this.selectedElement = null;
                  if (this.onSelectionChange) {
                    this.onSelectionChange(null);
                  }
                }
              }

              // ✅ Phase 5-b: ChangePlanDebugOverlay - 差分プレビュー・非破壊
              function ChangePlanDebugOverlay() {
                const [plans, setPlans] = React.useState([]);
                const [isVisible, setIsVisible] = React.useState(false);

                // window.__debugChangePlans フラグを監視
                React.useEffect(() => {
                  const checkVisibility = () => {
                    setIsVisible(window.__debugChangePlans === true);
                  };

                  // 初回チェック
                  checkVisibility();

                  // 定期的にチェック（フラグ変更を検知）
                  const interval = setInterval(checkVisibility, 100);

                  return () => {
                    clearInterval(interval);
                  };
                }, []);

                // ChangePlanStore を購読
                React.useEffect(() => {
                  if (!isVisible) return;

                  try {
                    const planStore = getChangePlanStore();

                    // 初回取得
                    setPlans(planStore.getAll());

                    // 定期的に更新（ChangePlanが追加されたら反映）
                    const updatePlans = () => {
                      try {
                        const currentPlans = planStore.getAll();
                        setPlans(currentPlans);
                      } catch (error) {
                        console.error('[ChangePlanDebugOverlay] Failed to update plans:', error);
                      }
                    };

                    const interval = setInterval(updatePlans, 500);

                    return () => {
                      clearInterval(interval);
                    };
                  } catch (error) {
                    console.error('[ChangePlanDebugOverlay] Failed to subscribe to ChangePlanStore:', error);
                  }
                }, [isVisible]);

                // 非表示の場合は何も返さない
                if (!isVisible) {
                  return null;
                }

                try {
                  return React.createElement('div', {
                    style: {
                      position: 'fixed',
                      top: '8px',
                      left: '8px',
                      background: 'rgba(0, 0, 0, 0.9)',
                      color: '#fff',
                      padding: '10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      maxWidth: '400px',
                      maxHeight: '500px',
                      overflow: 'auto',
                      zIndex: 9999,
                      pointerEvents: 'auto',
                      border: '1px solid #444',
                    }
                  }, [
                    React.createElement('div', {
                      key: 'title',
                      style: {
                        fontWeight: 'bold',
                        marginBottom: '8px',
                        fontSize: '12px',
                        borderBottom: '1px solid #444',
                        paddingBottom: '5px',
                      }
                    }, '📝 ChangePlans (' + plans.length + ') - NOT APPLIED'),

                    plans.length === 0
                      ? React.createElement('div', {
                          key: 'empty',
                          style: {
                            color: '#888',
                            fontSize: '10px',
                            fontStyle: 'italic',
                          }
                        }, 'No change plans yet')
                      : plans.map((plan, idx) => {
                          const riskColor = plan.riskLevel === 'low' ? '#4ade80' : plan.riskLevel === 'medium' ? '#fbbf24' : '#f87171';
                          return React.createElement('div', {
                            key: 'plan-' + idx,
                            style: {
                              marginTop: idx > 0 ? '8px' : '0',
                              paddingTop: idx > 0 ? '8px' : '0',
                              borderTop: idx > 0 ? '1px solid #444' : 'none',
                              fontSize: '10px',
                              lineHeight: '1.4',
                            }
                          }, [
                            React.createElement('div', {
                              key: 'file',
                              style: {
                                fontWeight: 'bold',
                                marginBottom: '3px',
                              }
                            }, '📄 ' + (plan.filePath || 'unknown')),
                            React.createElement('div', {
                              key: 'risk',
                              style: {
                                color: riskColor,
                                marginBottom: '3px',
                              }
                            }, 'Risk: ' + plan.riskLevel + ' | Confidence: ' + (plan.confidence * 100).toFixed(0) + '%'),
                            plan.requiresUserDecision
                              ? React.createElement('div', {
                                  key: 'warning',
                                  style: {
                                    color: '#f87171',
                                    fontSize: '9px',
                                    marginTop: '2px',
                                  }
                                }, '⚠️ Requires user decision')
                              : null,
                            plan.error
                              ? React.createElement('div', {
                                  key: 'error',
                                  style: {
                                    color: '#f87171',
                                    fontSize: '9px',
                                    marginTop: '2px',
                                  }
                                }, '❌ ' + plan.error)
                              : null,
                            // ✅ Phase 6: Apply ボタン（常に表示、Apply時にバリデーション）
                            React.createElement('button', {
                              key: 'apply-btn',
                              onClick: (e) => {
                                e.stopPropagation();
                                if (window.openChangePlanApplyPanel) {
                                  window.openChangePlanApplyPanel(plan.id);
                                }
                              },
                              style: {
                                marginTop: '5px',
                                padding: '4px 8px',
                                background: (plan.error || plan.filePath === 'unknown') ? '#666' : '#3b82f6',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: (plan.error || plan.filePath === 'unknown') ? 'not-allowed' : 'pointer',
                                fontSize: '9px',
                                pointerEvents: 'auto',
                                opacity: (plan.error || plan.filePath === 'unknown') ? 0.5 : 1,
                              },
                              title: plan.error
                                ? 'Error: ' + plan.error + '. Cannot apply this change plan.'
                                : plan.filePath === 'unknown'
                                  ? 'File path is unknown. Cannot apply this change plan.'
                                  : 'Apply this change plan',
                            }, 'Apply'),
                          ]);
                        }),
                  ]);
                } catch (error) {
                  console.error('[ChangePlanDebugOverlay] Failed to render:', error);
                  return null;
                }
              }

              // ============================================
              // Phase 6: 実プロジェクト反映（Opt-in Apply） + Undo / History
              // ============================================

              // HistoryStore: 変更履歴を管理するストア
              class HistoryStore {
                constructor() {
                  this.entries = [];
                  this.maxSize = 100; // 最大保持数
                }

                push(entry) {
                  this.entries.push(entry);

                  // 最大保持数を超えた場合は古いものを削除
                  if (this.entries.length > this.maxSize) {
                    this.entries.shift();
                  }

                  console.log('[HistoryStore] ✅ Entry added:', {
                    id: entry.id,
                    filePath: entry.filePath,
                    totalEntries: this.entries.length,
                  });
                }

                getLatest() {
                  return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
                }

                getAll() {
                  return [...this.entries]; // コピーを返す
                }

                getById(id) {
                  return this.entries.find(e => e.id === id) || null;
                }

                getByFilePath(filePath) {
                  return this.entries.filter(e => e.filePath === filePath && !e.reverted);
                }

                undo() {
                  // 元に戻されていない最新の履歴を探す
                  for (let i = this.entries.length - 1; i >= 0; i--) {
                    if (!this.entries[i].reverted) {
                      this.entries[i].reverted = true;
                      console.log('[HistoryStore] ✅ Undo:', this.entries[i].id);
                      return this.entries[i];
                    }
                  }
                  return null;
                }

                revert(entryId) {
                  const entry = this.getById(entryId);
                  if (entry && !entry.reverted) {
                    entry.reverted = true;
                    console.log('[HistoryStore] ✅ Revert:', entryId);
                    return entry;
                  }
                  return null;
                }

                clear() {
                  this.entries = [];
                  console.log('[HistoryStore] ✅ Cleared');
                }

                size() {
                  return this.entries.length;
                }
              }

              // グローバルHistoryStoreインスタンス（シングルトン）
              let globalHistoryStore = null;
              function getHistoryStore() {
                if (!globalHistoryStore) {
                  globalHistoryStore = new HistoryStore();
                  console.log('[HistoryStore] ✅ Created global store');
                }
                return globalHistoryStore;
              }

              // ApplyChangePlanService: ChangePlan を実コードへ反映する唯一のサービス
              class ApplyChangePlanService {
                constructor() {
                  this.historyStore = getHistoryStore();
                }

                // 安全装置チェック
                validatePlan(plan) {
                  const warnings = [];

                  // filePath === 'unknown' の plan は Apply 不可
                  if (plan.filePath === 'unknown') {
                    return {
                      canApply: false,
                      warnings: ['File path is unknown. Cannot apply this change plan.'],
                    };
                  }

                  // riskLevel === 'high' は警告
                  if (plan.riskLevel === 'high') {
                    warnings.push('This change has high risk. Please review carefully before applying.');
                  }

                  // error がある場合は適用不可
                  if (plan.error) {
                    return {
                      canApply: false,
                      warnings: ['Change plan has error: ' + plan.error],
                    };
                  }

                  return {
                    canApply: true,
                    warnings: warnings,
                  };
                }

                // DryRun（適用前の確認）
                async dryRun(planId) {
                  try {
                    const planStore = getChangePlanStore();
                    const plan = planStore.getAll().find(p => p.id === planId);

                    if (!plan) {
                      return {
                        canApply: false,
                        diff: '',
                        error: 'Change plan not found',
                      };
                    }

                    // 安全装置チェック
                    const validation = this.validatePlan(plan);
                    if (!validation.canApply) {
                      return {
                        canApply: false,
                        diff: '',
                        error: validation.warnings.join(', '),
                      };
                    }

                    // 差分を生成
                    const diff = formatChangePlanAsDiff(plan);

                    return {
                      canApply: true,
                      diff: diff,
                      warnings: validation.warnings,
                    };
                  } catch (error) {
                    console.error('[ApplyChangePlanService] ❌ DryRun failed:', error);
                    return {
                      canApply: false,
                      diff: '',
                      error: error.message,
                    };
                  }
                }

                // ChangePlan を適用する
                async apply(planId) {
                  try {
                    const planStore = getChangePlanStore();
                    const plan = planStore.getAll().find(p => p.id === planId);

                    if (!plan) {
                      return {
                        success: false,
                        filePath: 'unknown',
                        beforeContent: '',
                        afterContent: '',
                        error: 'Change plan not found',
                      };
                    }

                    // 安全装置チェック
                    const validation = this.validatePlan(plan);
                    if (!validation.canApply) {
                      return {
                        success: false,
                        filePath: plan.filePath,
                        beforeContent: '',
                        afterContent: '',
                        error: validation.warnings.join(', '),
                      };
                    }

                    // VSCode API が利用可能か確認
                    if (!vscode) {
                      return {
                        success: false,
                        filePath: plan.filePath,
                        beforeContent: '',
                        afterContent: '',
                        error: 'VSCode API not available. Cannot apply change plan.',
                      };
                    }

                    // Phase 6: VSCode Extension Host にファイル読み取り・書き込みを依頼
                    // メッセージを送信
                    return new Promise((resolve) => {
                      const messageId = 'apply-change-plan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

                      // メッセージリスナーを設定（一度だけ）
                      const messageHandler = (event) => {
                        const message = event.data;
                        if (message && message.type === 'APPLY_CHANGE_PLAN_RESPONSE' && message.messageId === messageId) {
                          window.removeEventListener('message', messageHandler);

                          if (message.success) {
                            // 履歴に追加
                            const historyEntry = {
                              id: 'history-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                              planId: planId,
                              filePath: plan.filePath,
                              beforeContent: message.beforeContent,
                              afterContent: message.afterContent,
                              timestamp: Date.now(),
                              reverted: false,
                            };
                            this.historyStore.push(historyEntry);

                            resolve({
                              success: true,
                              filePath: plan.filePath,
                              beforeContent: message.beforeContent,
                              afterContent: message.afterContent,
                              historyEntryId: historyEntry.id,
                            });
                          } else {
                            resolve({
                              success: false,
                              filePath: plan.filePath,
                              beforeContent: '',
                              afterContent: '',
                              error: message.error || 'Failed to apply change plan',
                            });
                          }
                        }
                      };

                      window.addEventListener('message', messageHandler);

                      // VSCode Extension Host にメッセージを送信
                      vscode.postMessage({
                        type: 'APPLY_CHANGE_PLAN',
                        messageId: messageId,
                        planId: planId,
                        plan: {
                          filePath: plan.filePath,
                          patch: plan.patch,
                          range: plan.range,
                        },
                      });

                      // タイムアウト（10秒）
                      setTimeout(() => {
                        window.removeEventListener('message', messageHandler);
                        resolve({
                          success: false,
                          filePath: plan.filePath,
                          beforeContent: '',
                          afterContent: '',
                          error: 'Timeout: VSCode Extension Host did not respond',
                        });
                      }, 10000);
                    });
                  } catch (error) {
                    console.error('[ApplyChangePlanService] ❌ Apply failed:', error);
                    return {
                      success: false,
                      filePath: 'unknown',
                      beforeContent: '',
                      afterContent: '',
                      error: error.message,
                    };
                  }
                }
              }

              // グローバルApplyChangePlanServiceインスタンス（シングルトン）
              let globalApplyService = null;
              function getApplyService() {
                if (!globalApplyService) {
                  globalApplyService = new ApplyChangePlanService();
                  console.log('[ApplyChangePlanService] ✅ Created global service');
                }
                return globalApplyService;
              }

              // ChangePlanApplyPanel: ChangePlan を「適用するかどうか」をユーザーに選ばせる UI
              function ChangePlanApplyPanel({ planId, onClose }) {
                const [plan, setPlan] = React.useState(null);
                const [dryRunResult, setDryRunResult] = React.useState(null);
                const [isApplying, setIsApplying] = React.useState(false);
                const [applyResult, setApplyResult] = React.useState(null);

                // ChangePlan を取得
                React.useEffect(() => {
                  try {
                    const planStore = getChangePlanStore();
                    const foundPlan = planStore.getAll().find(p => p.id === planId);
                    setPlan(foundPlan);

                    if (foundPlan) {
                      // DryRun を実行
                      const applyService = getApplyService();
                      applyService.dryRun(planId).then(result => {
                        setDryRunResult(result);
                      });
                    }
                  } catch (error) {
                    console.error('[ChangePlanApplyPanel] Failed to load plan:', error);
                  }
                }, [planId]);

                const handleApply = async () => {
                  if (!plan) return;

                  setIsApplying(true);
                  setApplyResult(null);

                  try {
                    const applyService = getApplyService();
                    const result = await applyService.apply(planId);

                    setApplyResult(result);

                    if (result.success) {
                      console.log('[ChangePlanApplyPanel] ✅ Change plan applied:', result);
                      // 成功時は自動で閉じる（オプション）
                      setTimeout(() => {
                        if (onClose) onClose();
                      }, 1000);
                    } else {
                      console.error('[ChangePlanApplyPanel] ❌ Failed to apply:', result.error);
                    }
                  } catch (error) {
                    console.error('[ChangePlanApplyPanel] ❌ Apply error:', error);
                    setApplyResult({
                      success: false,
                      error: error.message,
                    });
                  } finally {
                    setIsApplying(false);
                  }
                };

                const handleCancel = () => {
                  if (onClose) onClose();
                };

                if (!plan) {
                  return React.createElement('div', {
                    style: {
                      position: 'fixed',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      background: 'rgba(0, 0, 0, 0.9)',
                      color: '#fff',
                      padding: '20px',
                      borderRadius: '4px',
                      zIndex: 10003,
                    }
                  }, 'Loading...');
                }

                const validation = getApplyService().validatePlan(plan);
                const canApply = validation.canApply && dryRunResult && dryRunResult.canApply;

                return React.createElement('div', {
                  style: {
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(0, 0, 0, 0.95)',
                    color: '#fff',
                    padding: '20px',
                    borderRadius: '4px',
                    zIndex: 10003,
                    maxWidth: '600px',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    border: '1px solid #444',
                  }
                }, [
                  // タイトル
                  React.createElement('div', {
                    key: 'title',
                    style: {
                      fontWeight: 'bold',
                      fontSize: '16px',
                      marginBottom: '15px',
                      borderBottom: '1px solid #444',
                      paddingBottom: '10px',
                    }
                  }, '📝 Apply Change Plan'),

                  // ファイル情報
                  React.createElement('div', {
                    key: 'file',
                    style: {
                      marginBottom: '10px',
                      fontSize: '12px',
                    }
                  }, '📄 ' + plan.filePath),

                  // リスクレベル
                  React.createElement('div', {
                    key: 'risk',
                    style: {
                      marginBottom: '10px',
                      fontSize: '12px',
                      color: plan.riskLevel === 'low' ? '#4ade80' : plan.riskLevel === 'medium' ? '#fbbf24' : '#f87171',
                    }
                  }, 'Risk: ' + plan.riskLevel + ' | Confidence: ' + (plan.confidence * 100).toFixed(0) + '%'),

                  // 警告
                  validation.warnings.length > 0 && React.createElement('div', {
                    key: 'warnings',
                    style: {
                      marginBottom: '10px',
                      padding: '10px',
                      background: 'rgba(251, 191, 36, 0.2)',
                      borderRadius: '4px',
                      fontSize: '11px',
                    }
                  }, validation.warnings.map((warning, idx) =>
                    React.createElement('div', { key: 'warning-' + idx }, '⚠️ ' + warning)
                  )),

                  // 差分表示
                  dryRunResult && dryRunResult.diff && React.createElement('div', {
                    key: 'diff',
                    style: {
                      marginBottom: '15px',
                      padding: '10px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '300px',
                      overflow: 'auto',
                    }
                  }, dryRunResult.diff),

                  // エラー表示
                  applyResult && !applyResult.success && React.createElement('div', {
                    key: 'error',
                    style: {
                      marginBottom: '15px',
                      padding: '10px',
                      background: 'rgba(248, 113, 113, 0.2)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#f87171',
                    }
                  }, '❌ ' + (applyResult.error || 'Failed to apply change plan')),

                  // 成功表示
                  applyResult && applyResult.success && React.createElement('div', {
                    key: 'success',
                    style: {
                      marginBottom: '15px',
                      padding: '10px',
                      background: 'rgba(74, 222, 128, 0.2)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#4ade80',
                    }
                  }, '✅ Change plan applied successfully!'),

                  // ボタン
                  React.createElement('div', {
                    key: 'buttons',
                    style: {
                      display: 'flex',
                      gap: '10px',
                      justifyContent: 'flex-end',
                      marginTop: '15px',
                    }
                  }, [
                    React.createElement('button', {
                      key: 'cancel',
                      onClick: handleCancel,
                      style: {
                        padding: '8px 16px',
                        background: '#444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }
                    }, 'Cancel'),
                    React.createElement('button', {
                      key: 'apply',
                      onClick: handleApply,
                      disabled: !canApply || isApplying,
                      style: {
                        padding: '8px 16px',
                        background: canApply && !isApplying ? '#3b82f6' : '#666',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: canApply && !isApplying ? 'pointer' : 'not-allowed',
                        fontSize: '12px',
                        opacity: canApply && !isApplying ? 1 : 0.5,
                      }
                    }, isApplying ? 'Applying...' : 'Apply'),
                  ]),
                ]);
              }

              // ============================================
              // Phase 7: UI操作レイヤー（Layout / Drag / Property）
              // ============================================

              // VirtualStyleResolver: UI操作ASTを元に仮想スタイルを合成表示
              class VirtualStyleResolver {
                constructor() {
                  this.virtualStyles = new Map(); // elementId → computed style
                }

                // 複数のUIActionASTを合成して仮想スタイルを計算
                resolveVirtualStyle(elementId, uiActions) {
                  if (!elementId) {
                    return null;
                  }

                  // 該当elementIdのUIActionASTを抽出（時系列順）
                  const relevantActions = uiActions
                    .filter(action => action.elementId === elementId)
                    .sort((a, b) => a.timestamp - b.timestamp);

                  if (relevantActions.length === 0) {
                    return null;
                  }

                  // 初期スタイル
                  const virtualStyle = {
                    position: 'relative',
                    left: 0,
                    top: 0,
                    width: null,
                    height: null,
                    transform: null,
                    properties: {},
                  };

                  // UIActionASTを順に適用
                  for (const action of relevantActions) {
                    if (action.type === UIActionType.MOVE) {
                      virtualStyle.left = (virtualStyle.left || 0) + (action.deltaX || 0);
                      virtualStyle.top = (virtualStyle.top || 0) + (action.deltaY || 0);
                    } else if (action.type === UIActionType.MOVE_ELEMENT) {
                      // ✅ Phase 7.1.3: MOVE_ELEMENTは仮想スタイルに反映しない（DOM構造変更のため）
                      // 実際の反映はPhase 8（Apply）で行う
                    } else if (action.type === UIActionType.RESIZE) {
                      if (action.width !== undefined) {
                        virtualStyle.width = action.width;
                      }
                      if (action.height !== undefined) {
                        virtualStyle.height = action.height;
                      }
                    } else if (action.type === UIActionType.SET_PROPERTY) {
                      if (action.property && action.value !== undefined) {
                        virtualStyle.properties[action.property] = action.value;
                      }
                    } else if (action.type === UIActionType.SET_LAYOUT) {
                      // ✅ Phase 7.3: レイアウト設定を仮想スタイルに反映
                      if (action.layout) {
                        if (action.layout.display) {
                          virtualStyle.properties.display = action.layout.display;
                        }
                        if (action.layout.direction) {
                          virtualStyle.properties.flexDirection = action.layout.direction;
                        }
                        if (action.layout.align) {
                          virtualStyle.properties.alignItems = action.layout.align;
                        }
                        if (action.layout.gap) {
                          virtualStyle.properties.gap = action.layout.gap + 'px';
                        }
                      }
                    }
                  }

                  return virtualStyle;
                }

                clear() {
                  this.virtualStyles.clear();
                }
              }

              // グローバルVirtualStyleResolverインスタンス（シングルトン）
              let globalVirtualStyleResolver = null;
              function getVirtualStyleResolver() {
                if (!globalVirtualStyleResolver) {
                  globalVirtualStyleResolver = new VirtualStyleResolver();
                  console.log('[VirtualStyleResolver] ✅ Created global resolver');
                }
                return globalVirtualStyleResolver;
              }

              // ============================================
              // Phase 7.5: Cursor 2.2 方式 Drag & Layout Interaction 再設計
              // ============================================

              // LayoutNode: Layout Tree のノード
              // ✅ Phase 7.5: DOM を read-only として扱うための仮想 Tree
              // ✅ Phase 7.x: container 情報を追加（グループ対応）
              // ✅ Phase 7.x2: grid 情報を追加（Grid レイアウト対応）
              function createLayoutNode(elementId, parentId, children, tagName, rect, isContainer, layoutType, grid) {
                return {
                  elementId: elementId,
                  parentId: parentId,
                  children: children || [],
                  tagName: tagName || 'UNKNOWN',
                  rect: rect || { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
                  isContainer: isContainer || false, // ✅ Phase 7.x: コンテナかどうか
                  layoutType: layoutType || 'absolute', // ✅ Phase 7.x: レイアウトタイプ
                  grid: grid || null, // ✅ Phase 7.x2: Grid 情報（columns, rows, cellRects）
                };
              }

              // ✅ Phase 7.x2: Grid 情報を解析
              function parseGrid(element, rect) {
                if (!element || !(element instanceof HTMLElement)) {
                  return null;
                }

                const style = window.getComputedStyle(element);
                if (style.display !== 'grid') {
                  return null;
                }

                // grid-template-columns / rows を解析
                const gridTemplateColumns = style.gridTemplateColumns || '';
                const gridTemplateRows = style.gridTemplateRows || '';

                // トラック数を取得（'repeat(3, 100px)' や '100px 100px 100px' などに対応）
                const parseTrackList = (trackList) => {
                  if (!trackList || trackList.trim() === '') {
                    return 1; // デフォルトは1
                  }

                  // repeat() を検出（例: repeat(3, 100px)）
                  // ✅ 修正: 正規表現を文字列として構築（テンプレートリテラル内でのエスケープ問題を回避）
                  const repeatPattern = new RegExp('repeat\\s*\\(\\s*(\\d+)\\s*,\\s*[^\\)]+\\)');
                  const repeatMatch = trackList.match(repeatPattern);
                  if (repeatMatch) {
                    return parseInt(repeatMatch[1], 10);
                  }

                  // スペース区切りのトラック数をカウント
                  const tracks = trackList.trim().split(/\s+/).filter(t => t.length > 0);
                  return tracks.length > 0 ? tracks.length : 1;
                };

                const columns = parseTrackList(gridTemplateColumns);
                const rows = parseTrackList(gridTemplateRows);

                // gap を考慮（gap は後で計算に含める）
                const gapX = parseFloat(style.columnGap || style.gap || '0') || 0;
                const gapY = parseFloat(style.rowGap || style.gap || '0') || 0;

                // セルサイズを計算（gap を考慮）
                const totalGapX = gapX * (columns - 1);
                const totalGapY = gapY * (rows - 1);
                const cellWidth = (rect.width - totalGapX) / columns;
                const cellHeight = (rect.height - totalGapY) / rows;

                // セル配列を生成
                const cells = [];
                let index = 0;

                for (let r = 0; r < rows; r++) {
                  for (let c = 0; c < columns; c++) {
                    cells.push({
                      row: r,
                      col: c,
                      index: index,
                      rect: {
                        left: rect.left + c * (cellWidth + gapX),
                        top: rect.top + r * (cellHeight + gapY),
                        width: cellWidth,
                        height: cellHeight,
                        right: rect.left + (c + 1) * (cellWidth + gapX) - gapX,
                        bottom: rect.top + (r + 1) * (cellHeight + gapY) - gapY,
                      },
                    });
                    index++;
                  }
                }

                return {
                  columns: columns,
                  rows: rows,
                  cellRects: cells,
                };
              }

              // ✅ Phase 7.x: レイアウトタイプを検出
              function detectLayoutType(element) {
                if (!element || !(element instanceof HTMLElement)) {
                  return 'absolute';
                }
                const style = window.getComputedStyle(element);
                if (style.display === 'flex') {
                  return style.flexDirection === 'row' ? 'row' : 'column';
                }
                if (style.display === 'grid') {
                  return 'grid';
                }
                return 'absolute';
              }

              // ✅ Phase 7.x: 子要素を受け入れられるか判定
              function canAcceptChildren(node) {
                if (!node || !node.isContainer) {
                  return false;
                }
                // 自己完結型要素は子要素を受け入れない
                const selfClosingTags = ['IMG', 'INPUT', 'TEXTAREA', 'BR', 'HR', 'META', 'LINK', 'SCRIPT', 'STYLE'];
                if (selfClosingTags.includes(node.tagName)) {
                  return false;
                }
                return true;
              }

              // ============================================
              // Cursor 2.2 準拠: 座標系の完全統一（ズレ防止）
              // ============================================

              // ViewportTransformService: ビューポート変換を管理
              // ✅ 重要: DOM の getBoundingClientRect を直接信頼せず、論理座標 + ビューポート変換で算出
              class ViewportTransformService {
                constructor() {
                  this.container = null;
                  this.scrollX = 0;
                  this.scrollY = 0;
                  this.zoomScale = 1.0;
                  this.containerOffset = { left: 0, top: 0 };
                }

                // コンテナを設定
                setContainer(container) {
                  this.container = container;
                  this.update();
                }

                // ビューポート情報を更新
                update() {
                  if (!this.container) {
                    return;
                  }

                  // スクロール位置を取得
                  this.scrollX = this.container.scrollLeft || 0;
                  this.scrollY = this.container.scrollTop || 0;

                  // コンテナのオフセットを取得
                  const containerRect = this.container.getBoundingClientRect();
                  this.containerOffset = {
                    left: containerRect.left,
                    top: containerRect.top,
                  };

                  // ズームスケール（将来対応）
                  this.zoomScale = 1.0;
                }

                // 論理座標（Logical Layout Rect）をレンダリング座標（Render Rect）に変換
                logicalToRender(logicalRect) {
                  if (!logicalRect) {
                    return null;
                  }

                  return {
                    left: logicalRect.left + this.scrollX - this.containerOffset.left,
                    top: logicalRect.top + this.scrollY - this.containerOffset.top,
                    width: logicalRect.width * this.zoomScale,
                    height: logicalRect.height * this.zoomScale,
                    right: (logicalRect.left + logicalRect.width) + this.scrollX - this.containerOffset.left,
                    bottom: (logicalRect.top + logicalRect.height) + this.scrollY - this.containerOffset.top,
                  };
                }

                // レンダリング座標を論理座標に変換
                renderToLogical(renderRect) {
                  if (!renderRect) {
                    return null;
                  }

                  return {
                    left: renderRect.left - this.scrollX + this.containerOffset.left,
                    top: renderRect.top - this.scrollY + this.containerOffset.top,
                    width: renderRect.width / this.zoomScale,
                    height: renderRect.height / this.zoomScale,
                    right: renderRect.right - this.scrollX + this.containerOffset.left,
                    bottom: renderRect.bottom - this.scrollY + this.containerOffset.top,
                  };
                }
              }

              // グローバル ViewportTransformService インスタンス
              let globalViewportTransformService = null;
              function getViewportTransformService() {
                if (!globalViewportTransformService) {
                  globalViewportTransformService = new ViewportTransformService();
                  console.log('[ViewportTransformService] ✅ Created global service');
                }
                return globalViewportTransformService;
              }

              // FlexWrapLineGrouper: flex-wrap 時の行（ライン）グループ化
              // ✅ Phase 7.x Flex: wrap 時の行推定と index 決定
              class FlexWrapLineGrouper {
                // children rect から line group を作成
                groupIntoLines(childrenRects, primaryAxis, crossAxis) {
                  if (!childrenRects || childrenRects.length === 0) {
                    return {
                      lines: [],
                      medianCrossSize: 0,
                    };
                  }

                  // ✅ crossAxis のサイズの中央値を計算（threshold 用）
                  const crossSizes = childrenRects.map(rect => {
                    return crossAxis === 'y' ? rect.height : rect.width;
                  });
                  crossSizes.sort((a, b) => a - b);
                  const medianCrossSize = crossSizes[Math.floor(crossSizes.length / 2)] || 0;
                  const threshold = medianCrossSize * 0.6;

                  // ✅ primaryAxis と crossAxis でソート
                  const sorted = [...childrenRects].sort((a, b) => {
                    // まず crossAxis でソート（行を分ける）
                    const crossA = crossAxis === 'y' ? a.top : a.left;
                    const crossB = crossAxis === 'y' ? b.top : b.left;
                    if (Math.abs(crossA - crossB) > threshold) {
                      return crossA - crossB;
                    }
                    // 同じ行内では primaryAxis でソート
                    const primaryA = primaryAxis === 'x' ? a.left : a.top;
                    const primaryB = primaryAxis === 'x' ? b.left : b.top;
                    return primaryA - primaryB;
                  });

                  // ✅ line にグループ化
                  const lines = [];
                  let currentLine = [];
                  let currentLineCrossPos = null;

                  for (const rect of sorted) {
                    const crossPos = crossAxis === 'y' ? rect.top : rect.left;

                    if (currentLineCrossPos === null || Math.abs(crossPos - currentLineCrossPos) > threshold) {
                      // 新しい行
                      if (currentLine.length > 0) {
                        lines.push(currentLine);
                      }
                      currentLine = [rect];
                      currentLineCrossPos = crossPos;
                    } else {
                      // 同じ行
                      currentLine.push(rect);
                    }
                  }

                  if (currentLine.length > 0) {
                    lines.push(currentLine);
                  }

                  // ✅ 各 line 内を primaryAxis で再ソート
                  for (const line of lines) {
                    line.sort((a, b) => {
                      const primaryA = primaryAxis === 'x' ? a.left : a.top;
                      const primaryB = primaryAxis === 'x' ? b.left : b.top;
                      return primaryA - primaryB;
                    });
                  }

                  return {
                    lines: lines,
                    medianCrossSize: medianCrossSize,
                  };
                }

                // マウス位置から最適な line と insertion を決定
                findLineAndInsertion(mouseLogicalPos, lines, primaryAxis, crossAxis, reverse) {
                  if (!lines || lines.length === 0) {
                    return {
                      lineIndex: 0,
                      indexInLine: 0,
                      globalInsertionIndex: 0,
                      insertion: primaryAxis === 'x' ? 'left' : 'top',
                    };
                  }

                  // ✅ 最も近い line を探す
                  let closestLineIndex = 0;
                  let minDistance = Infinity;

                  for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.length === 0) {
                      continue;
                    }

                    // line の crossAxis 中心を計算
                    const crossPositions = line.map(rect => {
                      return crossAxis === 'y' ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
                    });
                    const lineCrossCenter = crossPositions.reduce((a, b) => a + b, 0) / crossPositions.length;

                    const mouseCrossPos = crossAxis === 'y' ? mouseLogicalPos.top : mouseLogicalPos.left;
                    const dist = Math.abs(mouseCrossPos - lineCrossCenter);

                    if (dist < minDistance) {
                      minDistance = dist;
                      closestLineIndex = i;
                    }
                  }

                  const chosenLine = lines[closestLineIndex];
                  if (!chosenLine || chosenLine.length === 0) {
                    return {
                      lineIndex: closestLineIndex,
                      indexInLine: 0,
                      globalInsertionIndex: 0,
                      insertion: primaryAxis === 'x' ? 'left' : 'top',
                    };
                  }

                  // ✅ line 内で insertion を決定
                  const mousePrimaryPos = primaryAxis === 'x' ? mouseLogicalPos.left : mouseLogicalPos.top;
                  let indexInLine = 0;
                  let insertion = primaryAxis === 'x' ? 'left' : 'top';

                  for (let i = 0; i < chosenLine.length; i++) {
                    const rect = chosenLine[i];
                    const rectPrimaryCenter = primaryAxis === 'x'
                      ? rect.left + rect.width / 2
                      : rect.top + rect.height / 2;

                    if (mousePrimaryPos < rectPrimaryCenter) {
                      indexInLine = i;
                      insertion = primaryAxis === 'x' ? 'left' : 'top';
                      break;
                    } else if (i === chosenLine.length - 1) {
                      indexInLine = chosenLine.length;
                      insertion = primaryAxis === 'x' ? 'right' : 'bottom';
                    }
                  }

                  // ✅ reverse 対応
                  if (reverse) {
                    if (primaryAxis === 'x') {
                      insertion = insertion === 'left' ? 'right' : 'left';
                      indexInLine = chosenLine.length - indexInLine;
                    } else {
                      insertion = insertion === 'top' ? 'bottom' : 'top';
                      indexInLine = chosenLine.length - indexInLine;
                    }
                  }

                  // ✅ globalInsertionIndex を計算（前の行の要素数を累積）
                  let globalInsertionIndex = 0;
                  for (let i = 0; i < closestLineIndex; i++) {
                    globalInsertionIndex += lines[i].length;
                  }
                  globalInsertionIndex += indexInLine;

                  // ✅ デバッグ情報
                  console.log('[FlexWrap] ✅ Line and insertion resolved:', {
                    linesCount: lines.length,
                    chosenLineIndex: closestLineIndex,
                    indexInLine: indexInLine,
                    globalInsertionIndex: globalInsertionIndex,
                    insertion: insertion,
                  });

                  return {
                    lineIndex: closestLineIndex,
                    indexInLine: indexInLine,
                    globalInsertionIndex: globalInsertionIndex,
                    insertion: insertion,
                  };
                }
              }

              // LayoutAxisResolver: レイアウトタイプから軸情報を解決
              // ✅ Cursor 2.2 準拠: レイアウト方向に応じた挿入位置を決定
              // ✅ Phase 7.x Flex: flex-row/flex-column, wrap, reverse 対応
              class LayoutAxisResolver {
                // レイアウト軸情報を解決
                resolve(targetDomElement, computedStyle, layoutTreeNode) {
                  if (!targetDomElement || !layoutTreeNode) {
                    return {
                      layoutType: 'absolute',
                      primaryAxis: 'y',
                      crossAxis: 'x',
                      allowedInsertions: ['before', 'after', 'inside'],
                      wrap: false,
                      reverse: false,
                    };
                  }

                  // ✅ Phase 7.x Flex: computedStyle から flex 判定
                  const style = computedStyle || (targetDomElement ? window.getComputedStyle(targetDomElement) : null);
                  if (!style) {
                    return {
                      layoutType: 'absolute',
                      primaryAxis: 'y',
                      crossAxis: 'x',
                      allowedInsertions: ['top', 'bottom', 'inside'],
                      wrap: false,
                      reverse: false,
                    };
                  }

                  let layoutType = 'absolute';
                  let primaryAxis = 'y';
                  let crossAxis = 'x';
                  let allowedInsertions = ['top', 'bottom', 'inside'];
                  let wrap = false;
                  let reverse = false;

                  // ✅ Phase 7.x Flex: flex 判定
                  if (style.display === 'flex') {
                    const flexDirection = style.flexDirection || 'row';
                    const flexWrap = style.flexWrap || 'nowrap';

                    // flex-direction 判定
                    if (flexDirection === 'row' || flexDirection === 'row-reverse') {
                      layoutType = 'flex-row';
                      primaryAxis = 'x';
                      crossAxis = 'y';
                      allowedInsertions = ['left', 'right', 'inside'];
                      reverse = flexDirection === 'row-reverse';
                    } else if (flexDirection === 'column' || flexDirection === 'column-reverse') {
                      layoutType = 'flex-column';
                      primaryAxis = 'y';
                      crossAxis = 'x';
                      allowedInsertions = ['top', 'bottom', 'inside'];
                      reverse = flexDirection === 'column-reverse';
                    }

                    // flex-wrap 判定
                    wrap = flexWrap === 'wrap' || flexWrap === 'wrap-reverse';
                  } else if (layoutTreeNode.layoutType === 'column') {
                    // 既存の column レイアウト（非 flex）
                    layoutType = 'column';
                    primaryAxis = 'y';
                    crossAxis = 'x';
                    allowedInsertions = ['top', 'bottom', 'inside'];
                  } else if (layoutTreeNode.layoutType === 'row') {
                    // 既存の row レイアウト（非 flex）
                    layoutType = 'row';
                    primaryAxis = 'x';
                    crossAxis = 'y';
                    allowedInsertions = ['left', 'right', 'inside'];
                  } else if (layoutTreeNode.layoutType === 'grid') {
                    // grid: x/y 両対応
                    layoutType = 'grid';
                    primaryAxis = 'x';
                    crossAxis = 'y';
                    allowedInsertions = ['left', 'right', 'top', 'bottom', 'inside'];
                  } else {
                    // absolute: デフォルト（縦方向）
                    layoutType = 'absolute';
                    primaryAxis = 'y';
                    crossAxis = 'x';
                    allowedInsertions = ['top', 'bottom', 'inside'];
                  }

                  // ✅ デバッグ情報
                  console.log('[FlexAxis] ✅ Layout axis resolved:', {
                    layoutType: layoutType,
                    direction: style.flexDirection || 'none',
                    wrap: wrap,
                    primaryAxis: primaryAxis,
                    crossAxis: crossAxis,
                    reverse: reverse,
                  });

                  return {
                    layoutType: layoutType,
                    primaryAxis: primaryAxis,
                    crossAxis: crossAxis,
                    allowedInsertions: allowedInsertions,
                    wrap: wrap,
                    reverse: reverse,
                  };
                }
              }

              // LayoutTreeService: DOM Snapshot から Layout Tree を構築
              // ✅ Phase 7: 最重要コンポーネント（Cursor 2.2 準拠）
              class LayoutTreeService {
                constructor() {
                  this.tree = new Map(); // elementId → LayoutNode
                  this.rootIds = []; // ルートノードの elementId リスト
                  this.elementIdToDomElement = new Map(); // ✅ Phase 7: elementId → DOM要素（逆引き用）
                }

                // DOM Snapshot から初期 Tree を構築
                buildFromDOM(container) {
                  if (!container) {
                    return;
                  }

                  this.tree.clear();
                  this.rootIds = [];

                  const stableElementIdService = getStableElementIdService();

                  // 再帰的に DOM を走査して Layout Tree を構築
                  const buildNode = (element, parentId) => {
                    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
                      return null;
                    }

                    // スキップする要素
                    if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' ||
                        element.tagName === 'META' || element.tagName === 'LINK' ||
                        element.getAttribute && element.getAttribute('data-ignore') === 'true') {
                      return null;
                    }

                    const elementId = stableElementIdService.getStableElementId(element);
                    if (!elementId) {
                      return null;
                    }

                    // 子要素を先に構築（children を取得するため）
                    const children = [];
                    for (let i = 0; i < element.children.length; i++) {
                      const childElement = element.children[i];
                      const childNode = buildNode(childElement, elementId);
                      if (childNode) {
                        children.push(childNode.elementId);
                      }
                    }

                    // LayoutNode を作成
                    const rect = element.getBoundingClientRect();
                    // ✅ Phase 7.x: レイアウトタイプを検出
                    const layoutType = detectLayoutType(element);
                    // ✅ Phase 7.x: コンテナかどうかを判定（子要素がある、または特定のタグ）
                    const isContainer = children.length > 0 || ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'UL', 'OL', 'LI'].includes(element.tagName);
                    // ✅ Phase 7.x2: Grid 情報を解析（grid レイアウトの場合のみ）
                    const grid = layoutType === 'grid' ? parseGrid(element, rect) : null;

                    const node = createLayoutNode(
                      elementId,
                      parentId,
                      children,
                      element.tagName,
                      {
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                        right: rect.right,
                        bottom: rect.bottom,
                      },
                      isContainer,
                      layoutType,
                      grid // ✅ Phase 7.x2: Grid 情報
                    );

                    this.tree.set(elementId, node);
                    // ✅ Phase 7: elementId → DOM要素の対応を保持（逆引き用）
                    this.elementIdToDomElement.set(elementId, element);

                    if (!parentId) {
                      this.rootIds.push(elementId);
                    }

                    return node;
                  };

                  // コンテナ内のすべての要素を走査
                  buildNode(container, null);

                  console.log('[LayoutTreeService] ✅ Tree built:', {
                    totalNodes: this.tree.size,
                    rootNodes: this.rootIds.length,
                  });
                }

                // Tree を更新（DOM の変更を反映）
                updateTree() {
                  // 簡易版: 全体を再構築
                  // Phase 8 で差分更新を実装
                  const container = document.getElementById('design-surface-container');
                  if (container) {
                    // ✅ Phase 7: elementId → DOM要素の対応を再構築（clear してから build）
                    // ✅ 重要: clear() は buildFromDOM() 内で自動的に再構築されるため、ここでは clear しない
                    // ただし、buildFromDOM() 内で clear() が呼ばれるため、問題ない
                    this.buildFromDOM(container);
                  }
                }

                // ✅ Phase 7: elementId から DOM要素を取得（逆引き）
                getDomElement(elementId) {
                  // ✅ まず Map から取得
                  let domElement = this.elementIdToDomElement.get(elementId);

                  if (domElement) {
                    return domElement;
                  }

                  // ✅ Map にない場合は null を返す（全走査フォールバックは禁止）
                  // 理由: updateTree() が呼ばれていない可能性があるため、ログを出す
                  console.warn('[LayoutTreeService] ⚠️ DOM element not found in Map (updateTree() may be needed):', elementId);
                  return null;
                }

                // elementId から LayoutNode を取得
                getNode(elementId) {
                  return this.tree.get(elementId) || null;
                }

                // 親ノードを取得
                getParent(elementId) {
                  const node = this.getNode(elementId);
                  if (!node || !node.parentId) {
                    return null;
                  }
                  return this.getNode(node.parentId);
                }

                // 子ノードを取得
                getChildren(elementId) {
                  const node = this.getNode(elementId);
                  if (!node) {
                    return [];
                  }
                  return node.children.map(id => this.getNode(id)).filter(n => n !== null);
                }

                // すべてのノードを取得
                getAllNodes() {
                  return Array.from(this.tree.values());
                }
              }

              // グローバルLayoutTreeServiceインスタンス（シングルトン）
              let globalLayoutTreeService = null;
              function getLayoutTreeService() {
                if (!globalLayoutTreeService) {
                  globalLayoutTreeService = new LayoutTreeService();
                  console.log('[LayoutTreeService] ✅ Created global service');
                }
                return globalLayoutTreeService;
              }

              // ============================================
              // PreviewApplyLayer: MOVE_ELEMENT を即時反映するレイヤー（Cursor 2.2 準拠）
              // ============================================
              // ✅ 重要: DOM を直接操作して即座に Preview を更新
              // Undo前提、正確性より「即時UX」を優先
              class PreviewApplyLayer {
                constructor() {
                  this.layoutTreeService = getLayoutTreeService();
                  this.stableElementIdService = getStableElementIdService();
                }

                // MOVE_ELEMENT を即時反映
                apply(action) {
                  if (!action || action.type !== UIActionType.MOVE_ELEMENT) {
                    return;
                  }

                  console.log('[PreviewApplyLayer] ✅ Apply started:', {
                    elementId: action.elementId,
                    fromParentId: action.fromParentId,
                    fromIndex: action.fromIndex,
                    toParentId: action.toParentId,
                    toIndex: action.toIndex,
                  });

                  try {
                    const { elementId, fromParentId, fromIndex, toParentId, toIndex } = action;

                    // ✅ elementId から DOM要素を取得
                    const draggedElement = this.layoutTreeService.getDomElement(elementId);
                    if (!draggedElement) {
                      console.warn('[PreviewApplyLayer] ⚠️ Dragged element not found:', elementId);
                      return;
                    }
                    console.log('[PreviewApplyLayer] ✅ Dragged element found:', {
                      elementId: elementId,
                      tagName: draggedElement.tagName,
                    });

                    // ✅ fromParentId から DOM要素を取得（null の場合はルート要素）
                    const fromParent = fromParentId ? this.layoutTreeService.getDomElement(fromParentId) : null;
                    // ✅ 重要: fromParentId が null の場合（ルート要素）も処理可能にする
                    if (fromParentId && !fromParent) {
                      console.warn('[PreviewApplyLayer] ⚠️ From parent not found:', fromParentId);
                      return;
                    }
                    if (!fromParentId) {
                      console.log('[PreviewApplyLayer] ✅ From parent is null (root element)');
                    }

                    // ✅ toParentId から DOM要素を取得（null は許さない）
                    const toParent = toParentId ? this.layoutTreeService.getDomElement(toParentId) : null;
                    if (!toParent) {
                      console.warn('[PreviewApplyLayer] ⚠️ To parent not found:', toParentId);
                      return;
                    }
                    console.log('[PreviewApplyLayer] ✅ To parent found:', {
                      toParentId: toParentId,
                      tagName: toParent.tagName,
                    });

                    // ✅ 現在の親から要素を削除
                    // fromParentId が null の場合は、draggedElement.parentNode から削除
                    if (draggedElement.parentNode) {
                      if (fromParentId && draggedElement.parentNode === fromParent) {
                        fromParent.removeChild(draggedElement);
                        console.log('[PreviewApplyLayer] ✅ Removed from parent:', fromParentId);
                      } else if (!fromParentId) {
                        // ルート要素の場合は親から削除
                        draggedElement.parentNode.removeChild(draggedElement);
                        console.log('[PreviewApplyLayer] ✅ Removed from root parent');
                      }
                    }

                    // ✅ 新しい親に挿入
                    // toIndex に基づいて referenceNode を決定
                    let referenceNode = null;
                    if (toIndex !== null && toIndex !== undefined && toIndex >= 0 && toIndex < toParent.children.length) {
                      // toIndex の位置にある要素を referenceNode とする
                      referenceNode = toParent.children[toIndex];
                      // ✅ 重要: referenceNode が draggedElement 自身の場合はスキップ
                      if (referenceNode === draggedElement) {
                        referenceNode = toIndex + 1 < toParent.children.length ? toParent.children[toIndex + 1] : null;
                      }
                    }

                    // ✅ 既に同じ親の同じ位置にある場合はスキップ
                    if (draggedElement.parentNode === toParent) {
                      const currentIndex = Array.from(toParent.children).indexOf(draggedElement);
                      if (currentIndex === toIndex) {
                        console.log('[PreviewApplyLayer] ⚠️ Element already at target position, skipping');
                        return;
                      }
                    }

                    if (referenceNode && referenceNode !== draggedElement) {
                      toParent.insertBefore(draggedElement, referenceNode);
                      console.log('[PreviewApplyLayer] ✅ Inserted before reference node:', {
                        toIndex: toIndex,
                        referenceNodeTag: referenceNode.tagName,
                      });
                    } else {
                      // referenceNode がない、または自分自身の場合は末尾に追加
                      toParent.appendChild(draggedElement);
                      console.log('[PreviewApplyLayer] ✅ Appended to parent (no reference node)');
                    }

                    // ✅ LayoutTree を更新（構造判定用）
                    this.layoutTreeService.updateTree();

                    console.log('[PreviewApplyLayer] ✅ MOVE_ELEMENT applied:', {
                      elementId: elementId,
                      fromParentId: fromParentId,
                      fromIndex: fromIndex,
                      toParentId: toParentId,
                      toIndex: toIndex,
                    });
                  } catch (error) {
                    console.error('[PreviewApplyLayer] ❌ Failed to apply MOVE_ELEMENT:', error);
                  }
                }
              }

              // グローバルPreviewApplyLayerインスタンス（シングルトン）
              let globalPreviewApplyLayer = null;
              function getPreviewApplyLayer() {
                if (!globalPreviewApplyLayer) {
                  globalPreviewApplyLayer = new PreviewApplyLayer();
                  console.log('[PreviewApplyLayer] ✅ Created global layer');
                }
                return globalPreviewApplyLayer;
              }

              // ============================================
              // DragStateStore: Drag & Drop の状態管理専用ストア（Cursor 2.2 準拠）
              // ============================================
              // ✅ 重要: 描画ロジックは一切含まない、状態保持のみ
              // ✅ Phase 7.x: guide を追加（レイアウト対応ガイドライン）
              class DragStateStore {
                constructor() {
                  this.state = {
                    isDragging: false,
                    draggedElementId: null,
                    ghostRect: null,
                    slotPreviewRect: null,
                    slotPosition: null,
                    guide: null, // ✅ Phase 7.x: GuideDescriptor (line / box)
                  };
                  this.listeners = new Set();
                }

                subscribe(fn) {
                  this.listeners.add(fn);
                  return () => this.listeners.delete(fn);
                }

                getState() {
                  return { ...this.state };
                }

                set(partial) {
                  this.state = { ...this.state, ...partial };
                  this.listeners.forEach(l => l(this.state));
                }

                reset() {
                  this.set({
                    isDragging: false,
                    draggedElementId: null,
                    ghostRect: null,
                    slotPreviewRect: null,
                    slotPosition: null,
                    guide: null, // ✅ Phase 7.x: guide をリセット
                  });
                }
              }

              // グローバルシングルトンインスタンス
              let globalDragStateStore = null;
              function getDragStateStore() {
                if (!globalDragStateStore) {
                  globalDragStateStore = new DragStateStore();
                  console.log('[DragStateStore] ✅ Created global store');
                }
                return globalDragStateStore;
              }

              // DragOverlayRenderer: Drag & Drop の描画専用コンポーネント（Cursor 2.2 準拠）
              // ✅ 重要: DragStateStore の状態を購読して描画するだけ
              function DragOverlayRenderer() {
                const dragStateStore = getDragStateStore();
                const [state, setState] = React.useState(dragStateStore.getState());

                // ✅ マウント時のログ
                React.useEffect(() => {
                  console.log('[DragOverlayRenderer] ✅ Component mounted');
                  console.log('[DragOverlayRenderer] ✅ Mounted and subscribed to DragStateStore');

                  const unsubscribe = dragStateStore.subscribe((newState) => {
                    setState(newState);
                    // ✅ 重要: 状態更新のたびにログを出す（デバッグ用）
                    if (newState.isDragging) {
                      console.log('[DragOverlayRenderer] ✅ State updated (isDragging: true)', {
                        hasGhostRect: !!newState.ghostRect,
                        hasSlotPreviewRect: !!newState.slotPreviewRect,
                        ghostRect: newState.ghostRect,
                        slotPreviewRect: newState.slotPreviewRect,
                      });
                    } else {
                      console.log('[DragOverlayRenderer] ✅ State updated (isDragging: false)');
                    }
                  });
                  return unsubscribe;
                }, []);

                // ✅ デバッグ: レンダリングをログ出力（isDragging が true のたびに）
                if (state.isDragging) {
                  console.log('[DragOverlayRenderer] ✅ Rendering (isDragging: true)', {
                    ghostRect: state.ghostRect,
                    slotPreviewRect: state.slotPreviewRect,
                  });
                }

                if (!state.isDragging) {
                  return null;
                }

                // ✅ Cursor 2.2 準拠: GuideLineRenderer（guideDirection と layoutType のみ参照）
                // ✅ 重要: レイアウト判定・DOM構造参照・index計算は一切行わない
                const renderGuide = (guide) => {
                  if (!guide || !guide.rect) {
                    return null;
                  }

                  const { type, rect, guideDirection, layoutType } = guide;

                  if (type === 'line') {
                    // ✅ guideDirection に応じた線の描画
                    // guideDirection === 'horizontal' → 横線（上下）- column レイアウト
                    // guideDirection === 'vertical' → 縦線（左右）- row レイアウト
                    return React.createElement('div', {
                      key: 'guide-line',
                      className: 'drop-guide-line',
                      style: {
                        position: 'fixed',
                        pointerEvents: 'none',
                        zIndex: 10000,
                        left: rect.left + 'px',
                        top: rect.top + 'px',
                        width: rect.width + 'px',
                        height: rect.height + 'px',
                        backgroundColor: 'rgba(59, 130, 246, 0.9)',
                        boxSizing: 'border-box',
                      },
                    });
                  } else if (type === 'box') {
                    // ✅ inside: 青い枠（dashed）- grid / inside の場合
                    const isInside = guideDirection === 'inside';
                    return React.createElement('div', {
                      key: 'guide-box',
                      className: 'drop-guide-box',
                      style: {
                        position: 'fixed',
                        pointerEvents: 'none',
                        zIndex: 10000,
                        left: rect.left + 'px',
                        top: rect.top + 'px',
                        width: rect.width + 'px',
                        height: rect.height + 'px',
                        border: isInside ? '2px dashed rgba(59, 130, 246, 0.9)' : '2px solid rgba(59, 130, 246, 0.9)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        boxSizing: 'border-box',
                      },
                    });
                  }

                  return null;
                };

                return React.createElement(React.Fragment, null, [
                  // Ghost（半透明の青い枠）
                  state.ghostRect && React.createElement('div', {
                    key: 'ghost',
                    className: 'drag-ghost',
                    style: {
                      position: 'fixed',
                      pointerEvents: 'none',
                      zIndex: 10001,
                      left: state.ghostRect.left + 'px',
                      top: state.ghostRect.top + 'px',
                      width: state.ghostRect.width + 'px',
                      height: state.ghostRect.height + 'px',
                      opacity: 0.6,
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '2px dashed rgba(59, 130, 246, 0.8)',
                      boxSizing: 'border-box',
                      transition: 'none',
                    },
                  }),

                  // ✅ Phase 7.x: Guide（レイアウト対応ガイドライン）
                  state.guide && renderGuide(state.guide),

                  // Slot Preview（フォールバック: guide がない場合のみ表示）
                  state.slotPreviewRect && !state.guide && React.createElement('div', {
                    key: 'slot-preview',
                    className: 'slot-preview',
                    style: {
                      position: 'fixed',
                      pointerEvents: 'none',
                      zIndex: 10000,
                      left: state.slotPreviewRect.left + 'px',
                      top: state.slotPreviewRect.top + 'px',
                      width: state.slotPreviewRect.width + 'px',
                      height: state.slotPreviewRect.height + 'px',
                      backgroundColor: 'rgba(59, 130, 246, 0.8)',
                      boxSizing: 'border-box',
                    },
                  }),
                ]);
              }

              // DragSession: ドラッグ中の仮想状態（Cursor 2.2 準拠）
              class DragSession {
                constructor(draggedElementId, draggedDomElement, sourceParentId, sourceIndex) {
                  this.draggedElementId = draggedElementId;
                  this.draggedDomElement = draggedDomElement; // ✅ Phase 7: DOM要素を保持（Ghost用）
                  this.startRect = draggedDomElement.getBoundingClientRect(); // ✅ Phase 7: 開始時のrect
                  this.currentGhostRect = null; // ✅ Phase 7: Ghostの現在位置
                  this.sourceParentId = sourceParentId;
                  this.sourceIndex = sourceIndex;
                  this.currentTargetParentId = null;
                  this.currentTargetIndex = null;
                  this.position = null; // 'before' | 'after' | 'inside'
                }

                // ターゲットを更新
                updateTarget(targetParentId, targetIndex, position, insertion) {
                  this.currentTargetParentId = targetParentId;
                  this.currentTargetIndex = targetIndex;
                  this.position = position; // 後方互換性
                  this.insertion = insertion || position; // ✅ Cursor 2.2 準拠
                }

                // ターゲットをクリア
                clearTarget() {
                  this.currentTargetParentId = null;
                  this.currentTargetIndex = null;
                  this.position = null;
                }

                // 有効なターゲットがあるか
                hasValidTarget() {
                  return this.currentTargetParentId !== null && this.currentTargetIndex !== null;
                }

                // Ghost rect を更新
                updateGhostRect(rect) {
                  this.currentGhostRect = rect;
                }
              }

              // GuideRectProjector: SlotResult からガイド線 Rect を生成
              // ✅ Phase 7.x Flex: guideDirection に応じた rect 生成（投影層）
              // ✅ 重要: 論理座標で rect を生成し、ViewportTransformService で変換
              // ✅ layoutType に応じたガイド線の向き・位置を決定
              class GuideRectProjector {
                // SlotResult + containerRect + anchorRect から guideRect を生成（論理座標）
                project(slotResult, containerRect, anchorRect) {
                  if (!slotResult || !containerRect) {
                    return null;
                  }

                  const { insertion, guideDirection, layoutType } = slotResult;

                  // ✅ inside: コンテナ全体の box（論理座標）
                  if (insertion === 'inside' || guideDirection === 'inside') {
                    return {
                      left: containerRect.left + 4,
                      top: containerRect.top + 4,
                      width: containerRect.width - 8,
                      height: containerRect.height - 8,
                    };
                  }

                  // ✅ guideDirection に応じた線の生成（論理座標）
                  if (guideDirection === 'horizontal') {
                    // ✅ 横線（上下）- column レイアウト
                    // before → 上に横線
                    // after → 下に横線
                    // inside → 中央に横線
                    let top = 0;
                    if (anchorRect) {
                      if (insertion === 'top' || insertion === 'before') {
                        top = anchorRect.top - 1;
                      } else if (insertion === 'bottom' || insertion === 'after') {
                        top = anchorRect.bottom - 1;
                      } else {
                        top = containerRect.top + containerRect.height / 2 - 1;
                      }
                    } else {
                      top = containerRect.top + containerRect.height / 2 - 1;
                    }

                    return {
                      left: containerRect.left,
                      top: top,
                      width: containerRect.width,
                      height: 2,
                    };
                  } else if (guideDirection === 'vertical') {
                    // ✅ 縦線（左右）- row レイアウト
                    // before → 左に縦線
                    // after → 右に縦線
                    // inside → 中央に縦線
                    let left = 0;
                    if (anchorRect) {
                      if (insertion === 'left' || insertion === 'before') {
                        left = anchorRect.left - 1;
                      } else if (insertion === 'right' || insertion === 'after') {
                        left = anchorRect.right - 1;
                      } else {
                        left = containerRect.left + containerRect.width / 2 - 1;
                      }
                    } else {
                      left = containerRect.left + containerRect.width / 2 - 1;
                    }

                    return {
                      left: left,
                      top: containerRect.top,
                      width: 2,
                      height: containerRect.height,
                    };
                  }

                  return null;
                }
              }

              // SlotResolver: Cursor方式のスロット解決
              // ✅ Phase 7.5: rect 判定は LayoutNode.rect のみ、DOM hit-test 禁止
              // ✅ Phase 7.x: グループ対応 + レイアウト対応ガイドライン
              // ✅ Phase 7.x2: Grid レイアウト対応
              // ✅ Phase 7.x Flex: flex-row/flex-column, wrap, reverse 対応
              // ✅ Cursor 2.2 準拠: insertion と guideAxis を返す
              class SlotResolver {
                constructor(layoutTreeService) {
                  this.layoutTreeService = layoutTreeService;
                  this.layoutAxisResolver = new LayoutAxisResolver();
                  this.flexWrapLineGrouper = new FlexWrapLineGrouper();
                  this.guideRectProjector = new GuideRectProjector();
                }

                // ✅ Phase 7.x2: Grid レイアウト専用のスロット解決（Cursor 2.2 準拠）
                resolveGridSlot(mouseX, mouseY, gridNode) {
                  if (!gridNode || !gridNode.grid || !gridNode.grid.cellRects) {
                    return null;
                  }

                  // ✅ ViewportTransformService を一度だけ取得（関数内で再利用）
                  const viewportTransform = getViewportTransformService();

                  // ✅ マウス位置を論理座標に変換
                  const logicalMousePos = viewportTransform.renderToLogical({
                    left: mouseX,
                    top: mouseY,
                    width: 0,
                    height: 0,
                  });

                  // 最も近いセルを探す（論理座標で判定）
                  let closestCell = null;
                  let minDistance = Infinity;

                  for (let i = 0; i < gridNode.grid.cellRects.length; i++) {
                    const cell = gridNode.grid.cellRects[i];
                    const cellRect = cell.rect;

                    // セルの中心座標（論理座標）
                    const cx = cellRect.left + cellRect.width / 2;
                    const cy = cellRect.top + cellRect.height / 2;

                    // ユークリッド距離を計算
                    const dist = Math.hypot(logicalMousePos.left - cx, logicalMousePos.top - cy);

                    if (dist < minDistance) {
                      minDistance = dist;
                      closestCell = cell;
                    }
                  }

                  if (!closestCell) {
                    return null;
                  }

                  // ✅ Cursor 2.2 準拠: insertion と guideDirection を設定
                  const insertion = 'inside';
                  const guideAxis = 'x'; // Grid は x/y 両対応だが、デフォルトは x
                  const guideDirection = 'inside'; // ✅ Grid: セル内は inside

                  // ✅ 論理座標（Logical Layout Rect）
                  const logicalRect = closestCell.rect;

                  // ✅ GuideRectProjector を使用して guideRect を生成（論理座標）
                  const slotResult = {
                    targetParentId: gridNode.elementId,
                    index: closestCell.index,
                    insertion: insertion,
                    guideAxis: guideAxis,
                    guideDirection: guideDirection,
                    layoutType: 'grid',
                    targetElementId: gridNode.elementId,
                  };

                  const logicalGuideRect = this.guideRectProjector.project(slotResult, gridNode.rect, logicalRect);

                  // ✅ ViewportTransformService を使用してレンダリング座標に変換（既に取得済み）
                  const renderGuideRect = logicalGuideRect ? viewportTransform.logicalToRender(logicalGuideRect) : null;

                  // ✅ ガイドライン記述子を生成
                  const guide = renderGuideRect ? {
                    type: 'box', // Grid は box
                    rect: renderGuideRect,
                    insertion: insertion,
                    guideAxis: guideAxis,
                    guideDirection: guideDirection,
                    layoutType: 'grid',
                    logicalRect: logicalGuideRect,
                  } : null;

                  // ✅ デバッグ情報
                  console.log('[SlotResolver] ✅ Grid slot resolved (layoutType-aware):', {
                    layoutType: 'grid',
                    insertion: insertion,
                    guideAxis: guideAxis,
                    guideDirection: guideDirection,
                    logicalRect: logicalGuideRect,
                    renderRect: renderGuideRect,
                  });

                  return {
                    targetElementId: gridNode.elementId,
                    targetParentId: gridNode.elementId,
                    targetNode: gridNode,
                    index: closestCell.index, // ✅ Phase 7.x2: セルの index
                    position: 'inside', // ✅ 後方互換性
                    insertion: insertion, // ✅ Cursor 2.2 準拠
                    guideAxis: guideAxis, // ✅ Cursor 2.2 準拠
                    guideDirection: guideDirection, // ✅ guideDirection を追加
                    layoutType: 'grid', // ✅ layoutType を追加
                    guide: guide,
                  };
                }

                // ✅ Cursor 2.2 準拠: ガイドライン記述子を生成（insertion と guideAxis ベース）
                createGuideDescriptor(targetNode, insertion, guideAxis, logicalRect) {
                  if (!targetNode || !logicalRect) {
                    return null;
                  }

                  const viewportTransform = getViewportTransformService();
                  const renderRect = viewportTransform.logicalToRender(logicalRect);

                  const guide = {
                    type: insertion === 'inside' ? 'box' : 'line',
                    rect: renderRect, // ✅ Render Rect（論理座標 + ビューポート変換）
                    insertion: insertion,
                    guideAxis: guideAxis,
                    logicalRect: logicalRect, // ✅ デバッグ用: 論理座標も保持
                  };

                  // ✅ GuideLineRenderer は guideAxis と insertion だけを見る
                  // ここでは論理座標からレンダリング座標への変換のみ行う

                  return guide;
                }

                // ✅ Phase 7.x: マウス位置からスロットを解決（完全版・Cursor 2.2 準拠）
                resolveSlot(mouseX, mouseY, draggedElementId) {
                  // ✅ ViewportTransformService を一度だけ取得（関数内で再利用）
                  const viewportTransform = getViewportTransformService();

                  // ✅ Cursor 2.2 準拠: マウス位置を論理座標に変換
                  const logicalMousePos = viewportTransform.renderToLogical({
                    left: mouseX,
                    top: mouseY,
                    width: 0,
                    height: 0,
                  });

                  const tree = this.layoutTreeService;
                  const allNodes = tree.getAllNodes();

                  // ドラッグ中の要素とその子孫を除外
                  const excludeIds = new Set([draggedElementId]);
                  const addDescendants = (elementId) => {
                    const node = tree.getNode(elementId);
                    if (!node) {
                      return;
                    }
                    for (let i = 0; i < node.children.length; i++) {
                      const childId = node.children[i];
                      excludeIds.add(childId);
                      addDescendants(childId);
                    }
                  };
                  addDescendants(draggedElementId);

                  // マウス位置を含むノードを探す（上から下へ、最も深い要素を優先）
                  let bestMatch = null;
                  let bestDepth = -1;

                  for (const node of allNodes) {
                    if (excludeIds.has(node.elementId)) {
                      continue;
                    }

                    const rect = node.rect; // ✅ 論理座標（Logical Layout Rect）
                    if (logicalMousePos.left >= rect.left && logicalMousePos.left <= rect.right &&
                        logicalMousePos.top >= rect.top && logicalMousePos.top <= rect.bottom) {
                      // 深さを計算（親の数を数える）
                      let depth = 0;
                      let current = node;
                      while (current && current.parentId) {
                        depth++;
                        current = tree.getParent(current.elementId);
                      }

                      // より深い（子要素）を優先
                      if (depth > bestDepth) {
                        bestDepth = depth;
                        bestMatch = node;
                      }
                    }
                  }

                  if (!bestMatch) {
                    return null;
                  }

                  // ✅ Phase 7.x2: Grid レイアウトの場合は専用処理を優先
                  const targetNode = bestMatch;
                  // ✅ 一時的な layoutType（Grid 判定用のみ）
                  const initialLayoutType = targetNode.layoutType || 'absolute';

                  if (initialLayoutType === 'grid' && targetNode.grid && canAcceptChildren(targetNode)) {
                    // ✅ Phase 7.x2: Grid レイアウト専用のスロット解決（論理座標で判定）
                    const gridSlot = this.resolveGridSlot(logicalMousePos.left, logicalMousePos.top, targetNode);
                    if (gridSlot) {
                      return gridSlot;
                    }
                  }

                  // ✅ Phase 7.x: 親ノードを取得（Grid 以外の場合）
                  const parentNode = tree.getParent(bestMatch.elementId);

                  // ✅ Phase 7.x: inside 判定（コンテナ内にカーソルがある場合）
                  const rect = targetNode.rect; // ✅ 論理座標（Logical Layout Rect）
                  const centerX = rect.left + rect.width / 2;
                  const centerY = rect.top + rect.height / 2;
                  const threshold = 20; // 境界判定の閾値

                  // ✅ Phase 7.x: コンテナ内判定（inside 優先・論理座標で判定）
                  const isCursorInside = logicalMousePos.left >= rect.left + threshold &&
                                         logicalMousePos.left <= rect.right - threshold &&
                                         logicalMousePos.top >= rect.top + threshold &&
                                         logicalMousePos.top <= rect.bottom - threshold;

                  // ✅ Cursor 2.2 準拠: LayoutAxisResolver を使用して軸情報を取得
                  const targetDomElement = tree.getDomElement(targetNode.elementId);
                  const computedStyle = targetDomElement ? window.getComputedStyle(targetDomElement) : null;
                  const axisInfo = this.layoutAxisResolver.resolve(targetDomElement, computedStyle, targetNode);

                  // ✅ 重要: layoutType を確実に判定（最終的な layoutType）
                  let layoutType = axisInfo.layoutType || 'absolute';
                  // ✅ layoutType の正規化（flex-row → row, flex-column → column）
                  if (layoutType === 'flex-row') {
                    layoutType = 'row';
                  } else if (layoutType === 'flex-column') {
                    layoutType = 'column';
                  }

                  let insertion = 'inside';
                  let guideAxis = 'y';
                  let guideDirection = 'vertical'; // ✅ guideDirection: 'horizontal' | 'vertical' | 'inside'
                  let targetParentId = null;
                  let targetIndex = 0;
                  let position = 'inside'; // 後方互換性のため
                  let anchorRect = null; // ✅ Guide 描画用のアンカー rect

                  // ✅ Phase 7.x Flex: canAcceptChildren で inside を判定
                  if (isCursorInside && canAcceptChildren(targetNode)) {
                    // inside: コンテナ内にドロップ
                    insertion = 'inside';
                    targetParentId = targetNode.elementId;
                    targetIndex = targetNode.children.length; // 末尾に追加
                    guideAxis = axisInfo.primaryAxis;
                    guideDirection = 'inside'; // ✅ inside の場合は guideDirection = 'inside'
                  } else {
                    // ✅ 兄弟要素として挿入
                    if (parentNode) {
                      targetParentId = parentNode.elementId;
                      const siblingIds = parentNode.children;

                      // ✅ Phase 7.x Flex: wrap 対応
                      if (axisInfo.wrap && siblingIds.length > 0) {
                        // ✅ wrap あり: line grouping を使用
                        const childrenRects = [];
                        for (let i = 0; i < siblingIds.length; i++) {
                          const childNode = tree.getNode(siblingIds[i]);
                          if (childNode && childNode.elementId !== draggedElementId) {
                            childrenRects.push({
                              ...childNode.rect,
                              elementId: childNode.elementId,
                            });
                          }
                        }

                        const lineGroupResult = this.flexWrapLineGrouper.groupIntoLines(
                          childrenRects,
                          axisInfo.primaryAxis,
                          axisInfo.crossAxis
                        );

                        const lineAndInsertion = this.flexWrapLineGrouper.findLineAndInsertion(
                          logicalMousePos,
                          lineGroupResult.lines,
                          axisInfo.primaryAxis,
                          axisInfo.crossAxis,
                          axisInfo.reverse
                        );

                        insertion = lineAndInsertion.insertion;
                        targetIndex = lineAndInsertion.globalInsertionIndex;

                        // ✅ guideDirection を決定（flex-wrap の場合）
                        if (axisInfo.primaryAxis === 'x') {
                          guideDirection = 'vertical'; // row: 縦線
                        } else {
                          guideDirection = 'horizontal'; // column: 横線
                        }

                        // ✅ anchorRect を決定（挿入位置の前後の要素）
                        if (lineAndInsertion.indexInLine > 0 && lineAndInsertion.indexInLine <= lineGroupResult.lines[lineAndInsertion.lineIndex].length) {
                          const line = lineGroupResult.lines[lineAndInsertion.lineIndex];
                          const anchorIndex = lineAndInsertion.indexInLine - 1;
                          if (anchorIndex >= 0 && anchorIndex < line.length) {
                            anchorRect = line[anchorIndex];
                          }
                        }
                      } else {
                        // ✅ wrap なし: 通常の挿入位置判定
                        // ✅ レイアウト軸に応じた挿入位置判定（論理座標で判定）
                        if (axisInfo.primaryAxis === 'y') {
                          // 縦方向: top / bottom
                          insertion = logicalMousePos.top < centerY ? 'top' : 'bottom';
                          guideAxis = 'x'; // ✅ 横線（上下）
                          guideDirection = 'horizontal'; // ✅ column レイアウト: 横線
                        } else if (axisInfo.primaryAxis === 'x') {
                          // 横方向: left / right
                          insertion = logicalMousePos.left < centerX ? 'left' : 'right';
                          guideAxis = 'y'; // ✅ 縦線（左右）
                          guideDirection = 'vertical'; // ✅ row レイアウト: 縦線
                        } else {
                          // デフォルト: top / bottom
                          insertion = logicalMousePos.top < centerY ? 'top' : 'bottom';
                          guideAxis = 'x';
                          guideDirection = 'horizontal';
                        }

                        // ✅ reverse 対応
                        if (axisInfo.reverse) {
                          if (axisInfo.primaryAxis === 'x') {
                            insertion = insertion === 'left' ? 'right' : 'left';
                          } else {
                            insertion = insertion === 'top' ? 'bottom' : 'top';
                          }
                        }

                        // 現在の要素の index を取得
                        let currentIndex = -1;
                        for (let i = 0; i < siblingIds.length; i++) {
                          if (siblingIds[i] === targetNode.elementId) {
                            currentIndex = i;
                            break;
                          }
                        }

                        if (currentIndex >= 0) {
                          targetIndex = (insertion === 'top' || insertion === 'left') ? currentIndex : currentIndex + 1;
                          // ✅ reverse 対応: index 補正
                          if (axisInfo.reverse) {
                            targetIndex = siblingIds.length - targetIndex;
                          }
                          // ✅ anchorRect を設定
                          anchorRect = targetNode.rect;
                        } else {
                          targetIndex = siblingIds.length;
                        }
                      }
                    } else {
                      // ルート要素の場合は inside として扱う
                      insertion = 'inside';
                      targetParentId = targetNode.elementId;
                      targetIndex = targetNode.children.length;
                      guideAxis = axisInfo.primaryAxis;
                      guideDirection = 'inside'; // ✅ inside の場合は guideDirection = 'inside'
                    }
                  }

                  // ✅ 論理座標（Logical Layout Rect）を取得
                  const logicalRect = targetNode.rect;
                  const containerRect = parentNode ? parentNode.rect : targetNode.rect;

                  // ✅ GuideRectProjector を使用して guideRect を生成（論理座標）
                  const slotResult = {
                    targetParentId: targetParentId,
                    index: targetIndex,
                    insertion: insertion,
                    guideAxis: guideAxis,
                    guideDirection: guideDirection, // ✅ guideDirection を追加
                    layoutType: layoutType, // ✅ layoutType を追加
                    targetElementId: targetNode.elementId,
                  };

                  const logicalGuideRect = this.guideRectProjector.project(slotResult, containerRect, anchorRect);

                  // ✅ ViewportTransformService を使用してレンダリング座標に変換（既に取得済み）
                  const renderGuideRect = logicalGuideRect ? viewportTransform.logicalToRender(logicalGuideRect) : null;

                  // ✅ ガイドライン記述子を生成（renderGuideRect を使用）
                  const guide = renderGuideRect ? {
                    type: insertion === 'inside' ? 'box' : 'line',
                    rect: renderGuideRect, // ✅ Render Rect
                    insertion: insertion,
                    guideAxis: guideAxis,
                    guideDirection: guideDirection, // ✅ guideDirection を追加
                    layoutType: layoutType, // ✅ layoutType を追加
                    logicalRect: logicalGuideRect, // ✅ デバッグ用: 論理座標も保持
                  } : null;

                  // ✅ デバッグ情報を出力
                  console.log('[Slot] ✅ Slot resolved (layoutType-aware):', {
                    layoutType: layoutType,
                    primaryAxis: axisInfo.primaryAxis,
                    insertion: insertion,
                    guideAxis: guideAxis,
                    guideDirection: guideDirection, // ✅ guideDirection を追加
                    targetParentId: targetParentId,
                    index: targetIndex,
                    logicalGuideRect: logicalGuideRect,
                    renderGuideRect: renderGuideRect,
                  });

                  return {
                    targetElementId: targetNode.elementId,
                    targetParentId: targetParentId,
                    targetNode: targetNode,
                    index: targetIndex,
                    position: insertion, // ✅ 後方互換性のため position も保持
                    insertion: insertion, // ✅ Cursor 2.2 準拠: insertion
                    guideAxis: guideAxis, // ✅ Cursor 2.2 準拠: guideAxis
                    guideDirection: guideDirection, // ✅ guideDirection を追加
                    layoutType: layoutType, // ✅ layoutType を追加
                    guide: guide, // ✅ GuideDescriptor
                  };
                }
              }

              // ✅ Phase 7: 古い GhostRenderer / SlotPreviewRenderer は削除
              // DragStateStore + DragOverlayRenderer に置き換え（Cursor 2.2 準拠）

              // ============================================
              // Phase 7.1: Drag & Drop（完全版・再構築）
              // ============================================

              // Slot Preview: Figmaライクな細い青線のみ表示（旧実装・互換性のため残す）
              let slotPreviewElement_old = null;

              function showSlotPreview(slot) {
                removeSlotPreview();

                if (!slot || !slot.rect) return;

                try {
                  const { rect, orientation } = slot;

                  // ✅ 重要: Slot rectのみを描画（要素のハイライトは一切しない）
                  // Figmaと同じ挙動: 細い青線のみ
                  slotPreviewElement = document.createElement('div');
                  slotPreviewElement.className = 'slot-preview';
                  slotPreviewElement.setAttribute('data-ignore', 'true');

                  if (orientation === 'vertical') {
                    // 縦方向: スロットの中央に1本の横線
                    const centerY = rect.top + rect.height / 2;
                    slotPreviewElement.style.cssText =
                      'position: fixed;' +
                      'pointer-events: none;' +
                      'z-index: 10000;' +
                      'left: ' + rect.left + 'px;' +
                      'top: ' + (centerY - 1) + 'px;' +
                      'width: ' + rect.width + 'px;' +
                      'height: 2px;' +
                      'background-color: rgba(59, 130, 246, 0.8);' +
                      'box-sizing: border-box;';
                  } else {
                    // 横方向: スロットの中央に1本の縦線
                    const centerX = rect.left + rect.width / 2;
                    slotPreviewElement.style.cssText =
                      'position: fixed;' +
                      'pointer-events: none;' +
                      'z-index: 10000;' +
                      'left: ' + (centerX - 1) + 'px;' +
                      'top: ' + rect.top + 'px;' +
                      'width: 2px;' +
                      'height: ' + rect.height + 'px;' +
                      'background-color: rgba(59, 130, 246, 0.8);' +
                      'box-sizing: border-box;';
                  }

                  document.body.appendChild(slotPreviewElement);
                } catch (error) {
                  console.warn('[SlotPreview] showSlotPreview error:', error);
                }
              }

              function removeSlotPreview() {
                if (slotPreviewElement && slotPreviewElement.parentNode) {
                  try {
                    slotPreviewElement.parentNode.removeChild(slotPreviewElement);
                  } catch (error) {
                    console.warn('[SlotPreview] removeSlotPreview error:', error);
                  }
                  slotPreviewElement = null;
                }
              }

              // VisualDropHint: DOM基準の視覚的ヒント
              function performDOMHitTest(mouseX, mouseY, targetElement, targetNodeId) {
                if (!targetElement || !targetNodeId) {
                  return null;
                }

                const rect = targetElement.getBoundingClientRect();
                const threshold = 20; // 境界判定の閾値

                // 上端判定
                if (mouseY - rect.top < threshold) {
                  return {
                    targetElementId: targetNodeId,
                    position: 'before',
                    index: 0, // 簡易版: 実際のindexは後で計算
                    orientation: 'vertical',
                  };
                }

                // 下端判定
                if (rect.bottom - mouseY < threshold) {
                  return {
                    targetElementId: targetNodeId,
                    position: 'after',
                    index: -1, // 簡易版: 実際のindexは後で計算
                    orientation: 'vertical',
                  };
                }

                // 中央判定（inside）
                return {
                  targetElementId: targetNodeId,
                  position: 'inside',
                  index: 0, // 簡易版: 実際のindexは後で計算
                  orientation: 'vertical',
                };
              }

              // LayoutInteractionController: 要素のレイアウト操作（移動・整列）
              // ✅ Phase 7.5: Cursor 2.2 方式 - Layout Tree ベース
              class LayoutInteractionController {
                constructor(onActionGenerated) {
                  this.isDragging = false;
                  this.dragStartX = 0;
                  this.dragStartY = 0;
                  this.dragElement = null;
                  this.dragElementId = null;
                  this.dragSession = null; // ✅ Phase 7: DragSession（Cursor 2.2 準拠）
                  this.layoutTreeService = getLayoutTreeService();
                  this.slotResolver = new SlotResolver(this.layoutTreeService);
                  // ✅ Phase 7: GhostRenderer / SlotPreviewRenderer は削除
                  // DragStateStore + DragOverlayRenderer に置き換え（Cursor 2.2 準拠）
                  this.onActionGenerated = onActionGenerated;
                  this.setupListeners();
                }

                setupListeners() {
                  // ✅ Cursor 2.2 準拠: レスポンシブ耐性（resize / scroll イベントで再計算）
                  const container = document.getElementById('design-surface-container');
                  if (container) {
                    const viewportTransform = getViewportTransformService();
                    viewportTransform.setContainer(container);

                    // resize イベント
                    window.addEventListener('resize', () => {
                      viewportTransform.update();
                      if (this.isDragging) {
                        this.recalculateDragState();
                      }
                    });

                    // scroll イベント
                    container.addEventListener('scroll', () => {
                      viewportTransform.update();
                      if (this.isDragging) {
                        this.recalculateDragState();
                      }
                    });
                  }

                  // マウスダウン（ドラッグ開始）
                  document.addEventListener('mousedown', (e) => {
                    // ✅ 修正: 選択中の要素自体をクリックしたときにドラッグ開始
                    // selection-outlineはpointer-events: noneなので、選択要素自体をクリックする必要がある
                    let clickedElement = e.target;
                    let selectedElement = null;

                    // クリックされた要素またはその親要素が選択されているか確認
                    while (clickedElement && clickedElement !== document.body) {
                      if (clickedElement.getAttribute && clickedElement.getAttribute('data-selected') === 'true') {
                        selectedElement = clickedElement;
                        break;
                      }
                      clickedElement = clickedElement.parentElement;
                    }

                    if (!selectedElement) {
                      return;
                    }

                    // ✅ 重要: リサイズハンドルをクリックした場合はドラッグではなくリサイズ
                    if (e.target && e.target.classList && e.target.classList.contains('resize-handle')) {
                      return; // DragInteractionControllerが処理する
                    }

                    this.startDrag(selectedElement, e.clientX, e.clientY, e);
                    e.preventDefault();
                    e.stopPropagation();
                  }, true);

                  // マウスムーブ（ドラッグ中）
                  document.addEventListener('mousemove', (e) => {
                    if (this.isDragging && this.dragElement) {
                      this.updateDrag(e.clientX, e.clientY);
                      // ✅ 重要: ドラッグ中は選択要素を視覚的に移動（仮想スタイル）
                      // Preview DOMは変更しない
                      e.preventDefault();
                    }
                  }, true);

                  // マウスアップ（ドラッグ終了）
                  document.addEventListener('mouseup', (e) => {
                    if (this.isDragging) {
                      this.endDrag(e);
                    }
                  }, true);
                }

                // ✅ Cursor 2.2 準拠: レスポンシブ変更時にドラッグ状態を再計算
                recalculateDragState() {
                  if (!this.isDragging || !this.dragSession) {
                    return;
                  }

                  const viewportTransform = getViewportTransformService();
                  viewportTransform.update();

                  // ✅ 論理座標からレンダリング座標に再変換
                  const logicalRect = this.dragSession.logicalRect;
                  if (logicalRect) {
                    const renderRect = viewportTransform.logicalToRender(logicalRect);
                    const dragStateStore = getDragStateStore();
                    const currentState = dragStateStore.getState();

                    // ✅ Ghost の位置を再計算（マウスデルタを保持）
                    const deltaX = currentState.ghostRect ? currentState.ghostRect.left - this.dragSession.startRenderRect.left : 0;
                    const deltaY = currentState.ghostRect ? currentState.ghostRect.top - this.dragSession.startRenderRect.top : 0;

                    dragStateStore.set({
                      ghostRect: {
                        left: renderRect.left + deltaX,
                        top: renderRect.top + deltaY,
                        width: renderRect.width,
                        height: renderRect.height,
                      },
                    });

                    // ✅ Guide も再計算
                    if (currentState.guide && currentState.guide.logicalRect) {
                      const guideRenderRect = viewportTransform.logicalToRender(currentState.guide.logicalRect);
                      dragStateStore.set({
                        guide: {
                          ...currentState.guide,
                          rect: guideRenderRect,
                        },
                      });
                    }
                  }
                }

                // ✅ Phase 7: Drag開始（Cursor 2.2 準拠）
                startDrag(element, startX, startY, event) {
                  // ✅ 重要: data-selected=true の要素のみ許可
                  if (!element || element.getAttribute('data-selected') !== 'true') {
                    return;
                  }

                  this.isDragging = true;
                  this.dragStartX = startX;
                  this.dragStartY = startY;
                  this.dragElement = element;

                  // ✅ カーソルスタイル: ドラッグ中は grabbing カーソル
                  const container = document.getElementById('design-surface-container');
                  if (container) {
                    container.classList.add('dragging');
                  }

                  // ✅ Phase 7: Layout Tree を更新（最新の DOM 状態を反映）
                  this.layoutTreeService.updateTree();

                  // elementIdを取得
                  const stableElementIdService = getStableElementIdService();
                  this.dragElementId = stableElementIdService.getStableElementId(element);

                  // ✅ Phase 7: Layout Tree から source 情報を取得
                  const sourceNode = this.layoutTreeService.getNode(this.dragElementId);
                  if (!sourceNode) {
                    console.warn('[LayoutInteractionController] ⚠️ Source node not found in Layout Tree:', this.dragElementId);
                    this.isDragging = false;
                    return;
                  }

                  const sourceParentId = sourceNode.parentId;
                  const sourceParent = sourceParentId ? this.layoutTreeService.getParent(this.dragElementId) : null;
                  let sourceIndex = 0;
                  if (sourceParent) {
                    // sourceParent.children は elementId の配列
                    for (let i = 0; i < sourceParent.children.length; i++) {
                      if (sourceParent.children[i] === this.dragElementId) {
                        sourceIndex = i;
                        break;
                      }
                    }
                  }

                  // ✅ Cursor 2.2 準拠: 論理座標（Logical Layout Rect）を取得
                  const logicalRect = sourceNode.rect;

                  // ✅ ViewportTransformService を使用してレンダリング座標に変換
                  const viewportTransform = getViewportTransformService();
                  const renderRect = viewportTransform.logicalToRender(logicalRect);

                  // ✅ Phase 7: DragSession を生成（draggedDomElement, startRect を含む）
                  this.dragSession = new DragSession(
                    this.dragElementId,
                    element, // draggedDomElement
                    sourceParentId,
                    sourceIndex
                  );
                  // ✅ 重要: logicalRect を保存（レスポンシブ再計算用）
                  this.dragSession.logicalRect = logicalRect;
                  this.dragSession.startRenderRect = renderRect;

                  // ✅ Phase 7: DragStateStore に状態を更新（Render Rect を使用）
                  const dragStateStore = getDragStateStore();
                  dragStateStore.set({
                    isDragging: true,
                    draggedElementId: this.dragElementId,
                    ghostRect: renderRect, // ✅ Render Rect
                    slotPreviewRect: null,
                    slotPosition: null,
                  });

                  console.log('[LayoutInteractionController] ✅ Drag started (Cursor 2.2):', {
                    draggedElementId: this.dragElementId,
                    tagName: element.tagName,
                    startRect: {
                      left: startRect.left,
                      top: startRect.top,
                      width: startRect.width,
                      height: startRect.height,
                    },
                    sourceParentId: sourceParentId,
                    sourceIndex: sourceIndex,
                  });
                }

                // ✅ Phase 7: DragOver（Cursor 2.2 準拠）
                updateDrag(currentX, currentY) {
                  if (!this.dragElement || !this.dragElementId || !this.dragSession) {
                    return;
                  }

                  // ✅ Cursor 2.2 準拠: ViewportTransformService を一度だけ取得（関数内で再利用）
                  const viewportTransform = getViewportTransformService();
                  viewportTransform.update();

                  // ✅ 重要: Ghost は startRenderRect + mouseDelta で計算（live DOM を再取得しない）
                  const deltaX = currentX - this.dragStartX;
                  const deltaY = currentY - this.dragStartY;
                  const startRenderRect = this.dragSession.startRenderRect;

                  // ✅ Phase 7: Layout Tree を更新（構造判定用のみ、Ghost 表示には使わない）
                  // ✅ 重要: updateTree() は Slot 判定のためだけに使用
                  // Ghost の位置計算には使わない（startRect + mouseDelta のみ）
                  this.layoutTreeService.updateTree();

                  // ✅ Phase 7: SlotResolver に mouse position を渡す（構造判定用）
                  const slot = this.slotResolver.resolveSlot(currentX, currentY, this.dragElementId);

                  // ✅ Phase 7: DragStateStore に状態を更新（DOM を動かさない）
                  const dragStateStore = getDragStateStore();
                  let slotPreviewRect = null;
                  let guide = null;

                  if (slot && slot.targetParentId !== null) {
                    // ✅ Phase 7: DragSession を更新
                    this.dragSession.updateTarget(
                      slot.targetParentId,
                      slot.index,
                      slot.position, // 後方互換性
                      slot.insertion // ✅ Cursor 2.2 準拠
                    );

                    // ✅ Phase 7.x Flex: guide を取得（SlotResolver から生成済み）
                    guide = slot.guide || null;

                    // ✅ Phase 7.x Flex: guide が存在する場合は guide.rect を slotPreviewRect として使用
                    if (guide && guide.rect) {
                      // ✅ ViewportTransformService を使用してレンダリング座標に変換（既に取得済み）
                      const logicalGuideRect = guide.logicalRect || {
                        left: guide.rect.left,
                        top: guide.rect.top,
                        width: guide.rect.width,
                        height: guide.rect.height,
                      };
                      slotPreviewRect = viewportTransform.logicalToRender(logicalGuideRect);
                    } else {
                      // ✅ Phase 7: フォールバック: Slot Preview の rect を計算（live DOM から取得）
                      if (slot.targetNode) {
                        const targetDomElement = this.layoutTreeService.getDomElement(slot.targetNode.elementId);
                        if (targetDomElement) {
                          const rect = targetDomElement.getBoundingClientRect();
                          const position = slot.position || 'inside';
                          const layoutType = slot.targetNode.layoutType || 'absolute';

                          // ✅ Phase 7.x: レイアウトタイプに応じた rect 計算
                          if (layoutType === 'column') {
                            if (position === 'before') {
                              slotPreviewRect = { left: rect.left, top: rect.top - 1, width: rect.width, height: 2 };
                            } else if (position === 'after') {
                              slotPreviewRect = { left: rect.left, top: rect.bottom - 1, width: rect.width, height: 2 };
                            } else {
                              slotPreviewRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
                            }
                          } else if (layoutType === 'row') {
                            // ✅ 修正: row レイアウト: before / after → 横線（上下）
                            if (position === 'before') {
                              slotPreviewRect = { left: rect.left, top: rect.top - 1, width: rect.width, height: 2 };
                            } else if (position === 'after') {
                              slotPreviewRect = { left: rect.left, top: rect.bottom - 1, width: rect.width, height: 2 };
                            } else {
                              slotPreviewRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
                            }
                          } else {
                            // absolute / grid: デフォルト
                            if (position === 'before') {
                              slotPreviewRect = { left: rect.left, top: rect.top - 1, width: rect.width, height: 2 };
                            } else if (position === 'after') {
                              slotPreviewRect = { left: rect.left, top: rect.bottom - 1, width: rect.width, height: 2 };
                            } else {
                              slotPreviewRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
                            }
                          }
                        }
                      }
                    }

                    console.log('[LayoutInteractionController] ✅ Slot resolved (layoutType-aware):', {
                      targetParentId: slot.targetParentId,
                      index: slot.index,
                      position: slot.position,
                      insertion: slot.insertion,
                      layoutType: slot.layoutType || (slot.targetNode ? slot.targetNode.layoutType : 'unknown'),
                      guideDirection: slot.guideDirection || (guide ? guide.guideDirection : 'unknown'),
                      hasGuide: !!guide,
                    });
                  } else {
                    // ターゲットが見つからない場合はクリア
                    this.dragSession.clearTarget();
                  }

                  // ✅ Cursor 2.2 準拠: Ghost の Render Rect を計算（startRenderRect + mouseDelta）
                  const ghostRenderRect = {
                    left: startRenderRect.left + deltaX,
                    top: startRenderRect.top + deltaY,
                    width: startRenderRect.width,
                    height: startRenderRect.height,
                  };

                  // ✅ Phase 7.x: DragStateStore に状態を更新（Ghost + Slot Preview + Guide）
                  dragStateStore.set({
                    ghostRect: ghostRenderRect, // ✅ Render Rect
                    slotPreviewRect: slotPreviewRect,
                    slotPosition: slot ? slot.insertion || slot.position : null,
                    guide: guide, // ✅ Phase 7.x: GuideDescriptor
                  });

                  // ✅ 計測ログ: Drag更新
                  console.log('[LayoutInteractionController] ✅ Drag updated:', {
                    hasGhostRect: true,
                    hasSlotPreviewRect: !!slotPreviewRect,
                    ghostRect: {
                      left: startRect.left + deltaX,
                      top: startRect.top + deltaY,
                      width: startRect.width,
                      height: startRect.height,
                    },
                    slotPreviewRect: slotPreviewRect,
                  });
                }

                // ✅ Phase 7: Drop（Cursor 2.2 準拠）
                endDrag(event) {
                  if (!this.dragElement || !this.dragElementId || !this.dragSession) {
                    this.isDragging = false;
                    // ✅ DragStateStore をリセット
                    const dragStateStore = getDragStateStore();
                    dragStateStore.reset();
                    // ✅ カーソルスタイル: ドラッグ終了時に grabbing クラスを削除
                    const container = document.getElementById('design-surface-container');
                    if (container) {
                      container.classList.remove('dragging');
                    }
                    return;
                  }

                  // ✅ Phase 7: DragStateStore をリセット（Ghost / Slot Preview を破棄）
                  const dragStateStore = getDragStateStore();
                  dragStateStore.reset();

                  // ✅ Phase 7: DOM は一切変更しない
                  // DragSession から Tree Mutation Plan を生成
                  const hasValidTarget = this.dragSession.hasValidTarget();

                  // ✅ 計測ログ: Drop
                  console.log('[LayoutInteractionController] ✅ Drop:', {
                    hasValidTarget: hasValidTarget,
                    draggedElementId: this.dragSession.draggedElementId,
                    sourceParentId: this.dragSession.sourceParentId,
                    sourceIndex: this.dragSession.sourceIndex,
                    currentTargetParentId: this.dragSession.currentTargetParentId,
                    currentTargetIndex: this.dragSession.currentTargetIndex,
                  });

                  if (hasValidTarget) {
                    // ✅ Phase 7.x: 同一親移動時の index 補正（超重要）
                    let finalToIndex = this.dragSession.currentTargetIndex;
                    const fromParentId = this.dragSession.sourceParentId;
                    const fromIndex = this.dragSession.sourceIndex;
                    const toParentId = this.dragSession.currentTargetParentId;
                    const toIndex = this.dragSession.currentTargetIndex;

                    // ✅ Phase 7.x: 同一親内で前方から後方へ移動する場合、index を -1 する
                    if (fromParentId === toParentId && fromIndex < toIndex) {
                      finalToIndex = toIndex - 1;
                      console.log('[LayoutInteractionController] ✅ Index corrected (same parent, forward move):', {
                        fromIndex: fromIndex,
                        originalToIndex: toIndex,
                        correctedToIndex: finalToIndex,
                      });
                    }

                    // ✅ Phase 7: UIActionAST(type: MOVE_ELEMENT) を生成（target は含めない）
                    const actionAST = {
                      operationId: 'op-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      elementId: this.dragSession.draggedElementId,
                      type: UIActionType.MOVE_ELEMENT,
                      timestamp: Date.now(),
                      fromParentId: fromParentId,
                      fromIndex: fromIndex,
                      toParentId: toParentId,
                      toIndex: finalToIndex, // ✅ Phase 7.x: 補正後の index
                      // ✅ 重要: target は含めない（MOVE_ELEMENT には不要）
                      // ✅ 重要: position は含めない（index に解決済み）
                    };

                    // ✅ 計測ログ: ActionAST の中身
                    console.log('[LayoutInteractionController] ✅ ActionAST generated:', {
                      type: actionAST.type,
                      elementId: actionAST.elementId,
                      fromParentId: actionAST.fromParentId,
                      fromIndex: actionAST.fromIndex,
                      toParentId: actionAST.toParentId,
                      toIndex: actionAST.toIndex,
                    });

                    // UIActionStoreに追加（記録用）
                    const store = getUIActionStore();
                    store.add(actionAST);

                    // ✅ 重要: PreviewApplyLayer に即時反映（UIActionStore とは別ルート）
                    if (this.onActionGenerated) {
                      console.log('[LayoutInteractionController] ✅ Calling onActionGenerated callback');
                      this.onActionGenerated(actionAST);
                    } else {
                      console.warn('[LayoutInteractionController] ⚠️ onActionGenerated callback not set');
                    }

                    console.log('[LayoutInteractionController] ✅ Drop completed, MOVE_ELEMENT action generated (Cursor 2.2):', {
                      elementId: this.dragSession.draggedElementId,
                      fromParentId: this.dragSession.sourceParentId,
                      fromIndex: this.dragSession.sourceIndex,
                      toParentId: this.dragSession.currentTargetParentId,
                      toIndex: this.dragSession.currentTargetIndex,
                    });
                  } else {
                    console.log('[LayoutInteractionController] ⚠️ Drop cancelled: No valid target');
                  }

                  // クリーンアップ
                  this.isDragging = false;
                  this.dragElement = null;
                  this.dragElementId = null;
                  this.dragSession = null;

                  // ✅ カーソルスタイル: ドラッグ終了時に grabbing クラスを削除
                  const container = document.getElementById('design-surface-container');
                  if (container) {
                    container.classList.remove('dragging');
                  }
                }
              }

              // ============================================
              // Phase 7.2: プロパティ編集（右サイドバー）
              // ============================================

              // PropertyPanel: 右サイドバーでプロパティを編集
              // ✅ Phase 7.2: VSCode拡張ではWebview内に表示
              function PropertyPanel({ selectedElement, selectedElementId, onPropertyChange }) {
                const [editingProperty, setEditingProperty] = React.useState(null);
                const [propertyValues, setPropertyValues] = React.useState({});
                const [styleValues, setStyleValues] = React.useState({});
                const [textContent, setTextContent] = React.useState('');
                const [isEditingText, setIsEditingText] = React.useState(false);

                // 選択要素が変更されたら値を更新
                React.useEffect(() => {
                  if (!selectedElement) {
                    setPropertyValues({});
                    setStyleValues({});
                    setTextContent('');
                    return;
                  }

                  // 属性値を取得
                  const attrs = {};
                  if (selectedElement.attributes) {
                    for (let i = 0; i < selectedElement.attributes.length; i++) {
                      const attr = selectedElement.attributes[i];
                      if (!attr.name.startsWith('data-') && attr.name !== 'style') {
                        attrs[attr.name] = attr.value;
                      }
                    }
                  }
                  setPropertyValues(attrs);

                  // スタイル値を取得（computedStyleから）
                  const computedStyle = window.getComputedStyle(selectedElement);
                  const styles = {
                    width: computedStyle.width,
                    height: computedStyle.height,
                    display: computedStyle.display,
                    position: computedStyle.position,
                    color: computedStyle.color,
                    backgroundColor: computedStyle.backgroundColor,
                    fontSize: computedStyle.fontSize,
                    fontWeight: computedStyle.fontWeight,
                    lineHeight: computedStyle.lineHeight,
                  };
                  setStyleValues(styles);

                  // テキストコンテンツ
                  setTextContent(selectedElement.textContent || '');
                }, [selectedElement]);

                if (!selectedElement || !selectedElementId) {
                  return React.createElement('div', {
                    style: {
                      position: 'fixed',
                      right: '0',
                      top: '0',
                      width: '320px',
                      height: '100%',
                      background: 'rgba(255, 255, 255, 0.95)',
                      borderLeft: '1px solid #ddd',
                      padding: '16px',
                      overflow: 'auto',
                      zIndex: 10000,
                      pointerEvents: 'auto',
                    }
                  }, React.createElement('div', {
                    style: {
                      color: '#888',
                      fontSize: '12px',
                    }
                  }, '要素を選択してください'));
                }

                const handlePropertySave = (property, value) => {
                  if (!selectedElementId || !onPropertyChange) {
                    return;
                  }

                  // ✅ Phase 7.2.2: SET_PROPERTY UI操作ASTを生成
                  const actionAST = {
                    operationId: 'op-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    elementId: selectedElementId,
                    type: UIActionType.SET_PROPERTY,
                    timestamp: Date.now(),
                    property: property,
                    value: value,
                  };

                  // UIActionStoreに追加
                  const store = getUIActionStore();
                  store.add(actionAST);

                  if (onPropertyChange) {
                    onPropertyChange(actionAST);
                  }

                  setEditingProperty(null);
                };

                const handleStyleChange = (property, value) => {
                  const newStyles = { ...styleValues, [property]: value };
                  setStyleValues(newStyles);

                  // ✅ Phase 7.2.2: SET_PROPERTY UI操作ASTを生成（style属性）
                  if (selectedElementId && onPropertyChange) {
                    const stylePairs = [];
                    for (const k in newStyles) {
                      if (newStyles.hasOwnProperty(k) && newStyles[k]) {
                        stylePairs.push(k + ': ' + newStyles[k]);
                      }
                    }
                    const styleString = stylePairs.join('; ');

                    const actionAST = {
                      operationId: 'op-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      elementId: selectedElementId,
                      type: UIActionType.SET_PROPERTY,
                      timestamp: Date.now(),
                      property: 'style',
                      value: styleString,
                    };

                    const store = getUIActionStore();
                    store.add(actionAST);

                    if (onPropertyChange) {
                      onPropertyChange(actionAST);
                    }
                  }
                };

                const handleTextSave = () => {
                  if (!selectedElementId || !onPropertyChange) {
                    return;
                  }

                  // ✅ Phase 7.2.2: SET_PROPERTY UI操作ASTを生成（textContent）
                  const actionAST = {
                    operationId: 'op-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    elementId: selectedElementId,
                    type: UIActionType.SET_PROPERTY,
                    timestamp: Date.now(),
                    property: 'textContent',
                    value: textContent,
                  };

                  const store = getUIActionStore();
                  store.add(actionAST);

                  if (onPropertyChange) {
                    onPropertyChange(actionAST);
                  }

                  setIsEditingText(false);
                };

                return React.createElement('div', {
                  style: {
                    position: 'fixed',
                    right: '0',
                    top: '0',
                    width: '320px',
                    height: '100%',
                    background: 'rgba(255, 255, 255, 0.95)',
                    borderLeft: '1px solid #ddd',
                    padding: '16px',
                    overflow: 'auto',
                    zIndex: 10000,
                    pointerEvents: 'auto',
                    fontSize: '12px',
                  }
                }, [
                  // ヘッダー
                  React.createElement('div', {
                    key: 'header',
                    style: {
                      marginBottom: '16px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid #ddd',
                    }
                  }, [
                    React.createElement('div', {
                      key: 'title',
                      style: {
                        fontWeight: 'bold',
                        fontSize: '14px',
                        marginBottom: '4px',
                      }
                    }, 'プロパティ'),
                    React.createElement('div', {
                      key: 'tag',
                      style: {
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#666',
                      }
                    }, selectedElement.tagName.toLowerCase()),
                  ]),

                  // テキストコンテンツ
                  React.createElement('div', {
                    key: 'text',
                    style: {
                      marginBottom: '16px',
                    }
                  }, [
                    React.createElement('label', {
                      key: 'label',
                      style: {
                        display: 'block',
                        marginBottom: '4px',
                        fontSize: '11px',
                        fontWeight: '500',
                      }
                    }, 'テキスト'),
                    isEditingText
                      ? React.createElement('div', {
                          key: 'edit',
                        }, [
                          React.createElement('textarea', {
                            key: 'textarea',
                            value: textContent,
                            onChange: (e) => setTextContent(e.target.value),
                            style: {
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontFamily: 'inherit',
                            },
                            rows: 2,
                          }),
                          React.createElement('div', {
                            key: 'buttons',
                            style: {
                              display: 'flex',
                              gap: '4px',
                              marginTop: '4px',
                            }
                          }, [
                            React.createElement('button', {
                              key: 'save',
                              onClick: handleTextSave,
                              style: {
                                padding: '4px 8px',
                                background: '#3b82f6',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                              }
                            }, '保存'),
                            React.createElement('button', {
                              key: 'cancel',
                              onClick: () => {
                                setTextContent(selectedElement.textContent || '');
                                setIsEditingText(false);
                              },
                              style: {
                                padding: '4px 8px',
                                background: '#666',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                              }
                            }, 'キャンセル'),
                          ]),
                        ])
                      : React.createElement('div', {
                          key: 'display',
                          onClick: () => setIsEditingText(true),
                          style: {
                            padding: '4px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            minHeight: '20px',
                          }
                        }, textContent || React.createElement('span', {
                          style: { color: '#999' }
                        }, '(空)')),
                  ]),

                  // 属性
                  React.createElement('div', {
                    key: 'attributes',
                    style: {
                      marginBottom: '16px',
                    }
                  }, [
                    React.createElement('div', {
                      key: 'title',
                      style: {
                        fontWeight: '500',
                        marginBottom: '8px',
                        fontSize: '11px',
                      }
                    }, '属性'),
                    (function() {
                      const entries = [];
                      for (const key in propertyValues) {
                        if (propertyValues.hasOwnProperty(key)) {
                          entries.push([key, propertyValues[key]]);
                        }
                      }
                      return entries;
                    })().map(function(entry) {
                      const key = entry[0];
                      const value = entry[1];
                      const isEditing = editingProperty === key;
                      return React.createElement('div', {
                        key: key,
                        style: {
                          marginBottom: '8px',
                        }
                      }, [
                        React.createElement('label', {
                          key: 'label',
                          style: {
                            display: 'block',
                            marginBottom: '2px',
                            fontSize: '10px',
                            color: '#666',
                          }
                        }, key),
                        isEditing
                          ? React.createElement('div', {
                              key: 'edit',
                              style: {
                                display: 'flex',
                                gap: '4px',
                              }
                            }, [
                              React.createElement('input', {
                                key: 'input',
                                type: 'text',
                                value: value,
                                onChange: (e) => {
                                  setPropertyValues(prev => ({
                                    ...prev,
                                    [key]: e.target.value
                                  }));
                                },
                                onKeyDown: (e) => {
                                  if (e.key === 'Enter') {
                                    handlePropertySave(key, propertyValues[key]);
                                  } else if (e.key === 'Escape') {
                                    setEditingProperty(null);
                                  }
                                },
                                style: {
                                  flex: 1,
                                  padding: '4px',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                },
                                autoFocus: true,
                              }),
                              React.createElement('button', {
                                key: 'save',
                                onClick: () => handlePropertySave(key, propertyValues[key]),
                                style: {
                                  padding: '4px 8px',
                                  background: '#3b82f6',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                }
                              }, '✓'),
                            ])
                          : React.createElement('div', {
                              key: 'display',
                              onClick: () => setEditingProperty(key),
                              style: {
                                padding: '4px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                              }
                            }, value || React.createElement('span', {
                              style: { color: '#999' }
                            }, '(空)')),
                      ]);
                    }),
                  ]),

                  // スタイル（読み取り専用・簡易表示）
                  React.createElement('div', {
                    key: 'styles',
                    style: {
                      marginBottom: '16px',
                    }
                  }, [
                    React.createElement('div', {
                      key: 'title',
                      style: {
                        fontWeight: '500',
                        marginBottom: '8px',
                        fontSize: '11px',
                      }
                    }, 'スタイル（読み取り専用）'),
                    ['width', 'height', 'display', 'position'].map(prop => {
                      return React.createElement('div', {
                        key: prop,
                        style: {
                          marginBottom: '4px',
                        }
                      }, [
                        React.createElement('label', {
                          key: 'label',
                          style: {
                            display: 'block',
                            marginBottom: '2px',
                            fontSize: '10px',
                            color: '#666',
                          }
                        }, prop),
                        React.createElement('input', {
                          key: 'input',
                          type: 'text',
                          value: styleValues[prop] || '',
                          onChange: (e) => handleStyleChange(prop, e.target.value),
                          placeholder: 'auto',
                          style: {
                            width: '100%',
                            padding: '4px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }
                        }),
                      ]);
                    }),
                  ]),
                ]);
              }

              // ============================================
              // Phase 7.3: レイアウト操作（抽象化）
              // ============================================

              // LayoutController: Flex / Grid を「意図」で操作
              class LayoutController {
                constructor(onActionGenerated) {
                  this.onActionGenerated = onActionGenerated;
                }

                // レイアウト設定をUI操作ASTとして生成
                setLayout(elementId, layout) {
                  if (!elementId || !layout) {
                    return;
                  }

                  // ✅ Phase 7.3: SET_LAYOUT UI操作ASTを生成
                  const actionAST = {
                    operationId: 'op-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    elementId: elementId,
                    type: UIActionType.SET_LAYOUT,
                    timestamp: Date.now(),
                    layout: layout, // { display, direction, align, gap, ... }
                  };

                  // UIActionStoreに追加
                  const store = getUIActionStore();
                  store.add(actionAST);

                  if (this.onActionGenerated) {
                    this.onActionGenerated(actionAST);
                  }

                  console.log('[LayoutController] ✅ SET_LAYOUT action generated (Phase 7.3):', {
                    elementId: elementId,
                    layout: layout,
                  });
                }
              }

              // グローバルLayoutControllerインスタンス（シングルトン）
              let globalLayoutController = null;
              function getLayoutController() {
                if (!globalLayoutController) {
                  globalLayoutController = new LayoutController((actionAST) => {
                    // UI操作ASTが生成されたら仮想スタイルを更新
                    if (actionAST && actionAST.elementId) {
                      const store = getUIActionStore();
                      const allActions = store.getAll();
                      const resolver = getVirtualStyleResolver();
                      const virtualStyle = resolver.resolveVirtualStyle(actionAST.elementId, allActions);
                      // VirtualStyleResolverはDesignSurface内で更新される
                    }
                  });
                  console.log('[LayoutController] ✅ Created global controller');
                }
                return globalLayoutController;
              }

              // DragInteractionController: 要素のドラッグ・リサイズ操作
              class DragInteractionController {
                constructor(onActionGenerated) {
                  this.isResizing = false;
                  this.resizeHandle = null;
                  this.resizeElement = null;
                  this.resizeElementId = null;
                  this.resizeStartX = 0;
                  this.resizeStartY = 0;
                  this.resizeStartWidth = 0;
                  this.resizeStartHeight = 0;
                  this.onActionGenerated = onActionGenerated;
                }

                // リサイズハンドルを表示（Overlay上のみ）
                createResizeHandles(element, elementId) {
                  if (!element || !elementId) {
                    return [];
                  }

                  const handles = [];
                  const handlePositions = [
                    { position: 'nw', cursor: 'nw-resize' },
                    { position: 'ne', cursor: 'ne-resize' },
                    { position: 'sw', cursor: 'sw-resize' },
                    { position: 'se', cursor: 'se-resize' },
                  ];

                  const elementRect = element.getBoundingClientRect();

                  for (const handlePos of handlePositions) {
                    let left = 0;
                    let top = 0;

                    if (handlePos.position === 'nw' || handlePos.position === 'ne') {
                      top = -4;
                    } else {
                      top = elementRect.height - 4;
                    }

                    if (handlePos.position === 'nw' || handlePos.position === 'sw') {
                      left = -4;
                    } else {
                      left = elementRect.width - 4;
                    }

                    handles.push(React.createElement('div', {
                      key: 'resize-handle-' + handlePos.position,
                      className: 'resize-handle',
                      'data-handle': handlePos.position,
                      'data-element-id': elementId,
                      style: {
                        position: 'absolute',
                        left: left + 'px',
                        top: top + 'px',
                        width: '8px',
                        height: '8px',
                        background: '#3b82f6',
                        border: '1px solid #fff',
                        borderRadius: '2px',
                        cursor: handlePos.cursor,
                        pointerEvents: 'auto',
                        zIndex: 1001,
                      },
                      onMouseDown: (e) => {
                        e.stopPropagation();
                        this.startResize(element, elementId, handlePos.position, e.clientX, e.clientY);
                      },
                    }));
                  }

                  return handles;
                }

                startResize(element, elementId, handlePosition, startX, startY) {
                  this.isResizing = true;
                  this.resizeHandle = handlePosition;
                  this.resizeElement = element;
                  this.resizeElementId = elementId;
                  this.resizeStartX = startX;
                  this.resizeStartY = startY;

                  const rect = element.getBoundingClientRect();
                  this.resizeStartWidth = rect.width;
                  this.resizeStartHeight = rect.height;

                  console.log('[DragInteractionController] ✅ Resize started:', {
                    elementId: elementId,
                    handle: handlePosition,
                  });

                  // マウスムーブ・マウスアップのリスナーを追加
                  this.handleResizeMove = (e) => {
                    if (!this.isResizing || !this.resizeElement) {
                      return;
                    }

                    const deltaX = e.clientX - this.resizeStartX;
                    const deltaY = e.clientY - this.resizeStartY;

                    let newWidth = this.resizeStartWidth;
                    let newHeight = this.resizeStartHeight;

                    // ハンドル位置に応じてサイズを計算
                    if (this.resizeHandle === 'se' || this.resizeHandle === 'ne') {
                      newWidth = Math.max(20, this.resizeStartWidth + deltaX);
                    }
                    if (this.resizeHandle === 'sw' || this.resizeHandle === 'se') {
                      newHeight = Math.max(20, this.resizeStartHeight + deltaY);
                    }

                    // 仮想リサイズを可視化（Overlay上のみ）
                    const overlay = document.querySelector('.selection-outline');
                    if (overlay) {
                      overlay.style.width = newWidth + 'px';
                      overlay.style.height = newHeight + 'px';
                    }
                  };

                  this.handleResizeEnd = (e) => {
                    if (!this.isResizing || !this.resizeElement || !this.resizeElementId) {
                      this.isResizing = false;
                      return;
                    }

                    const overlay = document.querySelector('.selection-outline');
                    if (overlay) {
                      const newWidth = parseFloat(overlay.style.width);
                      const newHeight = parseFloat(overlay.style.height);

                      // RESIZE_UI_ACTION を生成
                      const actionAST = {
                        operationId: 'op-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                        elementId: this.resizeElementId,
                        type: UIActionType.RESIZE,
                        timestamp: Date.now(),
                        width: newWidth,
                        height: newHeight,
                      };

                      // UIActionStoreに追加
                      const store = getUIActionStore();
                      store.add(actionAST);

                      if (this.onActionGenerated) {
                        this.onActionGenerated(actionAST);
                      }

                      console.log('[DragInteractionController] ✅ Resize ended, RESIZE action generated:', {
                        elementId: this.resizeElementId,
                        width: newWidth,
                        height: newHeight,
                      });
                    }

                    // クリーンアップ
                    document.removeEventListener('mousemove', this.handleResizeMove);
                    document.removeEventListener('mouseup', this.handleResizeEnd);

                    this.isResizing = false;
                    this.resizeElement = null;
                    this.resizeElementId = null;
                  };

                  document.addEventListener('mousemove', this.handleResizeMove);
                  document.addEventListener('mouseup', this.handleResizeEnd);
                }
              }

              ${designSurfaceJs}


              // DesignSurface: Preview + UI操作レイヤー
              // ✅ Phase 2.5: PreviewSource を切り替え可能に
              function DesignSurface() {
                const [selectedElement, setSelectedElement] = React.useState(null);
                const [selectedElementId, setSelectedElementId] = React.useState(null); // ✅ Phase 7
                const [virtualStyle, setVirtualStyle] = React.useState(null); // ✅ Phase 7: 仮想スタイル
                const [forceUpdate, setForceUpdate] = React.useState(0); // Phase 6: 強制再レンダリング用
                const containerRef = React.useRef(null);
                const overlayContainerRef = React.useRef(null);
                const selectionControllerRef = React.useRef(null);
                const layoutInteractionControllerRef = React.useRef(null); // ✅ Phase 7
                const dragInteractionControllerRef = React.useRef(null); // ✅ Phase 7
                const previewSourceRef = React.useRef(null);
                const domObserverBridgeRef = React.useRef(null);

                React.useEffect(() => {
                  const container = containerRef.current;
                  const overlayContainer = overlayContainerRef.current;

                  if (!container || !overlayContainer) {
                    return;
                  }

                  // ✅ Cursor 2.2 準拠: ViewportTransformService を初期化
                  const viewportTransform = getViewportTransformService();
                  viewportTransform.setContainer(container);
                  console.log('[DesignSurface] ✅ ViewportTransformService initialized');

                  // ✅ Phase 2.5: PreviewSource を初期化
                  try {
                    console.log('[DesignSurface] Initializing PreviewSource...');

                    // デフォルトは PlaceholderPreviewSource
                    // 将来、ExternalPreviewAdapter に切り替え可能
                    const previewSource = new PlaceholderPreviewSource();
                    previewSource.mount(container);
                    previewSourceRef.current = previewSource;

                    console.log('[DesignSurface] ✅ PreviewSource initialized');
                  } catch (error) {
                    // PreviewSourceのエラーはUI操作レイヤーを壊さない
                    console.error('[DesignSurface] ❌ PreviewSource failed (UI operation layer continues):', error);
                  }

                  // ✅ 重要: UI操作レイヤーをtry/catchで隔離
                  try {
                    console.log('[DesignSurface] Initializing UI operation layer...');

                    // SelectionControllerを初期化
                    const selectionController = new SelectionController((element) => {
                      setSelectedElement(element);

                      // ✅ Phase 7: elementIdを取得して保存
                      if (element) {
                        const stableElementIdService = getStableElementIdService();
                        const elementId = stableElementIdService.getStableElementId(element);
                        setSelectedElementId(elementId);

                        // 選択中の要素にマーク（ドラッグ用）
                        // Preview DOMは変更しない（data属性も付けない）
                        // 代わりに、SelectionControllerが管理する
                        element.setAttribute('data-selected', 'true');
                      } else {
                        setSelectedElementId(null);
                        // 選択解除
                        const prevSelected = document.querySelector('[data-selected="true"]');
                        if (prevSelected) {
                          prevSelected.removeAttribute('data-selected');
                        }
                      }
                    });
                    selectionControllerRef.current = selectionController;

                    // ✅ Phase 7.5: LayoutTreeService を初期化（DOM Snapshot から Tree を構築）
                    const layoutTreeService = getLayoutTreeService();
                    layoutTreeService.buildFromDOM(container);
                    console.log('[DesignSurface] ✅ LayoutTreeService initialized (Phase 7.5)');

                    // ✅ Phase 7: PreviewApplyLayer を初期化
                    const applyLayer = getPreviewApplyLayer();

                    // ✅ Phase 7: LayoutInteractionControllerを初期化
                    // ✅ 重要: onActionGenerated で PreviewApplyLayer に即時反映
                    const layoutController = new LayoutInteractionController((actionAST) => {
                      // ✅ Phase 7: MOVE_ELEMENT を即時反映（Cursor 2.2 準拠）
                      if (actionAST && actionAST.type === UIActionType.MOVE_ELEMENT) {
                        applyLayer.apply(actionAST);
                      }

                      // UI操作ASTが生成されたら仮想スタイルを更新（既存ロジック）
                      if (actionAST && actionAST.elementId) {
                        const store = getUIActionStore();
                        const allActions = store.getAll();
                        const resolver = getVirtualStyleResolver();
                        const virtualStyle = resolver.resolveVirtualStyle(actionAST.elementId, allActions);
                        if (virtualStyle) {
                          setVirtualStyle(virtualStyle);
                        }
                      }
                    });
                    layoutInteractionControllerRef.current = layoutController;

                    // ✅ Phase 7: DragInteractionControllerを初期化
                    const dragController = new DragInteractionController((actionAST) => {
                      // UI操作ASTが生成されたら仮想スタイルを更新
                      if (actionAST && actionAST.elementId) {
                        const store = getUIActionStore();
                        const allActions = store.getAll();
                        const resolver = getVirtualStyleResolver();
                        const virtualStyle = resolver.resolveVirtualStyle(actionAST.elementId, allActions);
                        if (virtualStyle) {
                          setVirtualStyle(virtualStyle);
                        }
                      }
                    });
                    dragInteractionControllerRef.current = dragController;

                    // グローバルに公開（ElementOverlayからアクセスするため）
                    window.__dragInteractionController = dragController;

                    console.log('[DesignSurface] ✅ UI operation layer initialized');
                  } catch (error) {
                    // UI操作レイヤーのエラーはPreviewを壊さない
                    console.error('[DesignSurface] ❌ UI operation layer failed (Preview continues):', error);
                  }

                  // ✅ Phase 2.5-b: DOM観測ブリッジを初期化（Phase 3向け準備・安定化）
                  try {
                    console.log('[DesignSurface] Initializing DOM observer bridge...');

                    // Phase 2.5-b: container を渡す（何もしない実装）
                    const domObserverBridge = new DOMObserverBridge(container);
                    if (container) {
                      domObserverBridge.startObserving(container);
                    }
                    domObserverBridgeRef.current = domObserverBridge;

                    console.log('[DesignSurface] ✅ DOM observer bridge initialized (Phase 2.5-b: no-op)');
                  } catch (error) {
                    // DOM観測ブリッジのエラーはPreview/UI操作を壊さない
                    console.error('[DesignSurface] ❌ DOM observer bridge failed (Preview/UI operation continues):', error);
                  }

                  // ✅ Phase 3: UI操作ASTストアを初期化
                  try {
                    console.log('[DesignSurface] Initializing UI action store...');

                    const store = getUIActionStore();
                    const planStore = getChangePlanStore();
                    console.log('[DesignSurface] ✅ UI action store initialized (Phase 3)');

                    // ✅ Phase 5 + Phase 6: デバッグ用にグローバル関数を公開（DesignSurface初期化完了後）
                    try {
                      window.getUIActionStore = function() { return store; };
                      window.getChangePlanStore = function() { return planStore; };
                      window.getHistoryStore = function() { return getHistoryStore(); };
                      window.getApplyService = function() { return getApplyService(); };
                      window.getStableElementIdService = function() { return getStableElementIdService(); }; // ✅ Phase 6.5
                      window.getVirtualStyleResolver = function() { return getVirtualStyleResolver(); }; // ✅ Phase 7
                      window.formatChangePlanAsDiff = formatChangePlanAsDiff;
                      window.__selectedChangePlanId = null; // Phase 6: 選択中のChangePlan ID

                      // Phase 6: ChangePlanApplyPanel を開く関数を公開
                      window.openChangePlanApplyPanel = function(planId) {
                        window.__selectedChangePlanId = planId;
                        const event = new Event('change-plan-panel-open');
                        window.dispatchEvent(event);
                      };

                      // Phase 6: ChangePlanApplyPanel を閉じる関数を公開
                      window.closeChangePlanApplyPanel = function() {
                        window.__selectedChangePlanId = null;
                        const event = new Event('change-plan-panel-close');
                        window.dispatchEvent(event);
                      };

                      console.log('[DesignSurface] ✅ Debug functions exposed to window object');
                    } catch (exposeError) {
                      console.error('[DesignSurface] ❌ Failed to expose debug functions:', exposeError);
                    }

                    // デバッグ: ストアの状態を定期的に表示（開発用）
                    // 本番UIでは使わない前提
                    if (window.__debugUIActions) {
                      setInterval(() => {
                        const actions = store.getAll();
                        if (actions.length > 0) {
                          console.log('[UIActionStore] 📊 Current actions:', {
                            total: actions.length,
                            recent: store.getRecent(5).map(a => ({
                              type: a.type,
                              target: a.target ? a.target.tagName : (a.elementId || 'unknown'),
                              timestamp: new Date(a.timestamp).toISOString(),
                            })),
                          });
                        }
                      }, 5000); // 5秒ごと
                    }
                  } catch (error) {
                    // UI操作ASTストアのエラーはPreview/UI操作を壊さない
                    console.error('[DesignSurface] ❌ UI action store failed (Preview/UI operation continues):', error);
                  }

                  // クリーンアップ
                  return () => {
                    // PreviewSourceをアンマウント
                    if (previewSourceRef.current) {
                      try {
                        previewSourceRef.current.unmount();
                      } catch (error) {
                        console.error('[DesignSurface] Failed to unmount PreviewSource:', error);
                      }
                      previewSourceRef.current = null;
                    }

                    // SelectionControllerをクリーンアップ
                    if (selectionControllerRef.current) {
                      selectionControllerRef.current.clearSelection();
                      selectionControllerRef.current = null;
                    }

                    // DOM観測ブリッジをクリーンアップ
                    if (domObserverBridgeRef.current) {
                      domObserverBridgeRef.current.stopObserving();
                      domObserverBridgeRef.current = null;
                    }
                  };
                }, []);

                // ✅ Cursor 2.2 準拠: スクロール・レスポンシブ時の更新は ElementOverlay 内で requestAnimationFrame で処理
                // この useEffect は削除（ElementOverlay 内で常時同期するため不要）

                // ✅ Phase 6: ChangePlanApplyPanel の開閉イベントを監視
                React.useEffect(() => {
                  const handlePanelOpen = () => {
                    setForceUpdate(prev => prev + 1);
                  };
                  const handlePanelClose = () => {
                    setForceUpdate(prev => prev + 1);
                  };

                  window.addEventListener('change-plan-panel-open', handlePanelOpen);
                  window.addEventListener('change-plan-panel-close', handlePanelClose);

                  return () => {
                    window.removeEventListener('change-plan-panel-open', handlePanelOpen);
                    window.removeEventListener('change-plan-panel-close', handlePanelClose);
                  };
                }, []);

                return React.createElement('div', {
                  style: {
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                  }
                }, [
                  // ✅ Phase 2.5: PreviewSource がマウントするコンテナ
                  React.createElement('div', {
                    key: 'preview',
                    ref: containerRef,
                    style: {
                      width: '100%',
                      height: '100%',
                      overflow: 'auto',
                    }
                  }),
                  // ✅ Phase 7: DragOverlayRenderer（Drag & Drop の描画専用レイヤー）
                  React.createElement(DragOverlayRenderer, { key: 'drag-overlay-renderer' }),
                  // ✅ Phase 5-b: ChangePlanDebugOverlay（独立レイヤー、Preview DOM を一切変更しない）
                  React.createElement(ChangePlanDebugOverlay, { key: 'change-plan-debug-overlay' }),
                  // ✅ Phase 6: ChangePlanApplyPanel（条件付き表示）
                  (() => {
                    try {
                      // 選択中のChangePlan ID（グローバル状態）
                      if (window.__selectedChangePlanId) {
                        return React.createElement(ChangePlanApplyPanel, {
                          key: 'change-plan-apply-panel',
                          planId: window.__selectedChangePlanId,
                          onClose: () => {
                            if (window.closeChangePlanApplyPanel) {
                              window.closeChangePlanApplyPanel();
                            }
                          },
                        });
                      }
                    } catch (error) {
                      console.error('[DesignSurface] Failed to render ChangePlanApplyPanel:', error);
                    }
                    return null;
                  })(),
                  // UI操作レイヤー（Overlay）
                  React.createElement('div', {
                    key: 'overlay',
                    ref: overlayContainerRef,
                    id: 'element-overlay',
                    style: {
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      zIndex: 1000,
                    }
                  }, [
                    selectedElement && containerRef.current
                      ? React.createElement(ElementOverlay, {
                          key: 'element-overlay',
                          selectedElement: selectedElement,
                          container: containerRef.current,
                          virtualStyle: virtualStyle, // ✅ Phase 7: 仮想スタイル
                          elementId: selectedElementId, // ✅ Phase 7: elementId
                        })
                      : null,
                    // ✅ Phase 3 + Phase 4 + Phase 5: デバッグ表示（開発用、本番UIでは使わない前提）
                    window.__debugUIActions && (() => {
                      try {
                        const store = getUIActionStore();
                        const planStore = getChangePlanStore();
                        const recentActions = store.getRecent(3);
                        const recentPlans = planStore.getRecent(3);

                        if (recentActions.length > 0 || recentPlans.length > 0) {
                          return React.createElement('div', {
                            key: 'debug-ui-actions',
                            style: {
                              position: 'fixed',
                              bottom: '10px',
                              right: '10px',
                              background: 'rgba(0, 0, 0, 0.9)',
                              color: '#fff',
                              padding: '10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              maxWidth: '500px',
                              maxHeight: '400px',
                              overflow: 'auto',
                              zIndex: 10001,
                            }
                          }, [
                            React.createElement('div', {
                              key: 'title',
                              style: { fontWeight: 'bold', marginBottom: '5px', fontSize: '12px' }
                            }, '📊 UI Actions (' + store.size() + ') / ChangePlans (' + planStore.size() + ')'),

                            // UI Actions
                            ...recentActions.map((action, idx) => {
                              const locatorInfo = action.locator
                                ? action.locator.filePath + ':' + action.locator.startLine + ':' + action.locator.startColumn + ' (' + (action.locator.confidence || 0).toFixed(2) + ')'
                                : 'not found';
                              const plan = planStore.getBySourceOpId(action.operationId);
                              return React.createElement('div', {
                                key: 'action-' + idx,
                                style: { marginTop: '8px', fontSize: '10px', lineHeight: '1.4', borderTop: idx > 0 ? '1px solid #444' : 'none', paddingTop: idx > 0 ? '5px' : '0' }
                              }, [
                                React.createElement('div', { key: 'type' }, action.type + ': ' + (action.target ? action.target.tagName : (action.elementId || 'unknown'))),
                                React.createElement('div', {
                                  key: 'locator',
                                  style: {
                                    marginTop: '2px',
                                    fontSize: '9px',
                                    color: action.locator ? '#4ade80' : '#fbbf24',
                                  }
                                }, '📍 ' + locatorInfo),
                                // Phase 5: ChangePlan情報
                                plan ? React.createElement('div', {
                                  key: 'plan',
                                  style: {
                                    marginTop: '3px',
                                    fontSize: '9px',
                                    color: plan.riskLevel === 'low' ? '#4ade80' : plan.riskLevel === 'medium' ? '#fbbf24' : '#f87171',
                                    padding: '3px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    borderRadius: '2px',
                                  }
                                }, [
                                  React.createElement('div', { key: 'plan-title' }, '📝 ChangePlan: ' + plan.filePath),
                                  React.createElement('div', { key: 'plan-risk' }, 'Risk: ' + plan.riskLevel + ' (' + (plan.confidence * 100).toFixed(0) + '%)'),
                                  plan.requiresUserDecision ? React.createElement('div', { key: 'plan-warning', style: { color: '#f87171' } }, '⚠️ Requires user decision') : null,
                                  plan.error ? React.createElement('div', { key: 'plan-error', style: { color: '#f87171' } }, '❌ ' + plan.error) : null,
                                ]) : React.createElement('div', {
                                  key: 'no-plan',
                                  style: {
                                    marginTop: '3px',
                                    fontSize: '9px',
                                    color: '#888',
                                  }
                                }, '📝 No ChangePlan (not generated)'),
                              ]);
                            }),
                          ]);
                        }
                      } catch (error) {
                        console.error('[DesignSurface] Failed to render debug UI actions:', error);
                      }
                      return null;
                    })(),

                    // ✅ Phase 5-b: ChangePlanDebugOverlay が左上に表示されるため、ここでは削除
                    // （重複を避けるため、ChangePlanDebugOverlayコンポーネントのみを使用）
                  ]),
                ]);
              }


              // マウント実行
              const container = document.getElementById('design-surface-container');
              if (container) {
                try {
                  // ✅ Phase 2: DesignSurfaceをマウント（Preview + UI操作レイヤー）
                  mountApp(container, DesignSurface);
                  console.log('[DesignSurface] ✅ DesignSurface initialized (with UI operation layer)');
                } catch (error) {
                  console.error('[DesignSurface] ❌ Failed to initialize:', error);
                  // エラー時もPreviewは表示（UI操作レイヤーなし）
                  try {
                    mountApp(container, PlaceholderApp);
                    console.log('[DesignSurface] ✅ Fallback: Preview only (UI operation layer disabled)');
                  } catch (fallbackError) {
                    console.error('[DesignSurface] ❌ Fallback also failed:', fallbackError);
                    container.innerHTML =
                      '<div style="padding: 40px; text-align: center; color: #f48771;">' +
                      '<h2>Error</h2><p>Failed to mount DesignSurface</p></div>';
                  }
                }
              } else {
                console.error('[DesignSurface] ❌ Container not found');
              }

              // クリーンアップ関数（必要に応じて）
              window.__unmountDesignSurface = function() {
                if (window.__designSurfaceRoot) {
                  try {
                    window.__designSurfaceRoot.unmount();
                    console.log('[DesignSurface] ✅ Unmounted');
                  } catch (error) {
                    console.error('[DesignSurface] ❌ Failed to unmount:', error);
                  }
                  window.__designSurfaceRoot = null;
                }
              };

            })();
          </script>
        </body>
      </html>
    `;
  }
}

/**
 * Preview Serviceインスタンス
 */
export const previewService = new PreviewService();

