"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const nodeFs_1 = require("./nodeFs");
const vscode_1 = require("vscode");
const htmlClient_1 = require("../htmlClient");
const node_1 = require("vscode-languageclient/node");
const fs = __importStar(require("fs"));
const extension_telemetry_1 = __importDefault(require("@vscode/extension-telemetry"));
let telemetry;
let client;
// this method is called when vs code is activated
async function activate(context) {
    const clientPackageJSON = getPackageInfo(context);
    telemetry = new extension_telemetry_1.default(clientPackageJSON.aiKey);
    const serverMain = `./server/${clientPackageJSON.main.indexOf('/dist/') !== -1 ? 'dist' : 'out'}/node/htmlServerMain`;
    const serverModule = context.asAbsolutePath(serverMain);
    // The debug options for the server
    const debugOptions = { execArgv: ['--nolazy', '--inspect=' + (8000 + Math.round(Math.random() * 999))] };
    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: { module: serverModule, transport: node_1.TransportKind.ipc, options: debugOptions }
    };
    const newLanguageClient = (id, name, clientOptions) => {
        return new node_1.LanguageClient(id, name, serverOptions, clientOptions);
    };
    const timer = {
        setTimeout(callback, ms, ...args) {
            const handle = setTimeout(callback, ms, ...args);
            return { dispose: () => clearTimeout(handle) };
        }
    };
    // pass the location of the localization bundle to the server
    process.env['VSCODE_L10N_BUNDLE_LOCATION'] = vscode_1.l10n.uri?.toString() ?? '';
    client = await (0, htmlClient_1.startClient)(context, newLanguageClient, { fileFs: (0, nodeFs_1.getNodeFileFS)(), TextDecoder, telemetry, timer });
}
async function deactivate() {
    if (client) {
        await client.dispose();
        client = undefined;
    }
}
function getPackageInfo(context) {
    const location = context.asAbsolutePath('./package.json');
    try {
        return JSON.parse(fs.readFileSync(location).toString());
    }
    catch (e) {
        console.log(`Problems reading ${location}: ${e}`);
        return { name: '', version: '', aiKey: '', main: '' };
    }
}
//# sourceMappingURL=htmlClientMain.js.map