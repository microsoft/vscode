/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Octokit } from '@octokit/rest';
import * as vscode from 'vscode';
import { httpsOverHttp } from 'tunnel';
import { Agent, globalAgent } from 'https';
import { basename } from 'path';
import { URL } from 'url';

class GitHubGistProfileContentHandler implements vscode.ProfileContentHandler {

	readonly name = vscode.l10n.t('GitHub');

	private _octokit: Promise<Octokit> | undefined;
	private getOctokit(): Promise<Octokit> {
		if (!this._octokit) {
			this._octokit = (async () => {
				const session = await vscode.authentication.getSession('github', ['gist', 'user:email'], { createIfNone: true });
				const token = session.accessToken;
				const agent = this.getAgent();

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

	private getAgent(url: string | undefined = process.env.HTTPS_PROXY): Agent {
		if (!url) {
			return globalAgent;
		}
		try {
			const { hostname, port, username, password } = new URL(url);
			const auth = username && password && `${username}:${password}`;
			return httpsOverHttp({ proxy: { host: hostname, port, proxyAuth: auth } });
		} catch (e) {
			vscode.window.showErrorMessage(`HTTPS_PROXY environment variable ignored: ${e.message}`);
			return globalAgent;
		}
	}

	async saveProfile(name: string, content: string): Promise<vscode.Uri | null> {
		const octokit = await this.getOctokit();
		const result = await octokit.gists.create({
			public: false,
			files: {
				[name]: {
					content
				}
			}
		});
		return result.data.html_url ? vscode.Uri.parse(result.data.html_url) : null;
	}

	async readProfile(uri: vscode.Uri): Promise<string | null> {
		const gist_id = basename(uri.path);
		const octokit = await this.getOctokit();
		try {
			const gist = await octokit.gists.get({ gist_id });
			if (gist.data.files) {
				return gist.data.files[Object.keys(gist.data.files)[0]]?.content ?? null;
			}
		} catch (error) {
			// ignore
		}
		return null;
	}

}

vscode.window.registerProfileContentHandler('github', new GitHubGistProfileContentHandler());
