/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationSession, EventEmitter, authentication, window } from 'vscode';
import { graphql } from '@octokit/graphql/types';
import { Octokit } from '@octokit/rest';
import { URL } from 'url';
import { DisposableStore, sequentialize } from './util.js';
import { fetch as undiciFetch, ProxyAgent, type Dispatcher, type RequestInit as UndiciRequestInit } from 'undici';

export class AuthenticationError extends Error { }

function getDispatcher(url: string | undefined = process.env.HTTPS_PROXY): Dispatcher | undefined {
	if (!url) {
		return undefined;
	}

	try {
		const { username, password } = new URL(url);
		const auth = username && password ? `${decodeURIComponent(username)}:${decodeURIComponent(password)}` : undefined;
		const token = auth ? `Basic ${Buffer.from(auth).toString('base64')}` : undefined;
		return new ProxyAgent({ uri: url, token });
	} catch (e) {
		window.showErrorMessage(`HTTPS_PROXY environment variable ignored: ${e.message}`);
		return undefined;
	}
}

function createFetch(dispatcher: Dispatcher | undefined): typeof undiciFetch {
	if (!dispatcher) {
		return undiciFetch;
	}

	return (url, options) => {
		const requestInit: UndiciRequestInit = options ? { ...options } : {};
		requestInit.dispatcher = dispatcher;
		return undiciFetch(url, requestInit);
	};
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
			const fetch = createFetch(getDispatcher());

			const { Octokit } = await import('@octokit/rest');

			return new Octokit({
				request: { fetch },
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
				const fetch = createFetch(getDispatcher());

				this._octokitGraphql = graphql.defaults({
					headers: {
						authorization: `token ${token}`
					},
					request: {
						fetch
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
