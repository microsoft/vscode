/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import { dirname, basename } from 'path';
import * as proxy from './jediProxy';
import * as fs from 'fs';

const mappedTypes = {};
mappedTypes["module"] = vscode.CompletionItemKind.Module;
mappedTypes["class"] = vscode.CompletionItemKind.Class;
mappedTypes["instance"] = vscode.CompletionItemKind.Variable;
mappedTypes["function"] = vscode.CompletionItemKind.Function;
mappedTypes["funcdef"] = vscode.CompletionItemKind.Function;
mappedTypes["property"] = vscode.CompletionItemKind.Property;
mappedTypes["import"] = vscode.CompletionItemKind.Module;
mappedTypes["keyword"] = vscode.CompletionItemKind.Keyword;
mappedTypes["builtin"] = vscode.CompletionItemKind.Keyword;
mappedTypes["statement"] = vscode.CompletionItemKind.Value;
mappedTypes["value"] = vscode.CompletionItemKind.Value;
mappedTypes["variable"] = vscode.CompletionItemKind.Variable;
mappedTypes["param"] = vscode.CompletionItemKind.Variable;
mappedTypes["constant"] = vscode.CompletionItemKind.Variable;

export class PythonCompletionItemProvider implements vscode.CompletionItemProvider {
    public constructor(rootDir: string) {
        proxy.initialize(rootDir);
    }

    private gocodeConfigurationComplete = false;

    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
        return new Promise<vscode.CompletionItem[]>((resolve, reject) => {
            var filename = document.fileName;
            if (document.lineAt(position.line).text.match(/^\s*\/\//)) {
                return resolve([]);
            }
            if (position.character <= 0) {
                return resolve([]);
            }
            //if current character is '(', then ignore it
            var txt = document.getText(new vscode.Range(new vscode.Position(position.line, position.character - 1), position));
            var type = proxy.CommandType.Completions;
            var columnIndex = position.character;
            if (txt === "(") { 
                //return resolve([]);
                //type = proxy.CommandType.Arguments;
                //columnIndex = columnIndex -1;
            }
            var source = document.getText();//fs.realpathSync(filename).toString();
            var cmd: proxy.ICommand = {
                id: new Date().getTime().toString(),
                command: type,
                fileName: filename,
                columnIndex: columnIndex,
                lineIndex: position.line,
                reject: onRejected,
                resolve: onResolved,
                source: source
            };

            console.log(cmd.lineIndex.toString() + ":" + cmd.columnIndex.toString());

            function onRejected(error) {
                if (token.isCancellationRequested) {
                    return resolve([]);
                }
                var y = "";
            }
            function onResolved(data: proxy.ICompletionResult) {
                if (token.isCancellationRequested) {
                    return resolve([]);
                }
                if (data && data.items.length > 0) {
                    var items = data.items.map(item=> {
                        var completionItem = new vscode.CompletionItem(item.text);
                        completionItem.documentation = item.description;
                        if (mappedTypes[item.type]) {
                            completionItem.kind = mappedTypes[item.type];
                        }
                        else {
                            console.error("Unknown type = " + item.type);
                        }

                        return completionItem;
                        //completionItem.kind
                        //completionItem.kind = vscode.CompletionItemKind.Class
                    });
                    resolve(items);
                }
                else {
                    resolve([]);
                }
            }
            proxy.sendCommand(cmd).then(onResolved, onRejected);
        });
    }
}