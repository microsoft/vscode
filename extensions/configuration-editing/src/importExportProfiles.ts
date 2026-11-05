/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { basename } from 'path';

type GitHubApi = Pick<typeof vscode.github, 'getClient' | 'getAnonymousClient'>;
type AuthenticationApi = Pick<typeof vscode.authentication, 'getSession'>;

export class GitHubGistProfileContentHandler implements vscode.ProfileContentHandler {

	readonly name = vscode.l10n.t('GitHub');
	readonly description = vscode.l10n.t('gist');

	constructor(
		private readonly github: GitHubApi = vscode.github,
		private readonly authentication: AuthenticationApi = vscode.authentication,
	) { }

	async saveProfile(name: string, content: string, token?: vscode.CancellationToken): Promise<{ readonly id: string; readonly link: vscode.Uri } | null> {
		this.throwIfCancelled(token);
		const session = await this.authentication.getSession('github', ['gist', 'user:email'], { createIfNone: true });
		this.throwIfCancelled(token);
		const client = await this.github.getClient(session.id, token);
		try {
			this.throwIfCancelled(token);
			const gist = await client.gists.create({
				public: false,
				files: { [name]: { content } }
			}, token);
			if (gist.id && gist.htmlUrl) {
				return { id: gist.id, link: gist.htmlUrl };
			}
			return null;
		} finally {
			client.dispose();
		}
	}

	async readProfile(idOrUri: string | vscode.Uri, token?: vscode.CancellationToken): Promise<string | null> {
		this.throwIfCancelled(token);
		const gistId = typeof idOrUri === 'string' ? idOrUri : basename(idOrUri.path);
		let client: vscode.GitHubAnonymousClient | undefined;
		try {
			client = await this.github.getAnonymousClient(token);
			this.throwIfCancelled(token);
			const gist = await client.gists.get(gistId, token);
			const file = gist.files[0];
			// Truncated or binary inline content is not a usable profile.
			if (!file || file.truncated || file.isBinary) {
				return null;
			}
			return file.content;
		} catch (error) {
			if (error instanceof vscode.CancellationError) {
				throw error;
			}
			// Other failures mean the gist cannot be read as a profile.
		} finally {
			client?.dispose();
		}
		return null;
	}

	private throwIfCancelled(token: vscode.CancellationToken | undefined): void {
		if (token?.isCancellationRequested) {
			throw new vscode.CancellationError();
		}
	}

}

export function registerGitHubGistProfileContentHandler(): vscode.Disposable {
	return vscode.window.registerProfileContentHandler('github', new GitHubGistProfileContentHandler());
}
