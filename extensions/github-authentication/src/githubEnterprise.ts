/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CANCELLATION_ERROR } from './common/errors';
import { enterpriseUrisSetting } from './common/enterpriseConfiguration';
import { getEnterpriseStorageKey, getEnterpriseUriKey, migrateEnterpriseStorage } from './common/enterpriseStorage';
import { GitHubSessionEngine, UriEventHandler } from './github';

interface EnterpriseHost {
	readonly key: string;
	readonly uri: vscode.Uri;
	readonly authorizationServer: vscode.Uri;
	readonly engine: GitHubSessionEngine;
	readonly listener: vscode.Disposable;
	readonly initialChanges: Map<string, vscode.AuthenticationSession | undefined>;
}

function disposeHost(host: EnterpriseHost): void {
	host.listener.dispose();
	host.engine.dispose();
	host.initialChanges.clear();
}

function reconcileInitialSessions(host: EnterpriseHost, sessions: readonly vscode.AuthenticationSession[]): vscode.AuthenticationSession[] {
	const current = new Map(sessions.map(session => [session.id, session]));
	for (const [id, session] of host.initialChanges) {
		if (session) {
			current.set(id, session);
		} else {
			current.delete(id);
		}
	}
	host.initialChanges.clear();
	return [...current.values()];
}

