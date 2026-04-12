"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode_1 = require("vscode");
const jsonClient_1 = require("../jsonClient");
const browser_1 = require("vscode-languageclient/browser");
let client;
// this method is called when vs code is activated
async function activate(context) {
    const serverMain = vscode_1.Uri.joinPath(context.extensionUri, 'server/dist/browser/jsonServerMain.js');
    try {
        const worker = new Worker(serverMain.toString());
        worker.postMessage({ i10lLocation: vscode_1.l10n.uri?.toString(false) ?? '' });
        const newLanguageClient = (id, name, clientOptions) => {
            return new browser_1.LanguageClient(id, name, worker, clientOptions);
        };
        const schemaRequests = {
            getContent(uri) {
                return fetch(uri, { mode: 'cors' })
                    .then(function (response) {
                    return response.text();
                });
            }
        };
        const timer = {
            setTimeout(callback, ms, ...args) {
                const handle = setTimeout(callback, ms, ...args);
                return { dispose: () => clearTimeout(handle) };
            }
        };
        const logOutputChannel = vscode_1.window.createOutputChannel(jsonClient_1.languageServerDescription, { log: true });
        context.subscriptions.push(logOutputChannel);
        client = await (0, jsonClient_1.startClient)(context, newLanguageClient, { schemaRequests, timer, logOutputChannel });
    }
    catch (e) {
        console.log(e);
    }
}
async function deactivate() {
    if (client) {
        await client.dispose();
        client = undefined;
    }
}
//# sourceMappingURL=jsonClientMain.js.map