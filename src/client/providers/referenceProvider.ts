'use strict';

import * as vscode from 'vscode';
import * as proxy from './jediProxy';
import * as telemetryContracts from "../common/telemetryContracts";


export class PythonReferenceProvider implements vscode.ReferenceProvider {
    private jediProxyHandler: proxy.JediProxyHandler<proxy.IReferenceResult, vscode.Location[]>;

    public constructor(context: vscode.ExtensionContext) {
        this.jediProxyHandler = new proxy.JediProxyHandler(context, null, PythonReferenceProvider.parseData);
    }
    private static parseData(data: proxy.IReferenceResult): vscode.Location[] {
        if (data && data.references.length > 0) {
            var references = data.references.map(ref => {
                var definitionResource = vscode.Uri.file(ref.fileName);
                var range = new vscode.Range(ref.lineIndex, ref.columnIndex, ref.lineIndex, ref.columnIndex);

                return new vscode.Location(definitionResource, range);
            });

            return references;
        }
        return [];
    }

    public provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
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
            var cmd: proxy.ICommand<proxy.IReferenceResult> = {
                telemetryEvent: telemetryContracts.IDE.Reference,
                command: proxy.CommandType.Usages,
                fileName: filename,
                columnIndex: columnIndex,
                lineIndex: position.line,
                source: source
            };

            var definition: proxy.IAutoCompleteItem = null;

            this.jediProxyHandler.sendCommand(cmd, resolve, token);
        });
    }
}