export class GitHubEnterpriseAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
	private readonly _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	private _hosts = new Map<string, EnterpriseHost>();
	private readonly _disposeCancellation = new vscode.CancellationTokenSource();
	private _pendingUpdate: Promise<void> = Promise.resolve();
	private _registration: vscode.Disposable | undefined;
	private _configurationError = vscode.l10n.t('Configure {0} before signing in to GitHub Enterprise.', enterpriseUrisSetting);

	constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _uriHandler: UriEventHandler
	) { }

	update(uris: readonly vscode.Uri[], options?: { readonly error?: string; readonly legacyUri?: vscode.Uri }): Promise<void> {
		const update = async () => {
			try {
				await this.applyConfiguration(uris, options);
			} catch (error) {
				this.handleUpdateError(error);
				throw error;
			}
		};
		return this._pendingUpdate = this._pendingUpdate.then(update, update);
	}

	private handleUpdateError(error: unknown): void {
		this.throwIfDisposed();
		if (this._hosts.size) {
			return;
		}
		this._configurationError = error instanceof Error ? error.message : String(error);
		if (!this._registration) {
			this.registerProvider();
		}
	}

	private async applyConfiguration(uris: readonly vscode.Uri[], options?: { readonly error?: string; readonly legacyUri?: vscode.Uri }): Promise<void> {
		this.throwIfDisposed();
		const keys = [...new Set(uris.map(getEnterpriseUriKey))].sort();
		const addedKeys = keys.filter(key => !this._hosts.has(key));
		const retired = [...this._hosts.values()].filter(host => !keys.includes(host.key));
		this._configurationError = options?.error ?? vscode.l10n.t('Configure {0} before signing in to GitHub Enterprise.', enterpriseUrisSetting);
		if (this._registration && !addedKeys.length && !retired.length) {
			return;
		}
		for (const key of addedKeys) {
			await migrateEnterpriseStorage(this._context, vscode.Uri.parse(key), uris, options?.legacyUri);
			this.throwIfDisposed();
		}
		const created = this.createHosts(addedKeys);
		const cancellation = this._disposeCancellation.token.onCancellationRequested(() => created.forEach(disposeHost));
		try {
			const initialSessions = await Promise.all(created.map(host => host.engine.getSessions(undefined, { authorizationServer: host.authorizationServer })));
			this.throwIfDisposed();
			const removed = (await Promise.all(retired.map(host => host.engine.getCachedSessions()))).flat();
			this.throwIfDisposed();
			const added = created.flatMap((host, index) => reconcileInitialSessions(host, initialSessions[index]));
			this.commitHosts(keys, created, retired, { added, removed, changed: [] });
		} catch (error) {
			created.forEach(disposeHost);
			throw error;
		} finally {
			cancellation.dispose();
		}
	}

	private createHosts(keys: readonly string[]): EnterpriseHost[] {
		const created: EnterpriseHost[] = [];
		try {
			for (const key of keys) {
				created.push(this.createHost(key));
			}
			return created;
		} catch (error) {
			created.forEach(disposeHost);
			throw error;
		}
	}

	private createHost(key: string): EnterpriseHost {
		const uri = vscode.Uri.parse(key);
		const engine = new GitHubSessionEngine(this._context, this._uriHandler, uri, getEnterpriseStorageKey(uri));
		const initialChanges = new Map<string, vscode.AuthenticationSession | undefined>();
		const host: EnterpriseHost = {
			key,
			uri,
			authorizationServer: vscode.Uri.joinPath(uri, '/login/oauth'),
			engine,
			initialChanges,
			listener: engine.onDidChangeSessions(event => {
				if (this._hosts.get(host.key) === host) {
					this._onDidChangeSessions.fire(event);
				} else {
					event.removed?.forEach(session => initialChanges.set(session.id, undefined));
					for (const session of [...event.added ?? [], ...event.changed ?? []]) {
						initialChanges.set(session.id, session);
					}
				}
			})
		};
		return host;
	}

	private commitHosts(keys: readonly string[], created: readonly EnterpriseHost[], retired: readonly EnterpriseHost[], event: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent): void {
		const added = new Map(created.map(host => [host.key, host]));
		this._hosts = new Map(keys.map(key => [key, added.get(key) ?? this._hosts.get(key)!]));
		this.registerProvider();
		retired.forEach(disposeHost);
		if (event.added?.length || event.removed?.length) {
			this._onDidChangeSessions.fire(event);
		}
	}

	private registerProvider(): void {
		this._registration?.dispose();
		this._registration = vscode.authentication.registerAuthenticationProvider('github-enterprise', 'GitHub Enterprise', this, {
			supportsMultipleAccounts: true,
			supportedAuthorizationServers: [...this._hosts.values()].map(host => host.authorizationServer)
		});
	}

	private throwIfDisposed(): void {
		if (this._disposeCancellation.token.isCancellationRequested) {
			throw new vscode.CancellationError();
		}
	}

	async getSessions(scopes?: readonly string[], options: vscode.AuthenticationProviderSessionOptions = {}): Promise<vscode.AuthenticationSession[]> {
		const host = await this.resolveHost(options);
		const candidates = host ? [host] : [...this._hosts.values()];
		const sessions = await Promise.all(candidates.map(async candidate => {
			const sessions = await candidate.engine.getSessions(scopes && [...scopes], { ...options, authorizationServer: options.authorizationServer ?? candidate.authorizationServer });
			if (this._hosts.get(getEnterpriseUriKey(candidate.uri)) !== candidate) {
				return [];
			}
			return sessions;
		}));
		return sessions.flat();
	}

	async createSession(scopes: readonly string[], options: vscode.AuthenticationProviderSessionOptions = {}): Promise<vscode.AuthenticationSession> {
		let host = await this.resolveHost(options);
		if (!host) {
			const hosts = [...this._hosts.values()];
			if (!hosts.length) {
				throw new Error(this._configurationError);
			}
			if (hosts.length === 1) {
				host = hosts[0];
			} else {
				const selected = await vscode.window.showQuickPick(hosts.map(host => ({ label: host.uri.toString(true), host })), {
					title: vscode.l10n.t('Sign in to GitHub Enterprise'),
					placeHolder: vscode.l10n.t('Select the GitHub Enterprise instance to sign in to'),
					ignoreFocusOut: true
				});
				if (!selected) {
					throw new Error(CANCELLATION_ERROR);
				}
				host = selected.host;
			}
		}
		this.requireConfiguredHost(host);
		const session = await host.engine.createSession([...scopes], { ...options, authorizationServer: options.authorizationServer ?? host.authorizationServer });
		this.requireConfiguredHost(host);
		return session;
	}

	async removeSession(id: string): Promise<void> {
		const matches: EnterpriseHost[] = [];
		for (const host of this._hosts.values()) {
			if ((await host.engine.getCachedSessions()).some(session => session.id === id)) {
				matches.push(host);
			}
		}
		if (!matches.length) {
			throw new Error(vscode.l10n.t('The GitHub Enterprise session does not belong to a configured instance.'));
		}
		if (matches.length > 1) {
			throw new Error(vscode.l10n.t('The GitHub Enterprise session ID matches more than one configured instance.'));
		}
		this.requireConfiguredHost(matches[0]);
		await matches[0].engine.removeSession(id);
	}

	private async resolveHost(options: vscode.AuthenticationProviderSessionOptions): Promise<EnterpriseHost | undefined> {
		let serverHost: EnterpriseHost | undefined;
		if (options.authorizationServer) {
			const key = getEnterpriseUriKey(options.authorizationServer);
			serverHost = [...this._hosts.values()].find(host => getEnterpriseUriKey(host.authorizationServer) === key);
			if (!serverHost) {
				throw new Error(vscode.l10n.t('The requested GitHub Enterprise authorization server is not configured.'));
			}
		}
		const accountHosts: EnterpriseHost[] = [];
		const account = options.account;
		if (account) {
			for (const host of this._hosts.values()) {
				const sessions = await host.engine.getCachedSessions();
				if (sessions.some(session => session.account.id === account.id && session.account.label === account.label)) {
					accountHosts.push(host);
				}
			}
		}
		if (serverHost && accountHosts.length && !accountHosts.includes(serverHost)) {
			throw new Error(vscode.l10n.t('The GitHub Enterprise account and authorization server belong to different instances.'));
		}
		return serverHost ?? (accountHosts.length === 1 ? accountHosts[0] : undefined);
	}

	private requireConfiguredHost(host: EnterpriseHost): void {
		if (this._hosts.get(getEnterpriseUriKey(host.uri)) !== host) {
			throw new Error(vscode.l10n.t('The selected GitHub Enterprise instance is no longer configured.'));
		}
	}

	dispose(): void {
		this._disposeCancellation.cancel();
		this._disposeCancellation.dispose();
		this._registration?.dispose();
		this._hosts.forEach(disposeHost);
		this._hosts.clear();
		this._onDidChangeSessions.dispose();
	}
}
