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

import { Position, Selection, window, commands } from "vscode";
import { Command } from "../../core/command";
import { isQuartoDoc, preserveEditorFocus } from "../../core/doc";
import { MarkdownEngine } from "../../markdown/engine";
import { QuartoAssistViewProvider } from "./webview";
import { CodeViewCellContext } from "../../types/local-types";
import { JsonRpcRequestTransport } from "core";
import { languageBlockAtPosition } from "quarto-core";

export class PreviewMathCommand implements Command {
  private static readonly id = "quarto.previewMath";
  public readonly id = PreviewMathCommand.id;
  constructor(
    private readonly provider_: QuartoAssistViewProvider,
    private readonly engine_: MarkdownEngine
  ) { }
  async execute(line: number): Promise<void> {
    if (window.activeTextEditor) {
      const doc = window.activeTextEditor.document;
      if (isQuartoDoc(doc)) {
        // if selection isn't currently in the block then move it there
        const tokens = this.engine_.parse(doc);
        const block = languageBlockAtPosition(
          tokens,
          new Position(line, 0),
          true
        );
        const selection = window.activeTextEditor.selection;
        if (
          block &&
          (selection.active.line < block.range.start.line ||
            selection.active.line >= block?.range.end.line)
        ) {
          const selPos = new Position(line, 0);
          window.activeTextEditor.selection = new Selection(selPos, selPos);
        }

        activateAssistPanel(this.provider_);
      }
    }
  }
}

export class ShowAssistCommand implements Command {
  private static readonly id = "quarto.showAssist";
  public readonly id = ShowAssistCommand.id;
  constructor(private readonly provider_: QuartoAssistViewProvider) { }
  async execute(): Promise<void> {
    activateAssistPanel(this.provider_);
  }
}


export class CodeViewAssistCommand implements Command {
  private static readonly id = "quarto.codeViewAssist";
  public readonly id = CodeViewAssistCommand.id;
  constructor(private readonly provider_: QuartoAssistViewProvider) { }
  async execute(context: CodeViewCellContext, lspRequest: JsonRpcRequestTransport): Promise<void> {
    this.provider_.codeViewAssist(context, lspRequest);
  }
}



function activateAssistPanel(provider: QuartoAssistViewProvider) {
  // attempt to activate (if we fail to the view has been closed so
  // recreate it by calling focus)
  preserveEditorFocus();
  if (!provider.activate()) {
    commands.executeCommand("quarto-assist.focus");
  }
}
