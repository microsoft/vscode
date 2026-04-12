"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const browser_1 = require("vscode-languageserver/browser");
const jsonServer_1 = require("../jsonServer");
const messageReader = new browser_1.BrowserMessageReader(self);
const messageWriter = new browser_1.BrowserMessageWriter(self);
const connection = (0, browser_1.createConnection)(messageReader, messageWriter);
console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);
const runtime = {
    timer: {
        setImmediate(callback, ...args) {
            const handle = setTimeout(callback, 0, ...args);
            return { dispose: () => clearTimeout(handle) };
        },
        setTimeout(callback, ms, ...args) {
            const handle = setTimeout(callback, ms, ...args);
            return { dispose: () => clearTimeout(handle) };
        }
    }
};
(0, jsonServer_1.startServer)(connection, runtime);
//# sourceMappingURL=jsonServerMain.js.map