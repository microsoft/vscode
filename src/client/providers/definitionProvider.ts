'use strict';

import * as vscode from 'vscode';
import * as proxy from './jediProxy';
import * as fs from 'fs';

export class PythonDefinitionProvider implements vscode.DefinitionProvider {
    private jediProxyHandler: proxy.JediProxyHandler<proxy.IDefinitionResult, vscode.Definition>;

    public constructor(context: vscode.ExtensionContext) {
        this.jediProxyHandler = new proxy.JediProxyHandler(context, null, PythonDefinitionProvider.parseData);
    }
    private static parseData(data: proxy.IDefinitionResult): vscode.Definition {
        if (data) {
            var definitionResource = vscode.Uri.file(data.definition.fileName);
            var range = new vscode.Range(data.definition.lineIndex, data.definition.columnIndex, data.definition.lineIndex, data.definition.columnIndex);

            return new vscode.Location(definitionResource, range);
        }
        return null;
    }
    public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Definition> {
        return new Promise<vscode.Definition>((resolve, reject) => {
            var filename = document.fileName;
            if (document.lineAt(position.line).text.match(/^\s*\/\//)) {
                return resolve();
            }
            if (position.character <= 0) {
                return resolve();
            }

            var source = document.getText();
            var range = document.getWordRangeAtPosition(position);
            var columnIndex = range.isEmpty ? position.character : range.end.character;
            var cmd: proxy.ICommand<proxy.IDefinitionResult> = {
                command: proxy.CommandType.Definitions,
                fileName: filename,
                columnIndex: columnIndex,
                lineIndex: position.line,
                source: source
            };

            this.jediProxyHandler.sendCommand(cmd, resolve, token);
        });
    }
}
