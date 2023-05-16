/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CanonicalUriIdentityProvider, Disposable, Uri, workspace } from 'vscode';

const SUPPORTED_SCHEMES = ['ssh', 'https'];

export class GitHubCanonicalUriIdentityProvider implements CanonicalUriIdentityProvider {

	private disposables: Disposable[] = [];
	constructor() {
		this.disposables.push(...SUPPORTED_SCHEMES.map((scheme) => workspace.registerCanonicalUriIdentityProvider(scheme, this)));
	}

	dispose() { this.disposables.forEach((disposable) => disposable.dispose()); }

	async provideCanonicalUriIdentity(uri: Uri, _token: CancellationToken): Promise<Uri | undefined> {
		switch (uri.scheme) {
			case 'ssh':
				// if this is a git@github.com URI, return the HTTPS equivalent
				if (uri.authority === 'git@github.com') {
					const [owner, repo] = (uri.path.endsWith('.git') ? uri.path.slice(0, -4) : uri.path).split('/').filter((segment) => segment.length > 0);
					return Uri.parse(`https://github.com/${owner}/${repo}`);
				}
				break;
			case 'https':
				if (uri.authority === 'github.com') {
					return uri;
				}
				break;
		}

		return undefined;
	}
}
