/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import { dirname, basename } from 'path';
import * as proxy from './jediProxy';
import * as fs from 'fs';

export class PythonHoverProvider implements vscode.HoverProvider {
    public constructor(rootDir: string) {
        proxy.initialize(rootDir);
    }

    private gocodeConfigurationComplete = false;

    public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Hover> {
        return new Promise<vscode.Hover>((resolve, reject) => {
            var filename = document.fileName;
            if (document.lineAt(position.line).text.match(/^\s*\/\//)) {
                return resolve();
            }
            if (position.character <= 0) {
                return resolve();
            }

            var source = document.getText();//fs.realpathSync(filename).toString();
            var range = document.getWordRangeAtPosition(position);
            var columnIndex = (range === undefined || range === null || range.isEmpty) ? position.character : range.end.character;
            var cmd: proxy.ICommand = {
                id: new Date().getTime().toString(),
                command: proxy.CommandType.Completions,
                fileName: filename,
                columnIndex: columnIndex,
                lineIndex: position.line,
                reject: onRejected,
                resolve: onResolved,
                source: source
            };

            var cmdArgs: proxy.ICommand = {
                id: new Date().getTime().toString() + "X",
                command: proxy.CommandType.Arguments,
                fileName: filename,
                columnIndex: columnIndex + 1,
                lineIndex: position.line,
                reject: onRejected,
                resolve: onResolved,
                source: source
            };

            function onRejected(error) {
                var y = "";
            }

            var definition: proxy.IAutoCompleteItem = null;

            function onResolved(data: proxy.ICompletionResult) {
                if (token.isCancellationRequested) {
                    return resolve()
                }
                if (data && data.items.length > 0) {
                    definition = data.items[0];

                    var txt = definition.description || definition.text;
                    var item = new vscode.Hover({ language: "python", value: txt });

                    resolve(item);
                }
                else {
                    resolve();
                }
            }
            function onResolvedArgs(data: proxy.ICompletionResult) {
                if (token.isCancellationRequested) {
                    return resolve()
                }
                if (data && data.items.length > 0) {
                    definition = data.items[0];
                    resolve();
                }
                else {
                    resolve();
                }
            }
            proxy.sendCommand(cmd).then(onResolved, onRejected);
            //proxy.sendCommand(cmdArgs).then(onResolvedArgs, onRejected);
        });
    }
}
