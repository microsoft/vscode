/*
 * main.ts
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

import * as vscode from "vscode";
import * as path from "path";
import { MarkdownEngine } from "./markdown/engine";
import { kQuartoDocSelector } from "./core/doc";
import { activateLsp, deactivate as deactivateLsp } from "./lsp/client";
import { cellCommands } from "./providers/cell/commands";
import { quartoCellExecuteCodeLensProvider } from "./providers/cell/codelens";
import { activateQuartoAssistPanel } from "./providers/assist/panel";
import { activateCommon } from "./extension";
import { activatePreview } from "./providers/preview/preview";
import { activateRender } from "./providers/render";
import { activateStatusBar } from "./providers/statusbar";
import { walkthroughCommands } from "./providers/walkthrough";
import { activateLuaTypes } from "./providers/lua-types";
import { activateCreate } from "./providers/create/create";
import { activateCopyFiles } from "./providers/copyfiles";
import { quartoInlineOutputManager } from "./providers/output/inlineOutputManager";
import { activateZotero } from "./providers/zotero/zotero";;
import { extensionHost } from "./host";
import { initQuartoContext } from "quarto-core";
import { configuredQuartoPath } from "./core/quarto";
import { activateDenoConfig } from "./providers/deno-config";

export async function activate(context: vscode.ExtensionContext) {  
  try {
  
  // create output channel for extension logs and lsp client logs
  const outputChannel = vscode.window.createOutputChannel("Quarto", { log: true });

  outputChannel.info("Activating Quarto extension.");
  console.log('Quarto: Created output channel');

  // create extension host
  console.log('Quarto: Creating extension host');
  const host = extensionHost();
  console.log('Quarto: Extension host created successfully');

  // create markdown engine
  const engine = new MarkdownEngine();

  // commands
  const commands = cellCommands(host, engine);

  // get quarto context (some features conditional on it)
  const quartoPath = await configuredQuartoPath();
  const workspaceFolder = vscode.workspace.workspaceFolders?.length
    ? vscode.workspace.workspaceFolders[0].uri.fsPath
    : undefined;
  const quartoContext = initQuartoContext(
    quartoPath,
    workspaceFolder,
    // Look for quarto in the app root; this is where Positron installs it
    [path.join(vscode.env.appRoot, 'quarto', 'bin')],
    vscode.window.showWarningMessage
  );
  if (quartoContext.available) {
    // enable commands conditional on quarto installation
    vscode.commands.executeCommand(
      "setContext",
      "quartoAvailable",
      true
    );

    // ensure quarto is on the path
    context.environmentVariableCollection.prepend(
      "PATH",
      quartoContext.binPath + path.delimiter
    );

    // status bar
    activateStatusBar(quartoContext);

    // lua types
    await activateLuaTypes(context, quartoContext);

    // deno config
    activateDenoConfig(context, engine);

    // lsp
    let lspClient;
    try {
      lspClient = await activateLsp(context, quartoContext, engine, outputChannel);
    } catch (error) {
      throw error;
    }

    // zotero
    const zoteroCommands = await activateZotero(context, lspClient);
    commands.push(...zoteroCommands);

    // assist panel
    const assistCommands = activateQuartoAssistPanel(context, engine);
    commands.push(...assistCommands);
  }
  
  // walkthough
  const walkthroughCmds = walkthroughCommands(host, quartoContext);
  commands.push(...walkthroughCmds);

  // provide render
  const renderCommands = activateRender(quartoContext, engine);
  commands.push(...renderCommands);

  // provide preview
  const previewCommands = activatePreview(context, host, quartoContext, engine);
  commands.push(...previewCommands);

  // provide create
  const createCommands = await activateCreate(context, quartoContext);
  commands.push(...createCommands);

  // provide code lens
  vscode.languages.registerCodeLensProvider(
    kQuartoDocSelector,
    quartoCellExecuteCodeLensProvider(host, engine)
  );

  // provide file copy/drop handling
  activateCopyFiles(context);

  // register handler for inline outputs from runtime
  const quartoInlineOutputDisposable = vscode.commands.registerCommand(
    'quarto.handleInlineOutput',
    (output: any) => {
      quartoInlineOutputManager.handleRuntimeOutput(output);
    }
  );
  context.subscriptions.push(quartoInlineOutputDisposable);

  // register handler to check if execution is from Quarto
  const quartoExecutionCheckDisposable = vscode.commands.registerCommand(
    'quarto.isQuartoExecution',
    (executionId: string) => {
      return quartoInlineOutputManager.isQuartoExecution(executionId);
    }
  );
  context.subscriptions.push(quartoExecutionCheckDisposable);

  // activate providers common to browser/node
  activateCommon(context, host, engine, commands);

  outputChannel.info("Activated Quarto extension.");
  
  } catch (error) {
    throw error;
  }
}

export async function deactivate() {
  return deactivateLsp();
}
