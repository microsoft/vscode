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
exports.activate = activate;
const vscode = __importStar(require("vscode"));
const github_1 = require("./github");
const settingNotSent = '"github-enterprise.uri" not set';
const settingInvalid = '"github-enterprise.uri" invalid';
class NullAuthProvider {
    _errorMessage;
    _onDidChangeSessions = new vscode.EventEmitter();
    onDidChangeSessions = this._onDidChangeSessions.event;
    _disposable;
    constructor(_errorMessage) {
        this._errorMessage = _errorMessage;
        this._disposable = vscode.authentication.registerAuthenticationProvider('github-enterprise', 'GitHub Enterprise', this);
    }
    createSession() {
        throw new Error(this._errorMessage);
    }
    getSessions() {
        return Promise.resolve([]);
    }
    removeSession() {
        throw new Error(this._errorMessage);
    }
    dispose() {
        this._onDidChangeSessions.dispose();
        this._disposable.dispose();
    }
}
function initGHES(context, uriHandler) {
    const settingValue = vscode.workspace.getConfiguration().get('github-enterprise.uri');
    if (!settingValue) {
        const provider = new NullAuthProvider(settingNotSent);
        context.subscriptions.push(provider);
        return provider;
    }
    // validate user value
    let uri;
    try {
        uri = vscode.Uri.parse(settingValue, true);
    }
    catch (e) {
        vscode.window.showErrorMessage(vscode.l10n.t('GitHub Enterprise Server URI is not a valid URI: {0}', e.message ?? e));
        const provider = new NullAuthProvider(settingInvalid);
        context.subscriptions.push(provider);
        return provider;
    }
    const githubEnterpriseAuthProvider = new github_1.GitHubAuthenticationProvider(context, uriHandler, uri);
    context.subscriptions.push(githubEnterpriseAuthProvider);
    return githubEnterpriseAuthProvider;
}
function activate(context) {
    const uriHandler = new github_1.UriEventHandler();
    context.subscriptions.push(uriHandler);
    context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));
    context.subscriptions.push(new github_1.GitHubAuthenticationProvider(context, uriHandler));
    let before = vscode.workspace.getConfiguration().get('github-enterprise.uri');
    let githubEnterpriseAuthProvider = initGHES(context, uriHandler);
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('github-enterprise.uri')) {
            const after = vscode.workspace.getConfiguration().get('github-enterprise.uri');
            if (before !== after) {
                githubEnterpriseAuthProvider?.dispose();
                before = after;
                githubEnterpriseAuthProvider = initGHES(context, uriHandler);
            }
        }
    }));
    // Listener to prompt for reload when the fetch implementation setting changes
    const beforeFetchSetting = vscode.workspace.getConfiguration().get('github-authentication.useElectronFetch', true);
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('github-authentication.useElectronFetch')) {
            const afterFetchSetting = vscode.workspace.getConfiguration().get('github-authentication.useElectronFetch', true);
            if (beforeFetchSetting !== afterFetchSetting) {
                const selection = await vscode.window.showInformationMessage(vscode.l10n.t('GitHub Authentication - Reload required'), {
                    modal: true,
                    detail: vscode.l10n.t('A reload is required for the fetch setting change to take effect.')
                }, vscode.l10n.t('Reload Window'));
                if (selection) {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            }
        }
    }));
}
//# sourceMappingURL=extension.js.map