'use strict';

//Solution for auto-formatting borrowed from the "go" language VSCode extension.

import * as vscode from 'vscode';
import {BaseFormatter} from './../formatters/baseFormatter';
import {YapfFormatter} from './../formatters/yapfFormatter';
import {AutoPep8Formatter} from './../formatters/autoPep8Formatter';
import * as settings from './../common/configSettings';

export function activateFormatOnSaveProvider(languageFilter: vscode.DocumentFilter, context: vscode.ExtensionContext, settings: settings.IPythonSettings, outputChannel: vscode.OutputChannel) {
    let rootDir = context.asAbsolutePath(".");
    let formatters = new Map<string, BaseFormatter>();
    let pythonSettings = settings;

    var yapfFormatter = new YapfFormatter(outputChannel);
    var autoPep8 = new AutoPep8Formatter(outputChannel);

    formatters.set(yapfFormatter.Id, yapfFormatter);
    formatters.set(autoPep8.Id, autoPep8);

    // TODO: This is really ugly.  I'm not sure we can do better until
    // Code supports a pre-save event where we can do the formatting before
    // the file is written to disk.	
    let ignoreNextSave = new WeakSet<vscode.TextDocument>();

    var subscription = vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId !== languageFilter.language || ignoreNextSave.has(document)) {
            return;
        }
        let textEditor = vscode.window.activeTextEditor;
        if (pythonSettings.formatting.formatOnSave && textEditor.document === document) {
            var formatter = formatters.get(pythonSettings.formatting.provider);
            formatter.formatDocument(document, null, null).then(edits => {
                return textEditor.edit(editBuilder => {
                    edits.forEach(edit => editBuilder.replace(edit.range, edit.newText));
                });
            }).then(applied => {
                ignoreNextSave.add(document);
                return document.save();
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
