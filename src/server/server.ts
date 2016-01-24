/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
IPCMessageReader, IPCMessageWriter,
createConnection, IConnection, TextDocumentSyncKind,
TextDocuments, ITextDocument, Diagnostic, DiagnosticSeverity,
InitializeParams, InitializeResult, TextDocumentIdentifier,
CompletionItem, CompletionItemKind, PublishDiagnosticsParams
} from 'vscode-languageserver';
import * as vscodeLanguageServer from 'vscode-languageserver';
import * as pylinter from './linters/pylint';

// Create a connection for the server. The connection uses 
// stdin / stdout for message passing
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
var itHappened = "";
// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind,
            // Tell the client that the server support code complete
            completionProvider: {
                resolveProvider: true
            }
        }
    }
});
 
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});

// The settings interface describe the server relevant settings part
interface Settings {
    python: PythonSettings;
}

// These are the example settings we defined in the client's package.json
// file
interface PythonSettings {
    maxNumberOfProblems: number;
}
var pythonSettings:any = {};
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
    let settings = <Settings>change.settings;
    pythonSettings = settings.python;
    // Revalidate any open text documents
    documents.all().forEach(validateTextDocument);   
    
});

function validateTextDocument(textDocument: ITextDocument): void {
    let diagnostics: Diagnostic[] = [];
    var isWin = /^win/.test(process.platform);
    if (!isWin){
        return;
    }
    if (pythonSettings.linting.enabled || (pythonSettings.linting.pylintEnabled && pythonSettings.linting.pep8Enabled)){
        return;
    }
    
    var pep8Messages = [];
    var pylintMessages = [];
    var pep8Done = false;
    var pylintDone= false;
    if (pythonSettings.linting.pylintEnabled){
        new pylinter.Linter().run(textDocument, pythonSettings, false).then((d) => {
            pylintDone = true;
            if (pythonSettings.linting.pep8Enabled){
                d.forEach(d=>d.message = d.message + " (pylint)");
                if (pep8Done){
                    d.forEach(d=>pep8Messages.push(d));
                    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: pep8Messages });                
                }
                else {
                    pylintMessages = d;
                }
            }
            else {
                connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: d });
            }
        });
    }
    if (pythonSettings.linting.pep8Enabled){
        new pylinter.Linter().run(textDocument, pythonSettings, false).then((d) => {
            pylintDone = true;
            if (pythonSettings.linting.pylintEnabled){
                d.forEach(d=>d.message = d.message + " (pep8)");
                if (pylintDone){
                    d.forEach(d=>pylintMessages.push(d));
                    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: pylintMessages });                
                }
                else {
                    pep8Messages = d;
                }
            }
            else {
                connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: d });
            }
        });
    }
}
// 

connection.onDidChangeWatchedFiles((change) => {
    // Monitored files have change in VSCode
    // connection.console.log('We recevied an file change event');
});

// 
// // This handler provides the initial list of the completion items.
// connection.onCompletion((textDocumentPosition: TextDocumentIdentifier): CompletionItem[] => {
//     // The pass parameter contains the position of the text document in 
//     // which code complete got requested. For the example we ignore this
//     // info and always provide the same completion items.
//     return [];
//     //     {
//     //         label: 'TypeScript',
//     //         kind: CompletionItemKind.Text,
//     //         data: 1
//     //     },
//     //     {
//     //         label: 'JavaScript',
//     //         kind: CompletionItemKind.Text,
//     //         data: 2
//     //     }
//     // ]
// });
// 
// // This handler resolve additional information for the item selected in
// // the completion list.
// connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
//     // if (item.data === 1) {
//     //     item.detail = 'TypeScript details',
//     //         item.documentation = 'TypeScript documentation'
//     // } else if (item.data === 2) {
//     //     item.detail = 'JavaScript details',
//     //         item.documentation = 'JavaScript documentation'
//     // }
//     // return item;
//     return item;
// });

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});

connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.uri} closed.`);
});
*/

// Listen on the connection
connection.listen();