/*
 * diagram.ts
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

import { ExtensionContext, languages } from "vscode";

import { DiagramState } from "editor-types";
import { languageDiagramEngine } from "editor-core";

import { Command } from "../../core/command";
import { kQuartoDocSelector } from "../../core/doc";
import { MarkdownEngine } from "../../markdown/engine";
import { VisualEditorProvider } from "../editor/editor";
import { diagramCodeLensProvider } from "./codelens";
import { diagramCommands } from "./commands";
import { QuartoDiagramWebviewManager } from "./diagram-webview";
import { ExtensionHost } from "../../host";

export function activateDiagram(
  context: ExtensionContext,
  host: ExtensionHost,
  engine: MarkdownEngine
): Command[] {
  // initiaize manager
  const diagramManager = new QuartoDiagramWebviewManager(context, host, engine);

  // code lens
  context.subscriptions.push(
    languages.registerCodeLensProvider(
      kQuartoDocSelector,
      diagramCodeLensProvider(engine)
    )
  );

  // diagram commands
  return diagramCommands(diagramManager, engine);
}

export async function visualEditorDiagramState(): Promise<DiagramState | undefined> {

  const visualEditor = VisualEditorProvider.activeEditor();
  if (visualEditor) {
    const blockContext = await visualEditor.getActiveBlockContext();
    if (blockContext) {
      const engine = languageDiagramEngine(blockContext.activeLanguage);
      if (engine) {
        const activeBlock = blockContext.blocks.find(block => block.active);
        if (activeBlock) {
          return { engine, src: activeBlock.code };
        }
      }
    }
  }

  return undefined;
}
