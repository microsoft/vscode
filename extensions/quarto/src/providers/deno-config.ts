/*
 * deno-config.ts
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

import { ExtensionContext, workspace, window, extensions } from "vscode";

import { MarkdownEngine } from "../markdown/engine";
import { TextDocument } from "vscode";
import { isDenoDocument } from "../host/executors";
import { isQuartoDoc } from "../core/doc";

export function activateDenoConfig(context: ExtensionContext, engine: MarkdownEngine) {
  if (extensions.getExtension("denoland.vscode-deno")) {
    const ensureDenoConfig = async (doc: TextDocument) => {
      if (isQuartoDoc(doc)) {
        const config = workspace.getConfiguration();
        const inspectDenoEnable = config.inspect("deno.enable");
        if (
          !inspectDenoEnable?.globalValue &&
          !inspectDenoEnable?.workspaceValue &&
          !inspectDenoEnable?.workspaceFolderValue
        ) {
          if (isDenoDocument(doc, engine)) {
            await config.update("deno.enable", true, null);
          }

        }
      }
    };
    window.onDidChangeActiveTextEditor((e) => { if (e) { ensureDenoConfig(e?.document); } });
    workspace.onDidOpenTextDocument(ensureDenoConfig, null, context.subscriptions);
    workspace.onDidSaveTextDocument(ensureDenoConfig, null, context.subscriptions);
  }
}
