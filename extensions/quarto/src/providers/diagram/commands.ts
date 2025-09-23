/*
 * commands.ts
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

import { commands, Position, window, Selection } from "vscode";
import { DiagramState } from "editor-types";

import { Command } from "../../core/command";
import { isGraphvizDoc, isMermaidDoc, isQuartoDoc } from "../../core/doc";
import { MarkdownEngine } from "../../markdown/engine";
import { QuartoDiagramWebviewManager } from "./diagram-webview";
import { visualEditorDiagramState } from "./diagram";
import { isDiagram, isDisplayMath, languageBlockAtPosition } from "quarto-core";

export interface PreviewDiagramOptions {
  textEditorLine?: number;
  state?: DiagramState;
  activate?: boolean;
}

export function diagramCommands(
  manager: QuartoDiagramWebviewManager,
  engine: MarkdownEngine
): Command[] {
  return [
    new PreviewDiagramCommand(manager),
    new PreviewContentShortcutCommand(engine),
  ];
}


class PreviewDiagramCommand implements Command {
  constructor(private readonly manager_: QuartoDiagramWebviewManager) { }
  execute(options?: PreviewDiagramOptions): void {
    // set selection to line if requested
    if (options?.textEditorLine !== undefined && window.activeTextEditor) {
      const selPos = new Position(options?.textEditorLine, 0);
      window.activeTextEditor.selection = new Selection(selPos, selPos);
    }

    // ensure diagram view is visible
    this.manager_.showDiagram(options?.state, options?.activate);
  }

  private static readonly id = "quarto.previewDiagram";
  public readonly id = PreviewDiagramCommand.id;
}

class PreviewContentShortcutCommand implements Command {
  constructor(private readonly engine_: MarkdownEngine) { }
  async execute(): Promise<void> {
    // first determine whether this is an alias for preview math or preview diagram
    if (window.activeTextEditor) {
      const doc = window.activeTextEditor.document;
      if (isQuartoDoc(doc)) {
        // are we in a language block?
        const tokens = this.engine_.parse(doc);
        const line = window.activeTextEditor.selection.start.line;
        const block = languageBlockAtPosition(tokens, new Position(line, 0));
        if (block) {
          if (isDisplayMath(block)) {
            commands.executeCommand("quarto.previewMath", line);
            return;
          } else if (isDiagram(block)) {
            commands.executeCommand("quarto.previewDiagram", { textEditorLine: line });
            return;
          }
        }
      } else if (isMermaidDoc(doc) || isGraphvizDoc(doc)) {
        commands.executeCommand("quarto.previewDiagram");
        return;
      }
    } else {

      // check for a diagram in the visual editor
      const veDiagram = await visualEditorDiagramState();
      if (veDiagram) {
        await commands.executeCommand("quarto.previewDiagram", {
          state: veDiagram,
          activate: true
        });
      } else {
        // info message
        window.showInformationMessage(
          "No content preview available (selection not within an equation or diagram)"
        );
      }
    }
  }

  private static readonly id = "quarto.previewContentShortcut";
  public readonly id = PreviewContentShortcutCommand.id;
}
