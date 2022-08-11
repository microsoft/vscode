/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Model } from './model';

export class GitCanonicalWorkspaceIdentityProvider implements vscode.CanonicalWorkspaceIdentityProvider, vscode.Disposable {

	private providerRegistration: vscode.Disposable;

	constructor(private model: Model) {
		this.providerRegistration = vscode.workspace.registerCanonicalWorkspaceIdentityProvider('file', this);
	}

	dispose() {
		this.providerRegistration.dispose();
	}

	provideCanonicalWorkspaceIdentity(uri: vscode.Uri, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.CanonicalWorkspaceIdentity> {
		const repository = this.model.getRepository(uri);

		if (!repository || !repository?.HEAD?.upstream) {
			return null;
		}

		return {
			remote: repository.remotes.find((remote) => remote.name === repository.HEAD?.upstream?.remote)?.pushUrl ?? null,
			ref: repository.HEAD?.name ?? null,
			sha: repository.HEAD?.commit ?? null,
		};
	}
}
