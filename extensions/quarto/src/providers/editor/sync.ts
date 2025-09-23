/*
 * sync.ts
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

import { TextDocument, TextEdit, workspace, WorkspaceEdit, Range } from "vscode";
import { JsonRpcRequestTransport } from "core";

import { editorSourceJsonRpcServer } from "editor-core";
import { isXRef, NavLocation, VSCodeVisualEditor, XRef } from "editor-types";

import { getWholeRange } from "../../core/doc";

/* Strategy for managing synchronization of edits between source and visual mode.

This is made more complicated by the fact that getting/setting visual editor markdown
is expensive (requires a pandoc round trip) so is throttled by 1 second. We also need
to guard against edits pinging back and forth (esp. w/ the requirement on flushing all
pending edits on save)

For the visual editor syncing to external changes:

1) Only accept external edits when NOT focused (once the visual editor is focused it
   is the definitive source of changes to the document)

2) These external edits are throttled by 1 second so we don't get constant (expensive)
   refreshing of the visual editor when users type in the text editor.

For the visual editor propagating its own changes:

1) The visual editor will continuously send the JSON version of the editor AST
   to the host as updates occur (this is very cheap and doesn't involve pandoc)

2) The host will apply these changes throttled by 1 second so we don't get constant
   (expensive) refreshing of the text document when users type in the visual editor

3) The throttled edits are _flushed_ immediately when the user saves the document

*/

export interface EditorSyncManager {
  init: () => Promise<void>;
  onVisualEditorChanged: (state: unknown) => Promise<void>;
  flushPendingUpdates: () => Promise<void>;
  onDocumentChanged: () => Promise<void>;
  onDocumentSaving: () => Promise<TextEdit[]>;
  onDocumentSaved: () => Promise<void>;
}

// sync the document model w/ the visual editor
export function editorSyncManager(
  document: TextDocument,
  visualEditor: VSCodeVisualEditor,
  request: JsonRpcRequestTransport,
  navigation?: XRef | number
): EditorSyncManager {

  // state: an update from the visual editor that we have yet to apply. we don't
  // apply these on every keystoke b/c they are expensive. we poll to apply these
  // udpates periodically and also apply them immediately on save and when the
  // visual editor instructs us to do so (e.g. when it loses focus)
  let pendingVisualEdit: unknown | undefined;

  // state: don't propagate the next model change we get to the visual editor
  // (as the change actually resulted from a visual editor sync)
  let supressNextUpdate = false;

  // collect a pending edit, converting it to markdown and setting the supressNextUpdate bit
  // if we fail get the markdown then we neither clear the pending edit nor supress the update
  const collectPendingVisualEdit = async (): Promise<string | undefined> => {
    if (pendingVisualEdit) {
      const state = pendingVisualEdit;
      try {
        pendingVisualEdit = undefined;
        const markdown = await visualEditor.getMarkdownFromState(state);
        supressNextUpdate = true;
        return markdown;
      } catch (error) {
        if (pendingVisualEdit === undefined) {
          pendingVisualEdit = state;
        }
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        console.log("Error getting visual editor markdown: " + message);
        return undefined;
      }
    } else {
      return undefined;
    }
  };

  // collect and apply any pending edit by updating the document
  const collectAndApplyPendingVisualEdit = async () => {
    const markdown = await collectPendingVisualEdit();
    if (markdown) {
      await updateWorkspaceDocument(document, markdown);
    }
  };

  // periodically collect and apply pending edits. note that we also
  // collect and apply automatically when a save occurs
  setInterval(collectAndApplyPendingVisualEdit, 2000);

  return {

    // initialize the connection to the visual editor by providing it
    // with its initial contents and syncing the canonnical markdown
    // back to the document
    init: async () => {
      // determine the current sourcePos
      const markdown = document.getText();
      let initialNav: NavLocation | undefined;
      if (markdown) {
        if (typeof (navigation) === "number") {
          const source = editorSourceJsonRpcServer(request);
          const locations = await source.getSourcePosLocations(markdown);
          initialNav = { locations, pos: navigation };
        } else if (isXRef(navigation)) {
          initialNav = navigation;
        }
      }

      const editorMarkdown = await visualEditor.init(markdown, initialNav);
      if (editorMarkdown && (editorMarkdown !== document.getText())) {
        await updateWorkspaceDocument(document, editorMarkdown);
      }
    },

    // notification that the visual editor changed (enque the change)
    onVisualEditorChanged: async (state: unknown) => {
      pendingVisualEdit = state;
    },

    // flush
    flushPendingUpdates: collectAndApplyPendingVisualEdit,

    // notification that the document changed, let the visual editor
    // know about the change unless the next update is supressed. note that
    // the visual editor will throttle these changes internally (and
    // apply them immediately when it receives focus)
    onDocumentChanged: async () => {
      if (supressNextUpdate) {
        supressNextUpdate = false;
      } else {
        await visualEditor.applyExternalEdit(document.getText());
      }
    },

    // notification that we are saving (allow flusing of visual editor changes)
    onDocumentSaving: async (): Promise<TextEdit[]> => {
      // attempt to collect pending edit
      const markdown = await collectPendingVisualEdit();
      if (markdown) {
        const edits: TextEdit[] = [];
        const editor = documentEditor(edits);
        updateDocument(editor, document, markdown);
        return edits;
      } else {
        return [];
      }
    },

    // notification that a document completed saving (failsafe for changes
    // that didn't get applied b/c of onDocumentSaving no longer being
    // called b/c vscode deems that it is running for too long)
    onDocumentSaved: async (): Promise<void> => {
      collectAndApplyPendingVisualEdit();
    }
  };
}




interface DocumentEditor {
  replace: (range: Range, newText: string) => void;
}

function updateDocument(editor: DocumentEditor, document: TextDocument, markdown: string) {
  const wholeDocRange = getWholeRange(document);
  editor.replace(wholeDocRange, markdown);
}

function documentEditor(edits: TextEdit[]) {
  return {
    replace: (range: Range, text: string) => edits.push(TextEdit.replace(range, text))
  };
}

function workspaceDocumentEditor(edit: WorkspaceEdit, document: TextDocument) {
  return {
    replace: (range: Range, text: string) => edit.replace(document.uri, range, text)
  };
}

async function updateWorkspaceDocument(document: TextDocument, markdown: string) {
  const edit = new WorkspaceEdit();
  const editor = workspaceDocumentEditor(edit, document);
  updateDocument(editor, document, markdown);
  await workspace.applyEdit(edit);
};
