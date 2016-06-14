"use strict";

import * as vscode from "vscode";
import * as sortProvider from "./providers/importSortProvider";
import * as telemetryHelper from "./common/telemetry";
import * as telemetryContracts from "./common/telemetryContracts";

export function activate(context: vscode.ExtensionContext, outChannel: vscode.OutputChannel) {
    let rootDir = context.asAbsolutePath(".");
    let disposable = vscode.commands.registerCommand("python.sortImports", () => {
        let activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.languageId !== "python") {
            vscode.window.showErrorMessage("Please open a Python source file to sort the imports.");
            return;
        }
        let delays = new telemetryHelper.Delays();
        new sortProvider.PythonImportSortProvider().sortImports(rootDir, activeEditor.document).then(changes => {
            if (changes.length === 0) {
                return;
            }

            return activeEditor.edit(builder => {
                changes.forEach(change => builder.replace(change.range, change.newText));
            });
        }).then(() => {
            delays.stop();
            telemetryHelper.sendTelemetryEvent(telemetryContracts.Commands.SortImports, null, delays.toMeasures());
        }).catch(error => {
            let message = typeof error === "string" ? error : (error.message ? error.message : error);
            outChannel.appendLine(error);
            outChannel.show();
            vscode.window.showErrorMessage(message);
        });
    });

    context.subscriptions.push(disposable);
}