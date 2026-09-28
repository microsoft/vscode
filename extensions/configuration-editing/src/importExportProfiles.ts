/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Octokit } from '@octokit/rest';
import * as vscode from 'vscode';
import { basename } from 'path';
import { agent } from './node/net';

class GitHubGistProfileContentHandler implements vscode.ProfileContentHandler {

	readonly name = vscode.l10n.t('GitHub');
	readonly description = vscode.l10n.t('gist');

	private _octokit: Promise<Octokit> | undefined;
	private getOctokit(): Promise<Octokit> {
		if (!this._octokit) {
			this._octokit = (async () => {
				const session = await vscode.authentication.getSession('github', ['gist', 'user:email'], { createIfNone: true });
				const token = session.accessToken;

				const { Octokit } = await import('@octokit/rest');

				return new Octokit({
					request: { agent },
					userAgent: 'GitHub VSCode',
					auth: `token ${token}`
				});
			})();
		}
		return this._octokit;
	}

	async saveProfile(name: string, content: string): Promise<{ readonly id: string; readonly link: vscode.Uri } | null> {
		try {
			const octokit = await this.getOctokit();
			const safeFileName = name.trim() || 'vscode-profile.json';
			
			const result = await octokit.gists.create({
				public: false,
				files: {
					[safeFileName]: {
						content
					}
				}
			});
			if (result.data.id && result.data.html_url) {
				const link = vscode.Uri.parse(result.data.html_url);
				return { id: result.data.id, link };
			}
		} catch (error) {
			vscode.window.showErrorMessage(vscode.l10n.t('Failed to save profile to GitHub Gist: {0}', error instanceof Error ? error.message : String(error)));
		}
		return null;
	}

	private _public_octokit: Promise<Octokit> | undefined;
	private getPublicOctokit(): Promise<Octokit> {
		if (!this._public_octokit) {
			this._public_octokit = (async () => {
				const { Octokit } = await import('@octokit/rest');
				return new Octokit({ request: { agent }, userAgent: 'GitHub VSCode' });
			})();
		}
		return this._public_octokit;
	}

	async readProfile(id: string): Promise<string | null>;
	async readProfile(uri: vscode.Uri): Promise<string | null>;
	async readProfile(arg: string | vscode.Uri): Promise<string | null> {
		const gist_id = typeof arg === 'string' ? arg : basename(arg.path);
		const octokit = await this.getPublicOctokit();
		try {
			const gist = await octokit.gists.get({ gist_id });
			if (gist.data.files) {
				const files = Object.values(gist.data.files);
				if (files.length > 0 && files[0]?.content) {
					return files[0].content;
				}
			}
		} catch (error) {
			console.error('Failed to read profile from GitHub Gist:', error);
		}
		return null;
	}

}

vscode.window.registerProfileContentHandler('github', new GitHubGistProfileContentHandler());
