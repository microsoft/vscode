/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import { dirname, basename } from 'path';
import * as proxy from './jediProxy';
import * as fs from 'fs';

export class PythonRenameProvider implements vscode.RenameProvider {
    public constructor(rootDir: string) {
        proxy.initialize(rootDir);
    }

    private gocodeConfigurationComplete = false;

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

            var source = document.getText();//fs.realpathSync(filename).toString();
            var range = document.getWordRangeAtPosition(position);
            if (range == undefined || range == null || range.isEmpty) {
                return resolve();
            }
            var oldName = document.getText(range);
            if (oldName === newName) {
                return resolve();
            }
            var columnIndex = range.isEmpty ? position.character : range.end.character;
            var cmd: proxy.ICommand = {
                id: new Date().getTime().toString(),
                command: proxy.CommandType.Usages,
                fileName: filename,
                columnIndex: columnIndex,
                lineIndex: position.line,
                reject: onRejected,
                resolve: onResolved,
                source: source
            };

            function onRejected(error) {
                var y = "";
                resolve();
            }

            var definition: proxy.IAutoCompleteItem = null;

            function onResolved(data: proxy.IReferenceResult) {
                if (token.isCancellationRequested) {
                    return resolve()
                }
                if (data && data.references.length > 0) {
                    var references = data.references.filter(ref=> {
                        //return ref.fileName.toLowerCase() === document.fileName.toLowerCase();
                        var relPath = vscode.workspace.asRelativePath(ref.fileName); 
                        // var relativeFilePath = path.relative(vscode.workspace.rootPath, vscode.window.activeTextEditor.document.fileName);
                        // if (relativeFilePath.startsWith('..')) {
                        // 	vscode.window.showErrorMessage("File doesn't belong to the  local repository!");
                        // 	return;
                        // }
                        return !relPath.startsWith("..");
                    });

                    var workSpaceEdit = new vscode.WorkspaceEdit();
                    references.forEach(ref=> {
                        var uri = vscode.Uri.file(document.fileName);
                        var range = new vscode.Range(ref.lineIndex, ref.columnIndex, ref.lineIndex, ref.columnIndex + oldName.length);
                        workSpaceEdit.replace(uri, range, newName);
                    });
                    resolve(workSpaceEdit);
                    // 
                    // var x = new vscode.WorkspaceEdit();
                    // x.replace()
                    //                     var references = data.references.map(ref=> {
                    //                         var definitionResource = vscode.Uri.file(ref.fileName);
                    //                         var range = new vscode.Range(ref.lineIndex, ref.columnIndex, ref.lineIndex, ref.columnIndex);
                    // 
                    //                         return new vscode.Location(definitionResource, range);
                    //                     });
                    // 
                    //                     resolve(references);
                }
                else {
                    resolve();
                }
            }
            proxy.sendCommand(cmd).then(onResolved, onRejected);
        });
    }
}
