"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Log = void 0;
const vscode = require("vscode");
const github_1 = require("../github");
class Log {
    constructor(type) {
        this.type = type;
        const friendlyName = this.type === github_1.AuthProviderType.github ? 'GitHub' : 'GitHub Enterprise';
        this.output = vscode.window.createOutputChannel(`${friendlyName} Authentication`, { log: true });
    }
    trace(message) {
        this.output.trace(message);
    }
    info(message) {
        this.output.info(message);
    }
    error(message) {
        this.output.error(message);
    }
    warn(message) {
        this.output.warn(message);
    }
}
exports.Log = Log;
