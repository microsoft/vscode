"use strict";

// Solution for auto-formatting borrowed from the "go" language VSCode extension.

import * as vscode from "vscode";
import {BaseFormatter} from "./../formatters/baseFormatter";
import {YapfFormatter} from "./../formatters/yapfFormatter";
import {AutoPep8Formatter} from "./../formatters/autoPep8Formatter";
import * as settings from "./../common/configSettings";
import * as telemetryHelper from "../common/telemetry";
import * as telemetryContracts from "../common/telemetryContracts";

export function activateFormatOnSaveProvider(languageFilter: vscode.DocumentFilter, context: vscode.ExtensionContext, settings: settings.IPythonSettings, outputChannel: vscode.OutputChannel) {
    let rootDir = context.asAbsolutePath(".");
    let formatters = new Map<string, BaseFormatter>();
    let pythonSettings = settings;

    let yapfFormatter = new YapfFormatter(outputChannel);
    let autoPep8 = new AutoPep8Formatter(outputChannel);

    formatters.set(yapfFormatter.Id, yapfFormatter);
    formatters.set(autoPep8.Id, autoPep8);

    // This is really ugly.  I'm not sure we can do better until
    // Code supports a pre-save event where we can do the formatting before
    // the file is written to disk.	
    let ignoreNextSave = new WeakSet<vscode.TextDocument>();

    let subscription = vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId !== languageFilter.language || ignoreNextSave.has(document)) {
            return;
        }
        let textEditor = vscode.window.activeTextEditor;
        if (pythonSettings.formatting.formatOnSave && textEditor.document === document) {
            let formatter = formatters.get(pythonSettings.formatting.provider);
            let delays = new telemetryHelper.Delays();

            formatter.formatDocument(document, null, null).then(edits => {
                if (edits.length === 0) return false;
                return textEditor.edit(editBuilder => {
                    edits.forEach(edit => editBuilder.replace(edit.range, edit.newText));
                });
            }).then(applied => {
                delays.stop();
                telemetryHelper.sendTelemetryEvent(telemetryContracts.IDE.Format, { Format_Provider: formatter.Id, Format_OnSave: "true" }, delays.toMeasures());
                ignoreNextSave.add(document);
                return applied ? document.save() : true;
            }).then(() => {
                ignoreNextSave.delete(document);
            }, () => {
                // Catch any errors and ignore so that we still trigger 
                // the file save.
            });
        }
    }, null, null);

    context.subscriptions.push(subscription);
}
