/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { workspace } from 'vscode';
import { getSession } from './auth.js';
const EmptyDisposable = { dispose() { } };
class GitHubCredentialProvider {
    async getCredentials(host) {
        if (!/github\.com/i.test(host.authority)) {
            return;
        }
        const session = await getSession();
        return { username: session.account.id, password: session.accessToken };
    }
}
export class GithubCredentialProviderManager {
    gitAPI;
    providerDisposable = EmptyDisposable;
    disposable;
    _enabled = false;
    set enabled(enabled) {
        if (this._enabled === enabled) {
            return;
        }
        this._enabled = enabled;
        if (enabled) {
            this.providerDisposable = this.gitAPI.registerCredentialsProvider(new GitHubCredentialProvider());
        }
        else {
            this.providerDisposable.dispose();
        }
    }
    constructor(gitAPI) {
        this.gitAPI = gitAPI;
        this.disposable = workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('github')) {
                this.refresh();
            }
        });
        this.refresh();
    }
    refresh() {
        const config = workspace.getConfiguration('github', null);
        const enabled = config.get('gitAuthentication', true);
        this.enabled = !!enabled;
    }
    dispose() {
        this.enabled = false;
        this.disposable.dispose();
    }
}
//# sourceMappingURL=credentialProvider.js.map