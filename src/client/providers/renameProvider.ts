'use strict';

import * as vscode from 'vscode';
import * as proxy from './jediProxy';

var _oldName = "";
var _newName = "";

export class PythonRenameProvider implements vscode.RenameProvider {
    private jediProxyHandler: proxy.JediProxyHandler<proxy.IReferenceResult, vscode.WorkspaceEdit>;

    public constructor(context: vscode.ExtensionContext) {
        this.jediProxyHandler = new proxy.JediProxyHandler(context, null, PythonRenameProvider.parseData);
    }
    private static parseData(data: proxy.IReferenceResult): vscode.WorkspaceEdit {
        if (data && data.references.length > 0) {
            var references = data.references.filter(ref => {
                var relPath = vscode.workspace.asRelativePath(ref.fileName);
                return !relPath.startsWith("..");
            });

            var workSpaceEdit = new vscode.WorkspaceEdit();
            references.forEach(ref => {
                var uri = vscode.Uri.file(ref.fileName);
                var range = new vscode.Range(ref.lineIndex, ref.columnIndex, ref.lineIndex, ref.columnIndex + _oldName.length);
                workSpaceEdit.replace(uri, range, _newName);
            });
            return workSpaceEdit;
        }
        return;
    }
    public provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): Thenable<vscode.WorkspaceEdit> {
        return vscode.workspace.saveAll(false).then(() => {
            return this.doRename(document, position, newName, token);
        });
    }

    private doRename(document: vscode.TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): Thenable<vscode.WorkspaceEdit> {
        return new Promise<vscode.WorkspaceEdit>((resolve, reject) => {
            var filename = document.fileName;
            if (document.lineAt(position.line).text.match(/^\s*\/\//)) {
                return resolve();
            }
            if (position.character <= 0) {
                return resolve();
            }

            var source = document.getText();
            var range = document.getWordRangeAtPosition(position);
            if (range == undefined || range == null || range.isEmpty) {
                return resolve();
            }
            _oldName = document.getText(range);
            _newName = newName;
            if (_oldName === newName) {
                return resolve();
            }

            var columnIndex = range.isEmpty ? position.character : range.end.character;
            var cmd: proxy.ICommand<proxy.IReferenceResult> = {
                command: proxy.CommandType.Usages,
                fileName: filename,
                columnIndex: columnIndex,
                lineIndex: position.line,
                source: source
            };

            this.jediProxyHandler.sendCommand(cmd, resolve, token);
        });
    }
}
