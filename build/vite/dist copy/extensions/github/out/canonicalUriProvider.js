/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Uri, workspace } from 'vscode';
const SUPPORTED_SCHEMES = ['ssh', 'https', 'file'];
export class GitHubCanonicalUriProvider {
    gitApi;
    disposables = [];
    constructor(gitApi) {
        this.gitApi = gitApi;
        this.disposables.push(...SUPPORTED_SCHEMES.map((scheme) => workspace.registerCanonicalUriProvider(scheme, this)));
    }
    dispose() { this.disposables.forEach((disposable) => disposable.dispose()); }
    provideCanonicalUri(uri, options, _token) {
        if (options.targetScheme !== 'https') {
            return;
        }
        switch (uri.scheme) {
            case 'file': {
                const repository = this.gitApi.getRepository(uri);
                const remote = repository?.state.remotes.find((remote) => remote.name === repository.state.HEAD?.remote)?.pushUrl?.replace(/^(git@[^\/:]+)(:)/i, 'ssh://$1/');
                if (remote) {
                    return toHttpsGitHubRemote(uri);
                }
            }
            default:
                return toHttpsGitHubRemote(uri);
        }
    }
}
function toHttpsGitHubRemote(uri) {
    if (uri.scheme === 'ssh' && uri.authority === 'git@github.com') {
        // if this is a git@github.com URI, return the HTTPS equivalent
        const [owner, repo] = (uri.path.endsWith('.git') ? uri.path.slice(0, -4) : uri.path).split('/').filter((segment) => segment.length > 0);
        return Uri.parse(`https://github.com/${owner}/${repo}`);
    }
    if (uri.scheme === 'https' && uri.authority === 'github.com') {
        return uri;
    }
    return undefined;
}
//# sourceMappingURL=canonicalUriProvider.js.map