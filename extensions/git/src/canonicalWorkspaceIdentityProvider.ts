/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
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

	async provideCanonicalWorkspaceIdentity(workspaceFolder: vscode.WorkspaceFolder, _token: vscode.CancellationToken): Promise<string | null> {
		await this.model.openRepository(path.dirname(workspaceFolder.uri.fsPath));

		const repository = this.model.getRepository(workspaceFolder.uri);
		await repository?.status();

		if (!repository || !repository?.HEAD?.upstream) {
			return null;
		}

		return JSON.stringify({
			remote: repository.remotes.find((remote) => remote.name === repository.HEAD?.upstream?.remote)?.pushUrl ?? null,
			ref: repository.HEAD?.name ?? null,
			sha: repository.HEAD?.commit ?? null,
		});
	}
}
