/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { EventEmitter, authentication, window } from 'vscode';
import { globalAgent } from 'https';
import { httpsOverHttp } from 'tunnel';
import { URL } from 'url';
import { DisposableStore, sequentialize } from './util.js';
export class AuthenticationError extends Error {
}
function getAgent(url = process.env.HTTPS_PROXY) {
    if (!url) {
        return globalAgent;
    }
    try {
        const { hostname, port, username, password } = new URL(url);
        const auth = username && password && `${username}:${password}`;
        return httpsOverHttp({ proxy: { host: hostname, port, proxyAuth: auth } });
    }
    catch (e) {
        window.showErrorMessage(`HTTPS_PROXY environment variable ignored: ${e.message}`);
        return globalAgent;
    }
}
const scopes = ['repo', 'workflow', 'user:email', 'read:user'];
export async function getSession() {
    return await authentication.getSession('github', scopes, { createIfNone: true });
}
let _octokit;
export function getOctokit() {
    if (!_octokit) {
        _octokit = getSession().then(async (session) => {
            const token = session.accessToken;
            const agent = getAgent();
            const { Octokit } = await import('@octokit/rest');
            return new Octokit({
                request: { agent },
                userAgent: 'GitHub VSCode',
                auth: `token ${token}`
            });
        }).then(null, async (err) => {
            _octokit = undefined;
            throw err;
        });
    }
    return _octokit;
}
export class OctokitService {
    _octokitGraphql;
    _onDidChangeSessions = new EventEmitter();
    onDidChangeSessions = this._onDidChangeSessions.event;
    _disposables = new DisposableStore();
    constructor() {
        this._disposables.add(this._onDidChangeSessions);
        this._disposables.add(authentication.onDidChangeSessions(e => {
            if (e.provider.id === 'github') {
                this._octokitGraphql = undefined;
                this._onDidChangeSessions.fire();
            }
        }));
    }
    async getOctokitGraphql() {
        if (!this._octokitGraphql) {
            try {
                const session = await authentication.getSession('github', scopes, { silent: true });
                if (!session) {
                    throw new AuthenticationError('No GitHub authentication session available.');
                }
                const token = session.accessToken;
                const { graphql } = await import('@octokit/graphql');
                this._octokitGraphql = graphql.defaults({
                    headers: {
                        authorization: `token ${token}`
                    },
                    request: {
                        agent: getAgent()
                    }
                });
                return this._octokitGraphql;
            }
            catch (err) {
                this._octokitGraphql = undefined;
                throw new AuthenticationError(err.message);
            }
        }
        return this._octokitGraphql;
    }
    dispose() {
        this._octokitGraphql = undefined;
        this._disposables.dispose();
    }
}
__decorate([
    sequentialize
], OctokitService.prototype, "getOctokitGraphql", null);
//# sourceMappingURL=auth.js.map