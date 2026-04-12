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
const vscode = __importStar(require("vscode"));
const path_1 = require("path");
const net_1 = require("./node/net");
class GitHubGistProfileContentHandler {
    name = vscode.l10n.t('GitHub');
    description = vscode.l10n.t('gist');
    _octokit;
    getOctokit() {
        if (!this._octokit) {
            this._octokit = (async () => {
                const session = await vscode.authentication.getSession('github', ['gist', 'user:email'], { createIfNone: true });
                const token = session.accessToken;
                const { Octokit } = await Promise.resolve().then(() => __importStar(require('@octokit/rest')));
                return new Octokit({
                    request: { agent: net_1.agent },
                    userAgent: 'GitHub VSCode',
                    auth: `token ${token}`
                });
            })();
        }
        return this._octokit;
    }
    async saveProfile(name, content) {
        const octokit = await this.getOctokit();
        const result = await octokit.gists.create({
            public: false,
            files: {
                [name]: {
                    content
                }
            }
        });
        if (result.data.id && result.data.html_url) {
            const link = vscode.Uri.parse(result.data.html_url);
            return { id: result.data.id, link };
        }
        return null;
    }
    _public_octokit;
    getPublicOctokit() {
        if (!this._public_octokit) {
            this._public_octokit = (async () => {
                const { Octokit } = await Promise.resolve().then(() => __importStar(require('@octokit/rest')));
                return new Octokit({ request: { agent: net_1.agent }, userAgent: 'GitHub VSCode' });
            })();
        }
        return this._public_octokit;
    }
    async readProfile(arg) {
        const gist_id = typeof arg === 'string' ? arg : (0, path_1.basename)(arg.path);
        const octokit = await this.getPublicOctokit();
        try {
            const gist = await octokit.gists.get({ gist_id });
            if (gist.data.files) {
                return gist.data.files[Object.keys(gist.data.files)[0]]?.content ?? null;
            }
        }
        catch (error) {
            // ignore
        }
        return null;
    }
}
vscode.window.registerProfileContentHandler('github', new GitHubGistProfileContentHandler());
//# sourceMappingURL=importExportProfiles.js.map