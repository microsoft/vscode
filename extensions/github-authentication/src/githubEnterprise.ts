/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthenticationProviderRegistration } from './common/authenticationProviderRegistration';
import { IAccountLink } from './common/accountLinks';
import { getEnterpriseUriKey } from './common/enterpriseConfiguration';
import { EnterpriseHostConfiguration, EnterpriseHostDescriptor, getEnterpriseHostConfigurations, getEnterpriseStorageCandidates, planEnterpriseHosts } from './common/enterpriseHosts';
import { IGitHubAuthenticationProvider, IGitHubAuthenticationProviderFactory } from './github';

interface EnterpriseHost extends EnterpriseHostDescriptor {
	readonly provider: IGitHubAuthenticationProvider;
	readonly listener: vscode.Disposable;
}

const storageKeysKey = 'github-enterprise.storageKeys';

function disposeHost(host: EnterpriseHost | undefined): void {
	host?.listener.dispose();
	host?.provider.dispose();
}

export class GitHubEnterpriseAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
	private readonly _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	private readonly _lifetime = new vscode.CancellationTokenSource();
	private _host: EnterpriseHost | undefined;
	private _registration: vscode.Disposable | undefined;
	private _pendingUpdate: Promise<void> = Promise.resolve();
	private _configurationError = vscode.l10n.t('Configure github-enterprise.uri before signing in to GitHub Enterprise.');

	constructor(
		private readonly _state: vscode.Memento,
		private readonly _secrets: vscode.SecretStorage,
		private readonly _providers: IGitHubAuthenticationProviderFactory
	) { }

	update(uri?: vscode.Uri, error?: string): Promise<void> {
		const update = () => this.applyConfiguration(uri, error);
		return this._pendingUpdate = this._pendingUpdate.then(update, update);
	}

	private async applyConfiguration(uri: vscode.Uri | undefined, error: string | undefined): Promise<void> {
		this.checkCancellation();
		const descriptor = await this.resolveHost(uri);
		this.checkCancellation();
		this._configurationError = error ?? vscode.l10n.t('Configure github-enterprise.uri before signing in to GitHub Enterprise.');
		if (this._registration && this._host?.key === descriptor?.key && this._host?.storageKey === descriptor?.storageKey) {
			return;
		}
		const next = descriptor && this.createHost(descriptor);
		const cancellation = this._lifetime.token.onCancellationRequested(() => disposeHost(next));
		try {
			const added = next ? await next.provider.getSessions(undefined, {}) : [];
			this.checkCancellation();
			const previous = this._host;
			const removed = previous ? await previous.provider.getSessionSnapshot() : [];
			this.checkCancellation();
			this._host = next;
			this._registration?.dispose();
			const registration = new AuthenticationProviderRegistration('github-enterprise', uri?.authority ?? 'GitHub Enterprise', this, {
				supportsMultipleAccounts: true,
				supportedAuthorizationServers: uri ? [vscode.Uri.joinPath(uri, '/login/oauth')] : []
			});
			this._registration = registration;
			disposeHost(previous);
			if (added.length || removed.length) {
				this._onDidChangeSessions.fire({ added, removed, changed: [] });
			}
			if (!await registration.whenRegistered) {
				throw new vscode.CancellationError();
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
		const mappings = this._state.get<Record<string, string>>(storageKeysKey, {});
		const populated = await this.findPopulatedStorage(configured, mappings);
		const plan = planEnterpriseHosts(configured, this._host ? [this._host] : [], mappings, populated);
		this.checkCancellation();
		if (plan.storageChanged) {
			await this._state.update(storageKeysKey, plan.storageKeys);
		}
		return uri ? plan.hosts.find(host => host.key === getEnterpriseUriKey(uri)) : undefined;
	}

	private async findPopulatedStorage(configured: readonly EnterpriseHostConfiguration[], mappings: Readonly<Record<string, string>>): Promise<ReadonlySet<string>> {
		const keys = [...new Set(configured.flatMap(host => getEnterpriseStorageCandidates(host, mappings[host.key])))];
		const occupied = await Promise.all(keys.map(async key => {
			const token = await this._secrets.get(key);
			const links = this._state.get<readonly IAccountLink[]>(`${key}.microsoftAccountLinks`, []);
			return (token && token !== '[]') || links.length ? key : undefined;
		}));
		return new Set(occupied.filter((key): key is string => key !== undefined));
	}

	private createHost(descriptor: EnterpriseHostDescriptor): EnterpriseHost {
		const provider = this._providers.create(descriptor.uri, descriptor.storageKey);
		return {
			...descriptor,
			provider,
			listener: provider.onDidChangeSessions(event => {
				if (this._host?.provider === provider) {
					this._onDidChangeSessions.fire(event);
				}
			})
		};
	}

	async getSessions(scopes?: readonly string[], options: vscode.AuthenticationProviderSessionOptions = {}): Promise<vscode.AuthenticationSession[]> {
		const host = this._host;
		if (!host) {
			return [];
		}
		const sessions = await host.provider.getSessions(scopes && [...scopes], options);
		return this._host === host ? sessions : [];
	}

	async createSession(scopes: readonly string[], options: vscode.AuthenticationProviderSessionOptions = {}): Promise<vscode.AuthenticationSession> {
		const host = this.requireHost();
		const session = await host.provider.createSession(scopes, options);
		if (this._host !== host) {
			throw new Error(vscode.l10n.t('The selected GitHub Enterprise instance is no longer configured.'));
		}
		return session;
	}

	async removeSession(id: string): Promise<void> {
		await this.requireHost().provider.removeSession(id);
	}

	private requireHost(): EnterpriseHost {
		if (!this._host) {
			throw new Error(this._configurationError);
		}
		return this._host;
	}

	private checkCancellation(): void {
		if (this._lifetime.token.isCancellationRequested) {
			throw new vscode.CancellationError();
		}
	}

	dispose(): void {
		this._lifetime.cancel();
		this._lifetime.dispose();
		this._registration?.dispose();
		disposeHost(this._host);
		this._host = undefined;
		this._onDidChangeSessions.dispose();
	}
}
