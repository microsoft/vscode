/*
 * panel.ts
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

import { ExtensionContext, window, languages, commands } from "vscode";
import { Command } from "../../core/command";
import { kQuartoDocSelector } from "../../core/doc";
import { MarkdownEngine } from "../../markdown/engine";
import { quartoLensCodeLensProvider } from "./codelens";
import { PreviewMathCommand, ShowAssistCommand, CodeViewAssistCommand } from "./commands";
import { QuartoAssistViewProvider } from "./webview";

export function activateQuartoAssistPanel(
  context: ExtensionContext,
  engine: MarkdownEngine
): Command[] {

  // indicate that its okay to show
  commands.executeCommand(
    "setContext",
    QuartoAssistViewProvider.enabledContext,
    true
  );

  const provider = new QuartoAssistViewProvider(context);
  context.subscriptions.push(provider);

  context.subscriptions.push(
    window.registerWebviewViewProvider(
      QuartoAssistViewProvider.viewType,
      provider
    )
  );

  context.subscriptions.push(
    languages.registerCodeLensProvider(
      kQuartoDocSelector,
      quartoLensCodeLensProvider(engine)
    )
  );

  context.subscriptions.push(
    commands.registerCommand("quarto.assist.pin", () => {
      provider.pin();
    })
  );

  context.subscriptions.push(
    commands.registerCommand("quarto.assist.unpin", () => {
      provider.unpin();
    })
  );

  return [
    new ShowAssistCommand(provider),
    new CodeViewAssistCommand(provider),
    new PreviewMathCommand(provider, engine),
  ];
}
