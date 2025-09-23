/*
 * background.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 * Copyright (c) [2021] [Chris Bain] (https://github.com/baincd/vscode-markdown-color-plus/)
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


import * as vscode from "vscode";
import debounce from "lodash.debounce";

import { isQuartoDoc, kQuartoDocSelector } from "../core/doc";
import { MarkdownEngine } from "../markdown/engine";
import { isExecutableLanguageBlock } from "quarto-core";
import { vscRange } from "../core/range";

export function activateBackgroundHighlighter(
  context: vscode.ExtensionContext,
  engine: MarkdownEngine
) {
  // read config and monitor it for changes
  highlightingConfig.sync();
  vscode.workspace.onDidChangeConfiguration(
    () => {
      highlightingConfig.sync();
      triggerUpdateAllEditorsDecorations(engine);
    },
    null,
    context.subscriptions
  );

  // update highlighting when docs are opened
  vscode.workspace.onDidOpenTextDocument(
    (doc) => {
      if (doc === vscode.window.activeTextEditor?.document) {
        if (!isQuartoDoc(doc)) {
          clearEditorHighlightDecorations(vscode.window.activeTextEditor);
        } else {
          triggerUpdateActiveEditorDecorations(
            vscode.window.activeTextEditor,
            engine,
            highlightingConfig.delayMs()
          );
        }
      }
    },
    null,
    context.subscriptions
  );

  // update highlighting when visible text editors change
  vscode.window.onDidChangeVisibleTextEditors(
    (_editors) => {
      triggerUpdateAllEditorsDecorations(engine);
    },
    null,
    context.subscriptions
  );

  // update highlighting on changes to the document (if its visible)
  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      const visibleEditor = vscode.window.visibleTextEditors.find(editor => {
        return editor.document.uri.toString() === event.document.uri.toString();
      });
      if (visibleEditor) {
        triggerUpdateActiveEditorDecorations(
          visibleEditor,
          engine,
          highlightingConfig.delayMs(),
          true,
          event.contentChanges.length === 1
            ? event.contentChanges[0].range.start
            : undefined
        );
      }
    },
    null,
    context.subscriptions
  );

  // update highlighting for ordinary document highlighter callbacks
  context.subscriptions.push(
    vscode.languages.registerDocumentHighlightProvider(kQuartoDocSelector, {
      provideDocumentHighlights: function (
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
      ) {
        if (document === vscode.window.activeTextEditor?.document) {
          triggerUpdateActiveEditorDecorations(
            vscode.window.activeTextEditor,
            engine,
            highlightingConfig.delayMs(),
            true,
            position,
            token
          );
        }
        return [];
      },
    })
  );

  // highlight all editors at activation time
  triggerUpdateAllEditorsDecorations(engine);
}

function triggerUpdateActiveEditorDecorations(
  editor: vscode.TextEditor,
  engine: MarkdownEngine,
  delay: number,
  immediate?: boolean,
  pos?: vscode.Position,
  token?: vscode.CancellationToken
) {
  debounce(
    () => setEditorHighlightDecorations(editor, engine, pos, token),
    delay,
    {
      leading: !!immediate,
    }
  )();
}

function triggerUpdateAllEditorsDecorations(engine: MarkdownEngine) {
  debounce(async () => {
    for (const editor of vscode.window.visibleTextEditors) {
      await setEditorHighlightDecorations(editor, engine);
    }
  }, highlightingConfig.delayMs())();
}

async function setEditorHighlightDecorations(
  editor: vscode.TextEditor,
  engine: MarkdownEngine,
  _pos?: vscode.Position,
  _token?: vscode.CancellationToken
) {
  if (!editor || !isQuartoDoc(editor.document)) {
    return;
  }

  // ranges to highlight
  const blockRanges: vscode.Range[] = [];
  const inlineRanges: vscode.Range[] = [];

  if (highlightingConfig.enabled()) {

    // find code blocks
    const tokens = engine.parse(editor.document);
    for (const block of tokens.filter(isExecutableLanguageBlock)) {
      blockRanges.push(vscRange(block.range));
    }

    // find inline executable code
    for (let i = 0; i < editor.document.lineCount; i++) {
      const line = editor.document.lineAt(i);
      const matches = line.text.matchAll(/(^|[^`])`{[\w_]+}[ \t]([^`]+)`/g);
      for (const match of matches) {
        if (match.index !== undefined) {
          const begin = new vscode.Position(i, match.index + match[1].length);
          const end = new vscode.Position(i, begin.character + match[0].length - match[1].length);
          inlineRanges.push(new vscode.Range(begin, end));
        }
      }
    }
  }


  // set highlights (could be none if we highlighting isn't enabled)
  editor.setDecorations(
    highlightingConfig.backgroundDecoration(),
    blockRanges
  );
  editor.setDecorations(
    highlightingConfig.inlineBackgroundDecoration(),
    inlineRanges
  );
}

function clearEditorHighlightDecorations(editor: vscode.TextEditor) {
  editor.setDecorations(highlightingConfig.backgroundDecoration(), []);
}

enum CellBackgroundColor {
  default = "default",
  off = "off",
  useTheme = "useTheme",
}

class HiglightingConfig {
  constructor() { }

  public enabled() {
    return this.enabled_;
  }

  public backgroundDecoration() {
    return this.backgroundDecoration_!;
  }

  public inlineBackgroundDecoration() {
    return this.inlineBackgroundDecoration_!;
  }

  public delayMs() {
    return this.delayMs_;
  }

  public sync() {
    const config = vscode.workspace.getConfiguration("quarto");
    const backgroundOption = config.get<CellBackgroundColor>("cells.background.color", CellBackgroundColor.default);
    let light, dark;
    if (backgroundOption === CellBackgroundColor.useTheme) {
      const activeCellBackgroundThemeColor = new vscode.ThemeColor('notebook.selectedCellBackground');
      light = activeCellBackgroundThemeColor;
      dark = activeCellBackgroundThemeColor;
    } else {
      light = config.get<string>("cells.background.lightDefault", "#E1E1E166");
      dark = config.get<string>("cells.background.darkDefault", "#40404066");
    }

    this.enabled_ = backgroundOption !== CellBackgroundColor.off;
    this.delayMs_ = config.get("cells.background.delay", 250);


    if (this.backgroundDecoration_) {
      this.backgroundDecoration_.dispose();
    }
    this.backgroundDecoration_ = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      light: {
        backgroundColor: light,
      },
      dark: {
        backgroundColor: dark,
      },
    });

    if (this.inlineBackgroundDecoration_) {
      this.inlineBackgroundDecoration_.dispose();
    }
    this.inlineBackgroundDecoration_ = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      light: {
        backgroundColor: light,
      },
      dark: {
        backgroundColor: dark,
      }
    });
  }

  private enabled_ = true;
  private backgroundDecoration_: vscode.TextEditorDecorationType | undefined;
  private inlineBackgroundDecoration_: vscode.TextEditorDecorationType | undefined;
  private delayMs_ = 250;
}

const highlightingConfig = new HiglightingConfig();
