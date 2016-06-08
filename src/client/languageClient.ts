'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import { workspace, Disposable, ExtensionContext } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';
import { RequestType } from 'vscode-languageclient';

var pythonLanguageClient: LanguageClient;
export function activate(context: ExtensionContext) {

    // The server is implemented in node
    let serverModule = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
    // The debug options for the server
    let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };
	
    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    }
	
    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: ['python'],
        synchronize: {
            // Synchronize the setting section 'python' to the server
            configurationSection: 'python',
            // Notify the server about file changes to '.clientrc files contain in the workspace
            fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
        }
    }
	
    // Create the language client and start the client.
    pythonLanguageClient = new LanguageClient('Python', serverOptions, clientOptions);
    var disposable = pythonLanguageClient.start();
    
    //Send info as soon as it starts
    var config = workspace.getConfiguration();
    pythonLanguageClient.notifyConfigurationChanged(config)

    var isWin = /^win/.test(process.platform);
    if (isWin) {
        // workspace.onDidSaveTextDocument(onDidSaveTextDocument, this, context.subscriptions);    
    }
    // Push the disposable to the context's subscriptions so that the 
    // client can be deactivated on extension deactivation
    context.subscriptions.push(disposable);
}