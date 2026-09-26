/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthenticationProviderRegistration } from './common/authenticationProviderRegistration';
import { IGitHubAuthenticationProvider, IGitHubAuthenticationProviderFactory } from './github';

interface EnterpriseHost {
	readonly uri: vscode.Uri;
	readonly storageKey: string;
	readonly provider: IGitHubAuthenticationProvider;
	readonly listener: vscode.Disposable;
}

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

	constructor(private readonly _providers: IGitHubAuthenticationProviderFactory) { }

	update(uri?: vscode.Uri, error?: string): Promise<void> {
		const update = () => this.applyConfiguration(uri, error);
		return this._pendingUpdate = this._pendingUpdate.then(update, update);
	}

	private async applyConfiguration(uri: vscode.Uri | undefined, error: string | undefined): Promise<void> {
		this.checkCancellation();
		this._configurationError = error ?? vscode.l10n.t('Configure github-enterprise.uri before signing in to GitHub Enterprise.');
		if (this._registration && this._host?.uri.toString() === uri?.toString()) {
			return;
		}
		const next = uri && this.createHost(uri, `${uri.authority}${uri.path}.ghes.auth`);
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

	private createHost(uri: vscode.Uri, storageKey: string): EnterpriseHost {
		const provider = this._providers.create(uri, storageKey);
		return {
			uri,
			storageKey,
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
