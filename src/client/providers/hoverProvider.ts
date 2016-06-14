'use strict';

import * as vscode from 'vscode';
import * as proxy from './jediProxy';
import * as telemetryContracts from "../common/telemetryContracts";


export class PythonHoverProvider implements vscode.HoverProvider {
    private jediProxyHandler: proxy.JediProxyHandler<proxy.ICompletionResult, vscode.Hover>;

    public constructor(context: vscode.ExtensionContext) {
        this.jediProxyHandler = new proxy.JediProxyHandler(context, null, PythonHoverProvider.parseData);
    }
    private static parseData(data: proxy.ICompletionResult) {
        if (data && data.items.length > 0) {
            var definition = data.items[0];

            var txt = definition.description || definition.text;
            return new vscode.Hover({ language: "python", value: txt });
        }
        return null;
    }
    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Hover> {
        return new Promise<vscode.Hover>((resolve, reject) => {
            var filename = document.fileName;
            if (document.lineAt(position.line).text.match(/^\s*\/\//)) {
                return resolve();
            }
            if (position.character <= 0) {
                return resolve();
            }

            var source = document.getText();
            var range = document.getWordRangeAtPosition(position);
            if (range == undefined || range.isEmpty) {
                return resolve();
            }
            var columnIndex = range.end.character;
            var cmd: proxy.ICommand<proxy.ICompletionResult> = {
                telemetryEvent: telemetryContracts.IDE.HoverDefinition,
                command: proxy.CommandType.Completions,
                fileName: filename,
                columnIndex: columnIndex,
                lineIndex: position.line,
                source: source
            };

            this.jediProxyHandler.sendCommand(cmd, resolve, token);
        });
    }
}
