"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.UriHandlerLoopbackClient = void 0;
const vscode_1 = require("vscode");
const async_1 = require("./async");
class UriHandlerLoopbackClient {
    _uriHandler;
    _redirectUri;
    _callbackUri;
    _logger;
    constructor(_uriHandler, _redirectUri, _callbackUri, _logger) {
        this._uriHandler = _uriHandler;
        this._redirectUri = _redirectUri;
        this._callbackUri = _callbackUri;
        this._logger = _logger;
    }
    async listenForAuthCode() {
        const url = await (0, async_1.toPromise)(this._uriHandler.event);
        this._logger.debug(`Received URL event. Authority: ${url.authority}`);
        const result = new URL(url.toString(true));
        return {
            code: result.searchParams.get('code') ?? undefined,
            state: result.searchParams.get('state') ?? undefined,
            error: result.searchParams.get('error') ?? undefined,
            error_description: result.searchParams.get('error_description') ?? undefined,
            error_uri: result.searchParams.get('error_uri') ?? undefined,
        };
    }
    getRedirectUri() {
        // We always return the constant redirect URL because
        // it will handle redirecting back to the extension
        return this._redirectUri;
    }
    closeServer() {
        // No-op
    }
    async openBrowser(url) {
        const uri = vscode_1.Uri.parse(url + `&state=${encodeURI(this._callbackUri.toString(true))}`);
        await vscode_1.env.openExternal(uri);
    }
}
exports.UriHandlerLoopbackClient = UriHandlerLoopbackClient;
//# sourceMappingURL=loopbackClientAndOpener.js.map