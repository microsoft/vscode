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

export class PythonSymbolProvider implements vscode.DocumentSymbolProvider {
    public constructor(rootDir: string) {
        proxy.initialize(rootDir);
    }

    private gocodeConfigurationComplete = false;

    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
        return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
            var filename = document.fileName;

            var source = document.getText();//fs.realpathSync(filename).toString();
            var cmd: proxy.ICommand = {
                id: new Date().getTime().toString(),
                command: proxy.CommandType.Symbols,
                fileName: filename,
                columnIndex: 0,
                lineIndex: 0,
                reject: onRejected,
                resolve: onResolved,
                source: source
            };

            function onRejected(error) {
                var y = "";
            }

            var definition: proxy.IAutoCompleteItem = null;

            function onResolved(data: proxy.ISymbolResult) {
                if (token.isCancellationRequested) {
                    return resolve()
                } 
                if (data) {                    
                    // var definitionResource = vscode.Uri.file(data.definition.fileName);
                    // var range = new vscode.Range(data.definition.lineIndex, data.definition.columnIndex, data.definition.lineIndex, data.definition.columnIndex);
                    // 
                    //resolve(new vscode.Location(definitionResource, range));
                    var symbols = data.definitions.map(sym=>{
                        var symbol = mappedTypes[sym.type] || vscode.SymbolKind.Variable;
                        var range = new vscode.Range(sym.lineIndex, sym.columnIndex, sym.lineIndex, sym.columnIndex);
                        
                        return new vscode.SymbolInformation(sym.text, symbol, range, vscode.Uri.file(sym.fileName) );
                    });
                    
                    resolve(symbols);
                }
                else {
                    resolve();
                }
            }
            proxy.sendCommand(cmd).then(onResolved, onRejected);
        });
    }
}
