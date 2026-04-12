"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode_1 = require("vscode");
const cssClient_1 = require("../cssClient");
const browser_1 = require("vscode-languageclient/browser");
const dropOrPasteResource_1 = require("../dropOrPaste/dropOrPasteResource");
let client;
// this method is called when vs code is activated
async function activate(context) {
    const serverMain = vscode_1.Uri.joinPath(context.extensionUri, 'server/dist/browser/cssServerMain.js');
    try {
        const worker = new Worker(serverMain.toString());
        worker.postMessage({ i10lLocation: vscode_1.l10n.uri?.toString(false) ?? '' });
        const newLanguageClient = (id, name, clientOptions) => {
            return new browser_1.LanguageClient(id, name, worker, clientOptions);
        };
        client = await (0, cssClient_1.startClient)(context, newLanguageClient, { TextDecoder });
        context.subscriptions.push((0, dropOrPasteResource_1.registerDropOrPasteResourceSupport)({ language: 'css', scheme: '*' }));
    }
    catch (e) {
        console.log(e);
    }
}
async function deactivate() {
    if (client) {
        await client.stop();
        client = undefined;
    }
}
//# sourceMappingURL=cssClientMain.js.map