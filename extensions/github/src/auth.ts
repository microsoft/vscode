/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationSession, EventEmitter, authentication, window } from 'vscode';
import { Agent, globalAgent } from 'https';
import { graphql } from '@octokit/graphql/types';
import { Octokit } from '@octokit/rest';
import { httpsOverHttp } from 'tunnel';
import { URL } from 'url';
import { DisposableStore, sequentialize } from './util.js';

export class AuthenticationError extends Error { }

function getAgent(url: string | undefined = process.env.HTTPS_PROXY): Agent {
	if (!url) {
		return globalAgent;
	}

	try {
		const { hostname, port, username, password } = new URL(url);
		const auth = username && password && `${username}:${password}`;
		return httpsOverHttp({ proxy: { host: hostname, port, proxyAuth: auth } });
	} catch (e) {
		window.showErrorMessage(`HTTPS_PROXY environment variable ignored: ${e.message}`);
		return globalAgent;
	}
}

const scopes = ['repo', 'workflow', 'user:email', 'read:user'];

export async function getSession(): Promise<AuthenticationSession> {
	return await authentication.getSession('github', scopes, { createIfNone: true });
}

let _octokit: Promise<Octokit> | undefined;

export function getOctokit(): Promise<Octokit> {
	if (!_octokit) {
		_octokit = getSession().then(async session => {
			const token = session.accessToken;
			const agent = getAgent();

			const { Octokit } = await import('@octokit/rest');

			return new Octokit({
				request: { agent },
				userAgent: 'GitHub VSCode',
				auth: `token ${token}`
			});
		}).then(null, async err => {
			_octokit = undefined;
			throw err;
		});
	}

	return _octokit;
}

export class OctokitService {
	private _octokitGraphql: graphql | undefined;

	private readonly _onDidChangeSessions = new EventEmitter<void>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _disposables = new DisposableStore();

	constructor() {
		this._disposables.add(this._onDidChangeSessions);
		this._disposables.add(authentication.onDidChangeSessions(e => {
			if (e.provider.id === 'github') {
				this._octokitGraphql = undefined;
				this._onDidChangeSessions.fire();
			}
		}));
	}

	@sequentialize
	public async getOctokitGraphql(): Promise<graphql> {
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
			} catch (err) {
				this._octokitGraphql = undefined;
				throw new AuthenticationError(err.message);
			}
		}

		return this._octokitGraphql;
	}

	dispose(): void {
		this._octokitGraphql = undefined;
		this._disposables.dispose();
	}
}
