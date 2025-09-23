/*
 * toggle.ts
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

import { commands, window, workspace, TextDocument, ViewColumn } from "vscode";
import * as quarto from "quarto-core";
import { Command } from "../../core/command";
import { isQuartoDoc, kQuartoLanguageId } from "../../core/doc";
import { VisualEditorProvider } from "./editor";
import { Uri } from "vscode";
import { hasHooks } from "../../host/hooks";
import { toggleEditMode, toggleRenderOnSaveOverride } from "../context-keys";

export function determineMode(text: string, uri: Uri): string | undefined {
  let editorOpener = undefined;

  // check if file itself has a mode
  if (hasEditorMode(text, "source")) {
    editorOpener = "textEditor";
  }
  else if (hasEditorMode(text, "visual")) {
    editorOpener = VisualEditorProvider.viewType;
  }
  // check if has a _quarto.yml or _quarto.yaml file with editor specified
  else {
    editorOpener = modeFromQuartoYaml(uri);
  }

  return editorOpener;
}

export function modeFromQuartoYaml(uri: Uri): string | undefined {
  const metadataFiles = quarto.metadataFilesForDocument(uri.fsPath);
  if (!metadataFiles) {
    return undefined;
  }
  if (metadataFiles) {
    for (const metadataFile of metadataFiles) {
      const yamlText = quarto.yamlFromMetadataFile(metadataFile);
      if (yamlText?.editor === "source") {
        return "textEditor";
      }
      if (yamlText?.editor === "visual") {
        return VisualEditorProvider.viewType;
      }
    }
  }
  return undefined;
}

export function hasEditorMode(doc: string, mode: string): boolean {

  if (doc) {
    const match = doc.match(quarto.kRegExYAML);
    if (match) {
      const yaml = match[0];
      return (
        !!yaml.match(new RegExp("editor:\\s+" + mode + "\\s*$", "gm")) ||
        !!yaml.match(new RegExp("^[ \\t]*" + "mode:\\s*" + mode + "\\s*$", "gm"))
      );
    }
  }
  return false;
}

export function editInVisualModeCommand(): Command {
  return {
    id: "quarto.editInVisualMode",
    execute() {
      const editor = window.activeTextEditor;
      if (editor && isQuartoDoc(editor.document)) {
        reopenEditorInVisualMode(editor.document, editor.viewColumn);
      }
    }
  };
}

export function editInSourceModeCommand(): Command {
  return {
    id: "quarto.editInSourceMode",
    execute() {
      const activeVisual = VisualEditorProvider.activeEditor();
      if (activeVisual) {
        reopenEditorInSourceMode(activeVisual.document, '', activeVisual.viewColumn);
      }
    }
  };
}

export function toggleEditModeCommand(): Command {
  return {
    id: 'quarto.toggleEditMode',
    execute() {
      toggleEditMode();
    }
  };
}

export function toggleRenderOnSaveCommand(): Command {
  return {
    id: 'quarto.toggleRenderOnSave',
    execute() {
      toggleRenderOnSaveOverride();
    }
  };
}

export async function reopenEditorInVisualMode(
  document: TextDocument,
  viewColumn?: ViewColumn
) {
  if (hasHooks()) {
    // note pending switch to visual
    VisualEditorProvider.recordPendingSwitchToVisual(document);
    commands.executeCommand('positron.reopenWith', document.uri, 'quarto.visualEditor');
  } else {
    // save then close
    await commands.executeCommand("workbench.action.files.save");
    await commands.executeCommand('workbench.action.closeActiveEditor');
    VisualEditorProvider.recordPendingSwitchToVisual(document);
    // open in visual mode
    await commands.executeCommand("vscode.openWith",
      document.uri,
      VisualEditorProvider.viewType,
      {
        viewColumn
      }
    );
  }
}

export async function reopenEditorInSourceMode(
  document: TextDocument,
  untitledContent?: string,
  viewColumn?: ViewColumn
) {
  if (hasHooks()) {
    // note pending switch to source
    VisualEditorProvider.recordPendingSwitchToSource(document);

    commands.executeCommand('positron.reopenWith', document.uri, 'default');
  } else {
    if (!document.isUntitled) {
      await commands.executeCommand("workbench.action.files.save");
    }

    // note pending switch to source
    VisualEditorProvider.recordPendingSwitchToSource(document);

    // close editor (return immediately as if we don't then any
    // rpc method that calls this wil result in an error b/c the webview
    // has been torn down by the time we return)
    commands.executeCommand('workbench.action.closeActiveEditor').then(async () => {
      if (document.isUntitled) {
        const doc = await workspace.openTextDocument({
          language: kQuartoLanguageId,
          content: untitledContent || '',
        });
        await window.showTextDocument(doc, viewColumn, false);
      } else {
        const doc = await workspace.openTextDocument(document.uri);
        await window.showTextDocument(doc, viewColumn, false);
      }
    });
  }
}
