"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.agent = void 0;
const https_1 = require("https");
const url_1 = require("url");
const tunnel_1 = require("tunnel");
const vscode_1 = require("vscode");
exports.agent = getAgent();
/**
 * Return an https agent for the given proxy URL, or return the
 * global https agent if the URL was empty or invalid.
 */
function getAgent(url = process.env.HTTPS_PROXY) {
    if (!url) {
        return https_1.globalAgent;
    }
    try {
        const { hostname, port, username, password } = new url_1.URL(url);
        const auth = username && password && `${username}:${password}`;
        return (0, tunnel_1.httpsOverHttp)({ proxy: { host: hostname, port, proxyAuth: auth } });
    }
    catch (e) {
        vscode_1.window.showErrorMessage(`HTTPS_PROXY environment variable ignored: ${e.message}`);
        return https_1.globalAgent;
    }
}
//# sourceMappingURL=net.js.map