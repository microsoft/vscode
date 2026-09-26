/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubSessionEngine, UriEventHandler } from './github';
import { IAccountLink } from './common/accountLinks';
import { getEnterpriseUriKey } from './common/enterpriseConfiguration';
import { EnterpriseHostConfiguration, EnterpriseHostDescriptor, getEnterpriseHostConfigurations, getEnterpriseStorageCandidates, planEnterpriseHosts } from './common/enterpriseHosts';

interface EnterpriseHost extends EnterpriseHostDescriptor {
	readonly engine: GitHubSessionEngine;
	readonly listener: vscode.Disposable;
	readonly initialChanges: Map<string, vscode.AuthenticationSession | undefined>;
}

const storageKeysKey = 'github-enterprise.storageKeys';

function disposeHost(host: EnterpriseHost | undefined): void {
	host?.listener.dispose();
	host?.engine.dispose();
	host?.initialChanges.clear();
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
	private readonly _disposeCancellation = new vscode.CancellationTokenSource();
	private _host: EnterpriseHost | undefined;
	private _registration: vscode.Disposable | undefined;
	private _pendingUpdate: Promise<void> = Promise.resolve();
	private _configurationError = vscode.l10n.t('Configure github-enterprise.uri before signing in to GitHub Enterprise.');

	constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _uriHandler: UriEventHandler
	) { }

	update(uri?: vscode.Uri, error?: string): Promise<void> {
		const update = async () => {
			try {
				await this.applyConfiguration(uri, error);
			} catch (error) {
				this.handleUpdateError(error);
				throw error;
			}
		};
		return this._pendingUpdate = this._pendingUpdate.then(update, update);
	}

	private handleUpdateError(error: unknown): void {
		this.throwIfDisposed();
		if (this._host) {
			return;
		}
		this._configurationError = error instanceof Error ? error.message : String(error);
		if (!this._registration) {
			this.registerProvider();
		}
	}

	private async applyConfiguration(uri: vscode.Uri | undefined, error: string | undefined): Promise<void> {
		this.throwIfDisposed();
		const descriptor = await this.resolveHost(uri);
		this.throwIfDisposed();
		this._configurationError = error ?? vscode.l10n.t('Configure github-enterprise.uri before signing in to GitHub Enterprise.');
		if (this._registration && this._host?.key === descriptor?.key && this._host?.storageKey === descriptor?.storageKey) {
			return;
		}
		const next = descriptor && this.createHost(descriptor);
		const cancellation = this._disposeCancellation.token.onCancellationRequested(() => disposeHost(next));
		try {
			const initialSessions = next ? await next.engine.getSessions(undefined, {}) : [];
			this.throwIfDisposed();
			const previous = this._host;
			const removed = previous ? await previous.engine.getCachedSessions() : [];
			this.throwIfDisposed();
			const added = next ? reconcileInitialSessions(next, initialSessions) : [];
			this._host = next;
			this.registerProvider();
			disposeHost(previous);
			if (added.length || removed.length) {
				this._onDidChangeSessions.fire({ added, removed, changed: [] });
			}
		} catch (error) {
			disposeHost(next);
			throw error;
		} finally {
			cancellation.dispose();
		}
	}

	private async resolveHost(uri: vscode.Uri | undefined): Promise<EnterpriseHostDescriptor | undefined> {
		const configured = getEnterpriseHostConfigurations(uri ? [uri] : [], uri);
		const mappings = this._context.globalState.get<Record<string, string>>(storageKeysKey, {});
		const populated = await this.findPopulatedStorage(configured, mappings);
		const plan = planEnterpriseHosts(configured, this._host ? [this._host] : [], mappings, populated);
		this.throwIfDisposed();
		if (plan.storageChanged) {
			await this._context.globalState.update(storageKeysKey, plan.storageKeys);
		}
		return uri ? plan.hosts.find(host => host.key === getEnterpriseUriKey(uri)) : undefined;
	}

	private async findPopulatedStorage(configured: readonly EnterpriseHostConfiguration[], mappings: Readonly<Record<string, string>>): Promise<ReadonlySet<string>> {
		const keys = [...new Set(configured.flatMap(host => getEnterpriseStorageCandidates(host, mappings[host.key])))];
		const occupied = await Promise.all(keys.map(async key => {
			const token = await this._context.secrets.get(key);
			const links = this._context.globalState.get<readonly IAccountLink[]>(`${key}.microsoftAccountLinks`, []);
			return (token && token !== '[]') || links.length ? key : undefined;
		}));
		return new Set(occupied.filter((key): key is string => key !== undefined));
	}

	private createHost(descriptor: EnterpriseHostDescriptor): EnterpriseHost {
		const engine = new GitHubSessionEngine(this._context, this._uriHandler, descriptor.uri, descriptor.storageKey);
		const initialChanges = new Map<string, vscode.AuthenticationSession | undefined>();
		return {
			...descriptor,
			engine,
			initialChanges,
			listener: engine.onDidChangeSessions(event => {
				if (this._host?.engine === engine) {
					this._onDidChangeSessions.fire(event);
				} else {
					event.removed?.forEach(session => initialChanges.set(session.id, undefined));
					for (const session of [...event.added ?? [], ...event.changed ?? []]) {
						initialChanges.set(session.id, session);
					}
				}
			})
		};
	}

	private registerProvider(): void {
		this._registration?.dispose();
		const uri = this._host?.uri;
		this._registration = vscode.authentication.registerAuthenticationProvider('github-enterprise', uri?.authority ?? 'GitHub Enterprise', this, {
			supportsMultipleAccounts: true,
			supportedAuthorizationServers: uri ? [vscode.Uri.joinPath(uri, '/login/oauth')] : []
		});
	}

	async getSessions(scopes?: readonly string[], options: vscode.AuthenticationProviderSessionOptions = {}): Promise<vscode.AuthenticationSession[]> {
		const host = this._host;
		if (!host) {
			return [];
		}
		const sessions = await host.engine.getSessions(scopes && [...scopes], options);
		return this._host === host ? sessions : [];
	}

	async createSession(scopes: readonly string[], options: vscode.AuthenticationProviderSessionOptions = {}): Promise<vscode.AuthenticationSession> {
		const host = this.requireHost();
		const session = await host.engine.createSession([...scopes], options);
		if (this._host !== host) {
			throw new Error(vscode.l10n.t('The selected GitHub Enterprise instance is no longer configured.'));
		}
		return session;
	}

	async removeSession(id: string): Promise<void> {
		await this.requireHost().engine.removeSession(id);
	}

	private requireHost(): EnterpriseHost {
		if (!this._host) {
			throw new Error(this._configurationError);
		}
		return this._host;
	}

	private throwIfDisposed(): void {
		if (this._disposeCancellation.token.isCancellationRequested) {
			throw new vscode.CancellationError();
		}
	}

	dispose(): void {
		this._disposeCancellation.cancel();
		this._disposeCancellation.dispose();
		this._registration?.dispose();
		disposeHost(this._host);
		this._host = undefined;
		this._onDidChangeSessions.dispose();
	}
}
