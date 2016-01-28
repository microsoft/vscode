// /*---------------------------------------------------------
//  * Copyright (C) Microsoft Corporation. All rights reserved.
//  *--------------------------------------------------------*/
// 
// 'use strict';
// 
// import * as vscode from 'vscode';
// import * as proxy from './jediProxy';
// 
// var _oldName = "";
// var _newName = "";
// 
// function parseData(data: proxy.IReferenceResult): vscode.SignatureHelp {
//     if (data && data.references.length > 0) {
//         var references = data.references.filter(ref=> {
//             var relPath = vscode.workspace.asRelativePath(ref.fileName);
//             return !relPath.startsWith("..");
//         });
// 
//         var workSpaceEdit = new vscode.WorkspaceEdit();
//         references.forEach(ref=> {
//             var uri = vscode.Uri.file(ref.fileName);
//             var range = new vscode.Range(ref.lineIndex, ref.columnIndex, ref.lineIndex, ref.columnIndex + _oldName.length);
//             workSpaceEdit.replace(uri, range, _newName);
//         });
//         return workSpaceEdit;
//     }
//     return;
// }
// 
// export class PythonSignatureHelpProvider implements vscode.SignatureHelpProvider {
//     private jediProxyHandler: proxy.JediProxyHandler<proxy.IReferenceResult, vscode.WorkspaceEdit>;
// 
//     public constructor(context: vscode.ExtensionContext) {
//         this.jediProxyHandler = new proxy.JediProxyHandler(context, null, parseData);
//     }
// 
//     public provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.SignatureHelp> {
//         return new Promise<vscode.SignatureHelp>((resolve, reject) => {
//             var filename = document.fileName;
//             if (document.lineAt(position.line).text.match(/^\s*\/\//)) {
//                 return resolve();
//             }
//             if (position.character <= 0) {
//                 return resolve();
//             }
//             //if current character is '(', then ignore it
//             var txt = document.getText(new vscode.Range(new vscode.Position(position.line, position.character - 1), position));
//             if (txt !== "(") {
//                 return resolve();
//             }
// 
//             var help = new vscode.SignatureHelp();
//             var signatureInfo = new vscode.SignatureInformation("Join", "Do some joining");
//             var parameters = [];
//             parameters.push(new vscode.ParameterInformation("item", "something"));
//             parameters.push(new vscode.ParameterInformation("item2", "something2"));
//             signatureInfo.parameters = parameters;
// 
//             help.activeParameter = parameters[0];
//             resolve(help);
//         });
//     }
// }