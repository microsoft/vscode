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
const assert = __importStar(require("assert"));
const vscode_1 = require("vscode");
const sinon = __importStar(require("sinon"));
const loopbackClientAndOpener_1 = require("../loopbackClientAndOpener");
const UriEventHandler_1 = require("../../UriEventHandler");
suite('UriHandlerLoopbackClient', () => {
    const redirectUri = 'http://localhost';
    let uriHandler;
    let client;
    let envStub;
    let callbackUri;
    setup(async () => {
        callbackUri = await vscode_1.env.asExternalUri(vscode_1.Uri.parse(`${vscode_1.env.uriScheme}://vscode.microsoft-authentication`));
        envStub = sinon.stub(vscode_1.env);
        envStub.openExternal.resolves(true);
        envStub.asExternalUri.callThrough();
        uriHandler = new UriEventHandler_1.UriEventHandler();
        client = new loopbackClientAndOpener_1.UriHandlerLoopbackClient(uriHandler, redirectUri, callbackUri, vscode_1.window.createOutputChannel('test', { log: true }));
    });
    teardown(() => {
        sinon.restore();
        uriHandler.dispose();
    });
    suite('openBrowser', () => {
        test('should open browser with correct URL', async () => {
            const testUrl = 'http://example.com?foo=5';
            await client.openBrowser(testUrl);
            assert.ok(envStub.openExternal.calledOnce);
            const expectedUri = vscode_1.Uri.parse(testUrl + `&state=${encodeURI(callbackUri.toString(true))}`);
            const value = envStub.openExternal.getCalls()[0].args[0];
            assert.strictEqual(value.toString(true), expectedUri.toString(true));
        });
    });
    suite('getRedirectUri', () => {
        test('should return the redirect URI', () => {
            const result = client.getRedirectUri();
            assert.strictEqual(result, redirectUri);
        });
    });
    // Skipped for now until `listenForAuthCode` is refactored to not show quick pick
    suite('listenForAuthCode', () => {
        test('should return auth code from URL', async () => {
            const code = '1234';
            const state = '5678';
            const testUrl = vscode_1.Uri.parse(`http://example.com?code=${code}&state=${state}`);
            const promise = client.listenForAuthCode();
            uriHandler.handleUri(testUrl);
            const result = await promise;
            assert.strictEqual(result.code, code);
            assert.strictEqual(result.state, state);
        });
        test('should return auth error from URL', async () => {
            const error = 'access_denied';
            const errorDescription = 'reason';
            const errorUri = 'uri';
            const testUrl = vscode_1.Uri.parse(`http://example.com?error=${error}&error_description=${errorDescription}&error_uri=${errorUri}`);
            const promise = client.listenForAuthCode();
            uriHandler.handleUri(testUrl);
            const result = await promise;
            assert.strictEqual(result.error, 'access_denied');
            assert.strictEqual(result.error_description, 'reason');
            assert.strictEqual(result.error_uri, 'uri');
        });
    });
});
//# sourceMappingURL=loopbackClientAndOpener.test.js.map