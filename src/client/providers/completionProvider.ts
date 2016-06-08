'use strict';

import * as vscode from 'vscode';
import * as proxy from './jediProxy';

export class PythonCompletionItemProvider implements vscode.CompletionItemProvider {
    private jediProxyHandler: proxy.JediProxyHandler<proxy.ICompletionResult, vscode.CompletionItem[]>;

    public constructor(context: vscode.ExtensionContext) {
        this.jediProxyHandler = new proxy.JediProxyHandler(context, [], PythonCompletionItemProvider.parseData);
    }
    private static parseData(data: proxy.ICompletionResult): vscode.CompletionItem[] {
        if (data && data.items.length > 0) {
            return data.items.map(item => {
                var completionItem = new vscode.CompletionItem(item.text);
                completionItem.documentation = item.description;
                return completionItem;
            });
        }
        return [];
    }
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        return new Promise<vscode.CompletionItem[]>((resolve, reject) => {
            var filename = document.fileName;
            if (document.lineAt(position.line).text.match(/^\s*\/\//)) {
                return resolve([]);
            }
            if (position.character <= 0) {
                return resolve([]);
            }

            var txt = document.getText(new vscode.Range(new vscode.Position(position.line, position.character - 1), position));
            var type = proxy.CommandType.Completions;
            var columnIndex = position.character;

            var source = document.getText();
            var cmd: proxy.ICommand<proxy.ICommandResult> = {
                command: type,
                fileName: filename,
                columnIndex: columnIndex,
                lineIndex: position.line,
                source: source
            };

            this.jediProxyHandler.sendCommand(cmd, resolve, token);
        });
    }
}