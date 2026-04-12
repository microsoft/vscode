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
exports.GitProtocolHandler = void 0;
const vscode_1 = require("vscode");
const util_1 = require("./util");
const querystring = __importStar(require("querystring"));
const schemes = util_1.isWindows ?
    new Set(['git', 'http', 'https', 'ssh']) :
    new Set(['file', 'git', 'http', 'https', 'ssh']);
const refRegEx = /^$|[~\^:\\\*\s\[\]]|^-|^\.|\/\.|\.\.|\.lock\/|\.lock$|\/$|\.$/;
class GitProtocolHandler {
    logger;
    disposables = [];
    constructor(logger) {
        this.logger = logger;
        this.disposables.push(vscode_1.window.registerUriHandler(this));
    }
    // example code-oss://vscode.git/clone?url=https://github.com/microsoft/vscode
    handleUri(uri) {
        this.logger.info(`[GitProtocolHandler][handleUri] URI:(${uri.toString()})`);
        switch (uri.path) {
            case '/clone': this.clone(uri);
        }
    }
    async clone(uri) {
        const data = querystring.parse(uri.query);
        const ref = data.ref;
        if (!data.url) {
            this.logger.warn('[GitProtocolHandler][clone] Failed to open URI:' + uri.toString());
            return;
        }
        if (Array.isArray(data.url) && data.url.length === 0) {
            this.logger.warn('[GitProtocolHandler][clone] Failed to open URI:' + uri.toString());
            return;
        }
        if (ref !== undefined && typeof ref !== 'string') {
            this.logger.warn('[GitProtocolHandler][clone] Failed to open URI due to multiple references:' + uri.toString());
            return;
        }
        let cloneUri;
        try {
            let rawUri = Array.isArray(data.url) ? data.url[0] : data.url;
            // Handle SSH Uri
            // Ex: git@github.com:microsoft/vscode.git
            rawUri = rawUri.replace(/^(git@[^\/:]+)(:)/i, 'ssh://$1/');
            cloneUri = vscode_1.Uri.parse(rawUri, true);
            // Validate against supported schemes
            if (!schemes.has(cloneUri.scheme.toLowerCase())) {
                throw new Error('Unsupported scheme.');
            }
            // Validate the reference
            if (typeof ref === 'string' && refRegEx.test(ref)) {
                throw new Error('Invalid reference.');
            }
        }
        catch (ex) {
            this.logger.warn('[GitProtocolHandler][clone] Invalid URI:' + uri.toString());
            return;
        }
        if (!(await vscode_1.commands.getCommands(true)).includes('git.clone')) {
            this.logger.error('[GitProtocolHandler][clone] Could not complete git clone operation as git installation was not found.');
            const errorMessage = vscode_1.l10n.t('Could not clone your repository as Git is not installed.');
            const downloadGit = vscode_1.l10n.t('Download Git');
            if (await vscode_1.window.showErrorMessage(errorMessage, { modal: true }, downloadGit) === downloadGit) {
                vscode_1.commands.executeCommand('vscode.open', vscode_1.Uri.parse('https://aka.ms/vscode-download-git'));
            }
            return;
        }
        else {
            const cloneTarget = cloneUri.toString(true);
            this.logger.info(`[GitProtocolHandler][clone] Executing git.clone for ${cloneTarget}`);
            vscode_1.commands.executeCommand('git.clone', cloneTarget, undefined, { ref: ref });
        }
    }
    dispose() {
        this.disposables = (0, util_1.dispose)(this.disposables);
    }
}
exports.GitProtocolHandler = GitProtocolHandler;
//# sourceMappingURL=protocolHandler.js.map