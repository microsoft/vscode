/*
 * hooks.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import * as vscode from 'vscode';
import * as erdos from 'erdos';
import { v4 as generateUuid } from 'uuid';
import { quartoInlineOutputManager } from '../providers/output/inlineOutputManager';


let api: typeof erdos | null | undefined;

import { ExtensionHost, HostWebviewPanel, HostStatementRangeProvider, HostHelpTopicProvider } from '.';
import { CellExecutor, cellExecutorForLanguage, executableLanguages, isKnitrDocument, pythonWithReticulate } from './executors';
import { ExecuteQueue } from './execute-queue';
import { MarkdownEngine } from '../markdown/engine';
import { virtualDoc, adjustedPosition, unadjustedRange, withVirtualDocUri } from "../vdoc/vdoc";
import { EmbeddedLanguage } from '../vdoc/languages';

export function hooksApi(): typeof erdos | null {
  if (api === undefined) {
    api = erdos;
  }
  return api;
}

export function hasHooks() {
  return !!hooksApi();
}

export function hooksExtensionHost(): ExtensionHost {
  return {
    // supported executable languages (we delegate to the default for langugaes
    // w/o runtimes so we support all languages)
    executableLanguages,

    cellExecutorForLanguage: async (language: string, document: vscode.TextDocument, engine: MarkdownEngine, silent?: boolean)
      : Promise<CellExecutor | undefined> => {
      switch (language) {
        // use hooks for known runtimes
        case "python":
        case "csharp":
        case "r":
          return {
            execute: async (blocks: string[], _editorUri?: vscode.Uri, cellRange?: vscode.Range): Promise<void> => {
              const runtime = hooksApi()?.runtime;

              if (runtime === undefined) {
                // Can't do anything without a runtime
                return;
              }

              if (language === "python" && isKnitrDocument(document, engine)) {
                language = "r";
                blocks = blocks.map(pythonWithReticulate);
              }

              // Our callback executes each block sequentially
              const callback = async () => {
                for (const block of blocks) {
                  // Generate unique execution ID for tracking
                  const executionId = generateUuid();

                  // Register this execution as coming from Quarto via command
                  await vscode.commands.executeCommand('erdos.registerQuartoExecution', executionId);

                  // Track this execution with its cell range
                  if (cellRange) {
                    quartoInlineOutputManager.trackCellExecution(executionId, cellRange);
                  }

                  // Execute code block with our execution ID
                  await runtime.executeCode(language, block, false, true, undefined, undefined, undefined, executionId);
                }
              }

              await ExecuteQueue.instance.add(language, callback);
            },
            executeSelection: async (): Promise<void> => {
              await vscode.commands.executeCommand('workbench.action.erdosConsole.executeCode', { languageId: language });
            }
          };

        // delegate for other languages
        default:
          return cellExecutorForLanguage(language, document, engine, silent);
      }
    },

    registerStatementRangeProvider: (engine: MarkdownEngine): vscode.Disposable => {
      const hooks = hooksApi();
      if (hooks) {
        return hooks.languages.registerStatementRangeProvider('quarto',
          new EmbeddedStatementRangeProvider(engine));
      }
      return new vscode.Disposable(() => { });
    },

    registerHelpTopicProvider: (engine: MarkdownEngine): vscode.Disposable => {
      const hooks = hooksApi();
      if (hooks) {
        return hooks.languages.registerHelpTopicProvider('quarto',
          new EmbeddedHelpTopicProvider(engine));
      }
      return new vscode.Disposable(() => { });
    },

    createPreviewPanel: (
      viewType: string,
      title: string,
      preserveFocus?: boolean,
      options?: vscode.WebviewPanelOptions & vscode.WebviewOptions
    ): HostWebviewPanel => {

      // create preview panel
      const panel = hooksApi()?.window.createPreviewPanel(
        viewType,
        title,
        preserveFocus,
        {
          enableScripts: options?.enableScripts,
          enableForms: options?.enableForms,
          localResourceRoots: options?.localResourceRoots,
          portMapping: options?.portMapping
        }
      )!;

      // adapt to host interface
      return new HookWebviewPanel(panel);
    }
  };
}


class HookWebviewPanel implements HostWebviewPanel {
  constructor(private readonly panel_: erdos.PreviewPanel) { }

  get webview() { return this.panel_.webview; };
  get visible() { return this.panel_.visible; };
  reveal(_viewColumn?: vscode.ViewColumn, preserveFocus?: boolean) {
    this.panel_.reveal(preserveFocus);
  }
  onDidChangeViewState = this.panel_.onDidChangeViewState;
  onDidDispose = this.panel_.onDidDispose;
  dispose() { this.panel_.dispose(); };
}

class EmbeddedStatementRangeProvider implements HostStatementRangeProvider {
  private readonly _engine: MarkdownEngine;

  constructor(
    readonly engine: MarkdownEngine,
  ) {
    this._engine = engine;
  }

  async provideStatementRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken): Promise<erdos.StatementRange | undefined> {
    const vdoc = await virtualDoc(document, position, this._engine);
    if (vdoc) {
      return await withVirtualDocUri(vdoc, document.uri, "statementRange", async (uri: vscode.Uri) => {
        return getStatementRange(
          uri,
          adjustedPosition(vdoc.language, position),
          vdoc.language
        );
      });
    } else {
      return undefined;
    }
  };
}

async function getStatementRange(
  uri: vscode.Uri,
  position: vscode.Position,
  language: EmbeddedLanguage
) {
  const result = await vscode.commands.executeCommand<erdos.StatementRange>(
    "vscode.executeStatementRangeProvider",
    uri,
    position
  );
  return { range: unadjustedRange(language, result.range), code: result.code };
}

class EmbeddedHelpTopicProvider implements HostHelpTopicProvider {
  private readonly _engine: MarkdownEngine;

  constructor(
    readonly engine: MarkdownEngine,
  ) {
    this._engine = engine;
  }

  async provideHelpTopic(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken): Promise<string | undefined> {
    const vdoc = await virtualDoc(document, position, this._engine);

    if (vdoc) {
      return await withVirtualDocUri(vdoc, document.uri, "helpTopic", async (uri: vscode.Uri) => {
        return await vscode.commands.executeCommand<string>(
          "vscode.executeHelpTopicProvider",
          uri,
          adjustedPosition(vdoc.language, position),
          vdoc.language
        );
      });
    } else {
      return undefined;
    }
  };
}
