/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { Model } from './model';

export class GitEditSessionIdentityProvider implements vscode.EditSessionIdentityProvider, vscode.Disposable {

	private providerRegistration: vscode.Disposable;

	constructor(private model: Model) {
		this.providerRegistration = vscode.workspace.registerEditSessionIdentityProvider('file', this);
	}

	dispose() {
		this.providerRegistration.dispose();
	}

	async provideEditSessionIdentity(workspaceFolder: vscode.WorkspaceFolder, _token: vscode.CancellationToken): Promise<string | undefined> {
		await this.model.openRepository(path.dirname(workspaceFolder.uri.fsPath));

		const repository = this.model.getRepository(workspaceFolder.uri);
		await repository?.status();

		if (!repository || !repository?.HEAD?.upstream) {
			return undefined;
		}

		return JSON.stringify({
			remote: repository.remotes.find((remote) => remote.name === repository.HEAD?.upstream?.remote)?.pushUrl ?? null,
			ref: repository.HEAD?.name ?? null,
			sha: repository.HEAD?.commit ?? null,
		});
	}

	provideEditSessionIdentityMatch(identity1: string, identity2: string): vscode.EditSessionIdentityMatch {
		try {
			const normalizedIdentity1 = normalizeEditSessionIdentity(identity1);
			const normalizedIdentity2 = normalizeEditSessionIdentity(identity2);

			if (normalizedIdentity1.remote === normalizedIdentity2.remote &&
				normalizedIdentity1.ref === normalizedIdentity2.ref &&
				normalizedIdentity1.sha === normalizedIdentity2.sha) {
				// This is a perfect match
				return vscode.EditSessionIdentityMatch.Complete;
			} else if (normalizedIdentity1.sha !== normalizedIdentity2.sha) {
				// Same branch and remote but different SHA
				return vscode.EditSessionIdentityMatch.Partial;
			} else {
				return vscode.EditSessionIdentityMatch.None;
			}
		} catch (ex) {
			return vscode.EditSessionIdentityMatch.Partial;
		}
	}
}

function normalizeEditSessionIdentity(identity: string) {
	let { remote, ref, sha } = JSON.parse(identity);

	if (typeof remote === 'string' && remote.endsWith('.git')) {
		remote = remote.slice(0, remote.length - 4);
	}

	return {
		remote,
		ref,
		sha
	};
}
