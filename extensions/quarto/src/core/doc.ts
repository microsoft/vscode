/*
 * doc.ts
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

import path from "node:path";
import fs from "node:fs";

import * as vscode from "vscode";
import { Uri } from "vscode";
import { revealSlideIndex } from "../markdown/reveal";
import { VisualEditorProvider } from "../providers/editor/editor";
import { extname } from "./path";
import { MarkdownEngine } from "../markdown/engine";
import { QuartoContext, projectDirForDocument } from "quarto-core";
import { TextDocument } from "vscode";
import { workspace } from "vscode";
import { NotebookDocument } from "vscode";
import { isJupyterPercentScript, isKnitrSpinScript } from "core-node";

export const kQuartoLanguageId = "quarto";
export const kMarkdownLanguageId = "markdown";
const kMermaidLanguageId = "mermaid";
const kDotLanguageId = "dot";
const kYamlLanguageId = "yaml";

export const kQuartoDocSelector: vscode.DocumentSelector = {
  language: kQuartoLanguageId,
  scheme: "*",
};

export function isQuartoDoc(doc?: vscode.TextDocument, strict = false) {
  return (
    isLanguageDoc(kQuartoLanguageId, doc) ||
    (!strict && isLanguageDoc(kMarkdownLanguageId, doc))
  );
}

export function isMermaidDoc(doc?: vscode.TextDocument) {
  return isLanguageDoc(kMermaidLanguageId, doc);
}

export function isGraphvizDoc(doc?: vscode.TextDocument) {
  return isLanguageDoc(kDotLanguageId, doc);
}

function isLanguageDoc(languageId: string, doc?: vscode.TextDocument) {
  return !!doc && doc.languageId === languageId;
}

export function isNotebook(doc?: vscode.TextDocument) {
  return !!doc && isNotebookUri(doc.uri);
}

export function isNotebookUri(uri: Uri) {
  return extname(uri.fsPath).toLowerCase() === ".ipynb";
}


export function canPreviewDoc(doc?: TextDocument) {
  if (doc) {
    if (isQuartoDoc(doc) || isNotebook(doc)) {
      return true;
    } else if (validatateQuartoCanRender(doc)) {
      return true;
    }
  }
  return false;
}

export function previewDirForDocument(uri: Uri) {
  // first check for a quarto project
  const projectDir = projectDirForDocument(uri.fsPath);
  if (projectDir) {
    return projectDir;
  } else {
    // now check if we are within a workspace root
    const workspaceDir = workspace.getWorkspaceFolder(uri);
    if (workspaceDir) {
      return workspaceDir.uri.fsPath;
    }
  }
  return undefined;
}

export function previewTargetDir(uri: Uri) {
  const targetPath = uri.fsPath;
  if (fs.statSync(targetPath).isDirectory()) {
    return targetPath;
  } else {
    return path.dirname(targetPath);
  }
}

export function isQuartoYaml(doc?: vscode.TextDocument) {
  return (
    !!doc &&
    doc.languageId === kYamlLanguageId &&
    doc.uri.toString().match(/_quarto\.ya?ml$/)
  );
}

export function isMarkdownDoc(document?: vscode.TextDocument) {
  return (
    !!document && (isQuartoDoc(document) || document.languageId === "markdown")
  );
}

export function quartoCanRenderMarkdown(document: vscode.TextDocument) {
  const ext = extname(document.uri.toString()).toLowerCase();
  return [".qmd", ".rmd", ".md"].includes(ext);
}

export function quartoCanRenderScript(document: vscode.TextDocument) {
  const text = document.getText();
  return isJupyterPercentScript(document.uri.fsPath, text) ||
    isKnitrSpinScript(document.uri.fsPath, text);
}

export function validatateQuartoCanRender(document: vscode.TextDocument) {
  return quartoCanRenderMarkdown(document) || quartoCanRenderScript(document);
}

export async function resolveQuartoDocUri(
  resource: vscode.Uri
): Promise<vscode.TextDocument | undefined> {
  try {
    const doc = await tryResolveUriToQuartoDoc(resource);
    if (doc) {
      return doc;
    }
  } catch {
    // Noop
  }

  // If no extension, try with `.qmd` extension
  if (extname(resource.path) === "") {
    return tryResolveUriToQuartoDoc(
      resource.with({ path: resource.path + ".qmd" })
    );
  }

  return undefined;
}

export function getWholeRange(doc: vscode.TextDocument) {
  const begin = new vscode.Position(0, 0);
  const end = doc.lineAt(doc.lineCount - 1).range.end;
  return new vscode.Range(begin, end);
}

export function preserveEditorFocus(editor?: QuartoEditor) {
  // focus the editor (sometimes the terminal steals focus)
  editor =
    editor ||
    (vscode.window.activeTextEditor
      ? quartoEditor(vscode.window.activeTextEditor)
      : undefined);
  if (editor) {
    if (!isNotebook(editor?.document)) {
      setTimeout(() => {
        if (editor) {
          editor.activate();
        }
      }, 200);
    }
  } else {
    // see if there is a visual editor we should be preserving focus for
    const visualEditor = VisualEditorProvider.activeEditor();
    if (visualEditor) {
      setTimeout(async () => {
        if (!(await visualEditor.hasFocus())) {
          await visualEditor.activate();
        }
      }, 200);
    }
  }
}

export interface QuartoEditor {
  document: vscode.TextDocument;
  activate: () => Promise<void>;
  slideIndex: () => Promise<number>;
  viewColumn?: vscode.ViewColumn;
  textEditor?: vscode.TextEditor;
  notebook?: vscode.NotebookDocument;
}

export function findQuartoEditor(
  engine: MarkdownEngine,
  context: QuartoContext,
  filter: (doc: vscode.TextDocument) => boolean,
  includeVisible = true
): QuartoEditor | undefined {
  // first check for an active visual editor
  const activeVisualEditor = VisualEditorProvider.activeEditor();
  if (activeVisualEditor && filter(activeVisualEditor.document)) {
    return activeVisualEditor;
  }

  // then check for active notebook editor
  const notebookEditor = (vscode.window as any).activeNotebookEditor as
    | vscode.NotebookEditor
    | undefined;
  if (notebookEditor) {
    const notebookDocument = (notebookEditor as any).notebook as
      | vscode.NotebookDocument
      | undefined;
    if (notebookDocument) {
      const textEditor = vscode.window.visibleTextEditors.find((editor) => {
        return editor.document.uri.fsPath.includes(notebookDocument.uri.fsPath);
      });
      if (textEditor && filter(textEditor.document)) {
        return quartoEditor(textEditor, engine, context, notebookDocument);
      }
    }
  }

  // active text editor
  const textEditor = vscode.window.activeTextEditor;
  if (textEditor && filter(textEditor.document)) {
    return quartoEditor(textEditor, engine, context);
    // check visible text editors
  } else if (includeVisible) {
    // visible visual editor (sometime it loses track of 'active' so we need to use 'visible')
    const visibleVisualEditor = VisualEditorProvider.activeEditor(true);
    if (visibleVisualEditor && filter(visibleVisualEditor.document)) {
      return visibleVisualEditor;
    }

    // visible text editors
    const visibleEditor = vscode.window.visibleTextEditors.find((editor) =>
      filter(editor.document)
    );
    if (visibleEditor) {
      return quartoEditor(visibleEditor, engine, context);
    } else {
      return undefined;
    }
  } else {
    return undefined;
  }
}

export function quartoEditor(
  editor: vscode.TextEditor,
  engine?: MarkdownEngine,
  context?: QuartoContext,
  notebook?: NotebookDocument
) {
  return {
    document: editor.document,
    activate: async () => {
      await vscode.window.showTextDocument(
        editor.document,
        editor.viewColumn,
        false
      );
    },
    slideIndex: async () => {
      if (engine && context) {
        return await revealSlideIndex(
          editor.selection.active,
          editor.document,
          engine,
          context
        );
      } else {
        return 0;
      }
    },
    viewColumn: editor.viewColumn,
    textEditor: editor,
    notebook,
  };
}

async function tryResolveUriToQuartoDoc(
  resource: vscode.Uri
): Promise<vscode.TextDocument | undefined> {
  let document: vscode.TextDocument;
  try {
    document = await vscode.workspace.openTextDocument(resource);
  } catch {
    return undefined;
  }
  if (isQuartoDoc(document)) {
    return document;
  }
  return undefined;
}
