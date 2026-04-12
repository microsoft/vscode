"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
const cssClient_1 = require("../cssClient");
const nodeFs_1 = require("./nodeFs");
const dropOrPasteResource_1 = require("../dropOrPaste/dropOrPasteResource");
let client;
// this method is called when vs code is activated
async function activate(context) {
    const clientMain = vscode_1.extensions.getExtension('vscode.css-language-features')?.packageJSON?.main || '';
    const serverMain = `./server/${clientMain.indexOf('/dist/') !== -1 ? 'dist' : 'out'}/node/cssServerMain`;
    const serverModule = context.asAbsolutePath(serverMain);
    // The debug options for the server
    const debugOptions = { execArgv: ['--nolazy', '--inspect=' + (7000 + Math.round(Math.random() * 999))] };
    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: { module: serverModule, transport: node_1.TransportKind.ipc, options: debugOptions }
    };
    const newLanguageClient = (id, name, clientOptions) => {
        return new node_1.LanguageClient(id, name, serverOptions, clientOptions);
    };
    // pass the location of the localization bundle to the server
    process.env['VSCODE_L10N_BUNDLE_LOCATION'] = vscode_1.l10n.uri?.toString() ?? '';
    client = await (0, cssClient_1.startClient)(context, newLanguageClient, { fs: (0, nodeFs_1.getNodeFSRequestService)(), TextDecoder });
    context.subscriptions.push((0, dropOrPasteResource_1.registerDropOrPasteResourceSupport)({ language: 'css', scheme: '*' }));
}
async function deactivate() {
    if (client) {
        await client.stop();
        client = undefined;
    }
}
//# sourceMappingURL=cssClientMain.js.map