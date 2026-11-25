/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationSession, CancellationError, CancellationTokenSource, EventEmitter, authentication } from 'vscode';
import type { GitHubClient } from '@vscode/internal-github';
import { createRequire } from 'node:module';
import { DisposableStore } from './util.js';

export class AuthenticationError extends Error { }

const github: typeof import('@vscode/internal-github') = createRequire(import.meta.url)('@vscode/internal-github');
const scopes = ['repo', 'workflow', 'user:email', 'read:user'];

export async function getSession(): Promise<AuthenticationSession> {
	return await authentication.getSession('github', scopes, { createIfNone: true });
}

export class GitHubService {
	private readonly _clients = new Map<string, {
		readonly promise: Promise<GitHubClient>;
		readonly source: CancellationTokenSource;
		readonly lifetime: DisposableStore;
	}>();

	private _disposed = false;
	private readonly _onDidChangeSessions = new EventEmitter<void>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	private readonly _disposables = new DisposableStore();

	constructor() {
		this._disposables.add(this._onDidChangeSessions);
		this._disposables.add(authentication.onDidChangeSessions(e => {
			if (e.provider.id === 'github') {
				// Bound clients handle grant invalidation; this event can concern another account.
				this._onDidChangeSessions.fire();
			}
		}));
	}

	async getClient(silent = false): Promise<GitHubClient> {
		if (this._disposed) {
			throw new CancellationError();
		}
		let session: AuthenticationSession | undefined;
		try {
			session = await authentication.getSession('github', scopes, silent ? { silent: true } : { createIfNone: true });
		} catch (error) {
			if (silent && error instanceof Error) {
				throw new AuthenticationError(error.message, { cause: error });
			}
			throw error;
		}
		if (this._disposed) {
			throw new CancellationError();
		}
		if (!session) {
			throw new AuthenticationError('No GitHub authentication session available.');
		}
		const cached = this._clients.get(session.id);
		if (cached) {
			return cached.promise;
		}
		const lifetime = new DisposableStore();
		const source = new CancellationTokenSource();
		lifetime.add(source);
		const promise = Promise.resolve().then(async () => {
			try {
				if (source.token.isCancellationRequested) {
					throw new CancellationError();
				}
				const client = await github.getClient(session.id, source.token);
				lifetime.add(client);
				if (source.token.isCancellationRequested) {
					throw new CancellationError();
				}
				lifetime.add(client.onDidInvalidate(() => {
					if (this._clients.get(session.id)?.source === source) {
						this._clients.delete(session.id);
					}
					source.cancel();
					lifetime.dispose();
				}));
				return client;
			} catch (error) {
				if (this._clients.get(session.id)?.source === source) {
					this._clients.delete(session.id);
				}
				lifetime.dispose();
				if (error instanceof github.GitHubError && error.code === 'authentication') {
					throw new AuthenticationError(error.message);
				}
				throw error;
			}
		});
		this._clients.set(session.id, { promise, source, lifetime });
		return promise;
	}

	private clearClients(): void {
		for (const { source, lifetime } of this._clients.values()) {
			source.cancel();
			lifetime.dispose();
		}
		this._clients.clear();
	}

	dispose(): void {
		this._disposed = true;
		this.clearClients();
		this._disposables.dispose();
	}
}
