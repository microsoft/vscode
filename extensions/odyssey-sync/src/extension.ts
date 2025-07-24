/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Incanus Technologies Ltd.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { debounce } from "./utils";

/**
 * Calls the Odyssey Sync API to soft-commit files.
 * Shows progress and handles errors with user feedback.
 */
async function commitFilesWithProgress() {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Saving...",
      cancellable: false,
    },
    async () => {
      try {
        const response = await fetch("http://localhost:6123/soft-commit", { method: "POST" });
        if (!response.ok) {
          throw new Error("API error: " + response.status);
        }
        vscode.window.showInformationMessage("File saved successfully!");
      } catch (err: any) {
        vscode.window
          .showErrorMessage("Unable to save file", "Manage Extension")
          .then((selection: string | undefined) => {
            if (selection === "Manage Extension") {
              vscode.commands.executeCommand("extension.open", "newton-school.odyssey-sync");
              vscode.commands.executeCommand("odyssey-sync.manageExtension");
            }
          });
      }
    }
  );
}

/**
 * Returns the HTML content for the Odyssey Sync management webview.
 */
function getManageExtensionHtml(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Odyssey Sync Extension Management</title>
      <style>
        body {
          color: var(--vscode-foreground);
          background-color: var(--vscode-editor-background);
          font-family: var(--vscode-font-family, sans-serif);
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 40px;
          padding: 32px;
        }
        h1 {
          color: var(--vscode-titleBar-activeForeground, var(--vscode-foreground));
          margin-bottom: 16px;
          font-size: 1.5em;
        }
        .warning {
          color: var(--vscode-editorWarning-foreground, #b89500);
          font-weight: bold;
          margin-bottom: 12px;
        }
        p {
          color: var(--vscode-descriptionForeground, var(--vscode-foreground));
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Odyssey Sync Extension</h1>
        <div class="warning">⚠️ Caution: Please do not disable or uninstall this extension.</div>
        <p>This extension is required for proper operation. Disabling or removing it may cause some important features to stop working.</p>
      </div>
    </body>
    </html>
  `;
}

export function activate(context: vscode.ExtensionContext) {
  // Register the debounced commit command
  const debouncedCommit = debounce(commitFilesWithProgress, 500);
  const commitDisposable = vscode.commands.registerCommand("odyssey-sync.commitFiles", debouncedCommit);

  // Register the manage extension command
  const manageExtensionDisposable = vscode.commands.registerCommand("odyssey-sync.manageExtension", () => {
    const panel = vscode.window.createWebviewPanel(
      "odysseySyncManage",
      "Odyssey Sync Extension Management",
      vscode.ViewColumn.One,
      { enableScripts: false }
    );
    panel.webview.html = getManageExtensionHtml();
  });

  context.subscriptions.push(commitDisposable, manageExtensionDisposable);
}

export function deactivate() {}
