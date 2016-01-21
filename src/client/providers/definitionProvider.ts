/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import { dirname, basename } from 'path';
import * as proxy from './jediProxy';
import * as fs from 'fs';

export class PythonDefinitionProvider implements vscode.DefinitionProvider {
    public constructor(rootDir: string) {
        proxy.initialize(rootDir);
    }

    private gocodeConfigurationComplete = false;

    public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Definition> {
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
                command: proxy.CommandType.Definitions,
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

            function onResolved(data: proxy.IDefinitionResult) {
                if (token.isCancellationRequested) {
                    return resolve()
                } 
                if (data) {                    
                    var definitionResource = vscode.Uri.file(data.definition.fileName);
                    var range = new vscode.Range(data.definition.lineIndex, data.definition.columnIndex, data.definition.lineIndex, data.definition.columnIndex);

                    resolve(new vscode.Location(definitionResource, range));
                }
                else {
                    resolve();
                }
            }
            proxy.sendCommand(cmd).then(onResolved, onRejected);
        });
    }
}
