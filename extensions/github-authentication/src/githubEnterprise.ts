/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CANCELLATION_ERROR } from './common/errors';
import { enterpriseUrisSetting, getEnterpriseUriKey } from './common/enterpriseConfiguration';
import { EnterpriseHostConfiguration, EnterpriseHostDescriptor, EnterpriseHostPlan, getEnterpriseHostConfigurations, getEnterpriseStorageCandidates, planEnterpriseHosts } from './common/enterpriseHosts';
import { AuthenticationProviderRegistration } from './common/authenticationProviderRegistration';
import { IAccountLink } from './common/accountLinks';
import { IGitHubAuthenticationProvider, IGitHubAuthenticationProviderFactory } from './github';

interface EnterpriseHost extends EnterpriseHostDescriptor {
	readonly authorizationServer: vscode.Uri;
	readonly prefix: string;
	readonly provider: IGitHubAuthenticationProvider;
	readonly listener: vscode.Disposable;
}

const identityPrefix = 'github-enterprise:';
const storageKeysKey = 'github-enterprise.storageKeys';

function disposeHost(host: EnterpriseHost): void {
	host.listener.dispose();
	host.provider.dispose();
}

export class GitHubEnterpriseAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
	private readonly _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	private _hosts = new Map<string, EnterpriseHost>();
	private readonly _lifetime = new vscode.CancellationTokenSource();
	private _pendingUpdate: Promise<void> = Promise.resolve();
	private _registration: vscode.Disposable | undefined;
	private _configurationError = vscode.l10n.t('Configure {0} before signing in to GitHub Enterprise.', enterpriseUrisSetting);

	constructor(
		private readonly _state: vscode.Memento,
		private readonly _secrets: vscode.SecretStorage,
		private readonly _providers: IGitHubAuthenticationProviderFactory,
	) { }

	update(uris: readonly vscode.Uri[], options?: { readonly error?: string; readonly legacyUri?: vscode.Uri }): Promise<void> {
		const update = () => this.applyConfiguration(uris, options);
		return this._pendingUpdate = this._pendingUpdate.then(update, update);
	}

	private async applyConfiguration(uris: readonly vscode.Uri[], options?: { readonly error?: string; readonly legacyUri?: vscode.Uri }): Promise<void> {
		this.checkCancellation();
		const configured = getEnterpriseHostConfigurations(uris, options?.legacyUri);
		const mappings = this._state.get<Record<string, string>>(storageKeysKey, {});
		const populated = await this.findPopulatedStorage(configured, mappings);
		const plan = planEnterpriseHosts(configured, [...this._hosts.values()], mappings, populated);
		this.checkCancellation();
		if (plan.storageChanged) {
			await this._state.update(storageKeysKey, plan.storageKeys);
		}
		this.checkCancellation();
		this._configurationError = options?.error ?? vscode.l10n.t('Configure {0} before signing in to GitHub Enterprise.', enterpriseUrisSetting);
		if (this._registration && !plan.added.length && !plan.removed.length) {
			return;
		}
		const created = this.createHosts(plan.added);
		const cancellation = this._lifetime.token.onCancellationRequested(() => created.forEach(disposeHost));
		try {
			const added = (await Promise.all(created.map(async host => (await host.provider.getSessions(undefined, {})).map(session => this.publishSession(host, session))))).flat();
			this.checkCancellation();
			const retired = plan.removed.map(host => this._hosts.get(host.key)!);
			const removed = (await Promise.all(retired.map(async host => (await host.provider.getSessionSnapshot()).map(session => this.publishSession(host, session))))).flat();
			this.checkCancellation();
			if (!await this.commitHosts(plan, created, retired, { added, removed, changed: [] })) {
				throw new vscode.CancellationError();
			}
		} catch (error) {
			created.forEach(disposeHost);
			throw error;
		} finally {
			cancellation.dispose();
		}
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

	private createHosts(descriptors: readonly EnterpriseHostDescriptor[]): EnterpriseHost[] {
		const created: EnterpriseHost[] = [];
		try {
			for (const descriptor of descriptors) {
				created.push(this.createHost(descriptor));
			}
			return created;
		} catch (error) {
			created.forEach(disposeHost);
			throw error;
		}
	}

	private createHost(descriptor: EnterpriseHostDescriptor): EnterpriseHost {
		const provider = this._providers.create(descriptor.uri, descriptor.storageKey);
		const host: EnterpriseHost = {
			...descriptor,
			authorizationServer: vscode.Uri.joinPath(descriptor.uri, '/login/oauth'),
			prefix: `${identityPrefix}${encodeURIComponent(descriptor.key)}:`,
			provider,
			listener: provider.onDidChangeSessions(event => {
				if (this._hosts.get(host.key) === host) {
					this._onDidChangeSessions.fire({
						added: event.added?.map(session => this.publishSession(host, session)),
						removed: event.removed?.map(session => this.publishSession(host, session)),
						changed: event.changed?.map(session => this.publishSession(host, session))
					});
				}
			})
		};
		return host;
	}

	private commitHosts(plan: EnterpriseHostPlan, created: readonly EnterpriseHost[], retired: readonly EnterpriseHost[], event: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent): Promise<boolean> {
		const added = new Map(created.map(host => [host.key, host]));
		this._hosts = new Map(plan.hosts.map(host => [host.key, added.get(host.key) ?? this._hosts.get(host.key)!]));
		this._registration?.dispose();
		const registration = new AuthenticationProviderRegistration('github-enterprise', 'GitHub Enterprise', this, {
			supportsMultipleAccounts: true,
			supportedAuthorizationServers: [...this._hosts.values()].map(host => host.authorizationServer)
		});
		this._registration = registration;
		retired.forEach(disposeHost);
		if (event.added?.length || event.removed?.length) {
			this._onDidChangeSessions.fire(event);
		}
		return registration.whenRegistered;
	}

	private checkCancellation(): void {
		if (this._lifetime.token.isCancellationRequested) {
			throw new vscode.CancellationError();
		}
	}

	async getSessions(scopes?: readonly string[], options: vscode.AuthenticationProviderSessionOptions = {}): Promise<vscode.AuthenticationSession[]> {
		const host = this.resolveHost(options);
		const candidates = host ? [host] : [...this._hosts.values()];
		const sessions = await Promise.all(candidates.map(async candidate => {
			const sessions = await candidate.provider.getSessions(scopes && [...scopes], this.nativeOptions(candidate, options));
			if (this._hosts.get(getEnterpriseUriKey(candidate.uri)) !== candidate) {
				return [];
			}
			return sessions.map(session => this.publishSession(candidate, session));
		}));
		return sessions.flat();
	}

	async createSession(scopes: readonly string[], options: vscode.AuthenticationProviderSessionOptions = {}): Promise<vscode.AuthenticationSession> {
		let host = this.resolveHost(options);
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
		const session = await host.provider.createSession(scopes, this.nativeOptions(host, options));
		this.requireConfiguredHost(host);
		return this.publishSession(host, session);
	}

	async removeSession(id: string): Promise<void> {
		const host = this.hostForIdentity(id);
		if (!host) {
			throw new Error(vscode.l10n.t('The GitHub Enterprise session does not belong to a configured instance.'));
		}
		await host.provider.removeSession(id.slice(host.prefix.length));
	}

	private resolveHost(options: vscode.AuthenticationProviderSessionOptions): EnterpriseHost | undefined {
		let serverHost: EnterpriseHost | undefined;
		if (options.authorizationServer) {
			const key = getEnterpriseUriKey(options.authorizationServer);
			serverHost = [...this._hosts.values()].find(host => getEnterpriseUriKey(host.authorizationServer) === key);
			if (!serverHost) {
				throw new Error(vscode.l10n.t('The requested GitHub Enterprise authorization server is not configured.'));
			}
		}
		const accountHost = options.account && this.hostForIdentity(options.account.id);
		if (options.account?.id.startsWith(identityPrefix) && !accountHost) {
			throw new Error(vscode.l10n.t('The requested GitHub Enterprise account belongs to an instance that is no longer configured.'));
		}
		if (serverHost && accountHost && serverHost !== accountHost) {
			throw new Error(vscode.l10n.t('The GitHub Enterprise account and authorization server belong to different instances.'));
		}
		return serverHost ?? accountHost;
	}

	private hostForIdentity(id: string): EnterpriseHost | undefined {
		return [...this._hosts.values()].find(host => id.startsWith(host.prefix));
	}

	private nativeOptions(host: EnterpriseHost, options: vscode.AuthenticationProviderSessionOptions): vscode.AuthenticationProviderSessionOptions {
		if (!options.account?.id.startsWith(host.prefix)) {
			return options;
		}
		const suffix = ` (${host.uri.toString(true)})`;
		if (!options.account.label.endsWith(suffix)) {
			throw new Error(vscode.l10n.t('The GitHub Enterprise account does not match its instance.'));
		}
		return {
			...options,
			account: {
				...options.account,
				id: options.account.id.slice(host.prefix.length),
				label: options.account.label.slice(0, -suffix.length)
			}
		};
	}

	private publishSession(host: EnterpriseHost, session: vscode.AuthenticationSession): vscode.AuthenticationSession {
		if (!session.authorizationServer || getEnterpriseUriKey(session.authorizationServer) !== getEnterpriseUriKey(host.authorizationServer)) {
			throw new Error(vscode.l10n.t('The GitHub Enterprise session does not belong to its instance.'));
		}
		return {
			...session,
			id: `${host.prefix}${session.id}`,
			account: {
				...session.account,
				id: `${host.prefix}${session.account.id}`,
				label: `${session.account.label} (${host.uri.toString(true)})`
			}
		};
	}

	private requireConfiguredHost(host: EnterpriseHost): void {
		if (this._hosts.get(getEnterpriseUriKey(host.uri)) !== host) {
			throw new Error(vscode.l10n.t('The selected GitHub Enterprise instance is no longer configured.'));
		}
	}

	dispose(): void {
		this._lifetime.cancel();
		this._lifetime.dispose();
		this._registration?.dispose();
		this._hosts.forEach(disposeHost);
		this._hosts.clear();
		this._onDidChangeSessions.dispose();
	}
}
