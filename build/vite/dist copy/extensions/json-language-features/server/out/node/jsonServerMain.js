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
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const runner_1 = require("../utils/runner");
const jsonServer_1 = require("../jsonServer");
const request_light_1 = require("request-light");
const vscode_uri_1 = require("vscode-uri");
const fs_1 = require("fs");
const l10n = __importStar(require("@vscode/l10n"));
// Create a connection for the server.
const connection = (0, node_1.createConnection)();
console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);
process.on('unhandledRejection', (e) => {
    connection.console.error((0, runner_1.formatError)(`Unhandled exception`, e));
});
function getHTTPRequestService() {
    return {
        getContent(uri, _encoding) {
            const headers = { 'Accept-Encoding': 'gzip, deflate' };
            return (0, request_light_1.xhr)({ url: uri, followRedirects: 5, headers }).then(response => {
                return response.responseText;
            }, (error) => {
                return Promise.reject(error.responseText || (0, request_light_1.getErrorStatusDescription)(error.status) || error.toString());
            });
        }
    };
}
function getFileRequestService() {
    return {
        async getContent(location, encoding) {
            try {
                const uri = vscode_uri_1.URI.parse(location);
                return (await fs_1.promises.readFile(uri.fsPath, encoding)).toString();
            }
            catch (e) {
                if (e.code === 'ENOENT') {
                    throw new Error(l10n.t('Schema not found: {0}', location));
                }
                else if (e.code === 'EISDIR') {
                    throw new Error(l10n.t('{0} is a directory, not a file', location));
                }
                throw e;
            }
        }
    };
}
const runtime = {
    timer: {
        setImmediate(callback, ...args) {
            const handle = setImmediate(callback, ...args);
            return { dispose: () => clearImmediate(handle) };
        },
        setTimeout(callback, ms, ...args) {
            const handle = setTimeout(callback, ms, ...args);
            return { dispose: () => clearTimeout(handle) };
        }
    },
    file: getFileRequestService(),
    http: getHTTPRequestService(),
    configureHttpRequests: request_light_1.configure
};
(0, jsonServer_1.startServer)(connection, runtime);
//# sourceMappingURL=jsonServerMain.js.map