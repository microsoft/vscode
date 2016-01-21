/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import { dirname, basename } from 'path';
import * as proxy from './jediProxy';
import * as fs from 'fs';

export class PythonReferenceProvider implements vscode.ReferenceProvider {
    public constructor(rootDir: string) {
        proxy.initialize(rootDir);
    }

    private gocodeConfigurationComplete = false;

    public provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
        return new Promise<vscode.Definition>((resolve, reject) => {
            var filename = document.fileName;
            if (document.lineAt(position.line).text.match(/^\s*\/\//)) {
                return resolve();
            }
            if (position.character <= 0) {
                return resolve();
            }

            var source = document.getText();//fs.realpathSync(filename).toString();
            var range = document.getWordRangeAtPosition(position);
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
            }

            var definition: proxy.IAutoCompleteItem = null;

            function onResolved(data: proxy.IReferenceResult) {
                if (token.isCancellationRequested) {
                    return resolve()
                }
                if (data && data.references.length > 0) {
                    var references = data.references.map(ref=> {
                        var definitionResource = vscode.Uri.file(ref.fileName);
                        var range = new vscode.Range(ref.lineIndex, ref.columnIndex, ref.lineIndex, ref.columnIndex);

                        return new vscode.Location(definitionResource, range);
                    });

                    resolve(references);
                }
                else {
                    resolve();
                }
            }
            proxy.sendCommand(cmd).then(onResolved, onRejected);
        });
    }
}
