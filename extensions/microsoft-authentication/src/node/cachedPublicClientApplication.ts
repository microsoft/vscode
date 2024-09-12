/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PublicClientApplication, AccountInfo, Configuration, SilentFlowRequest, AuthenticationResult, InteractiveRequest, LogLevel } from '@azure/msal-node';
import { Disposable, Memento, SecretStorage, LogOutputChannel, window, ProgressLocation, l10n, EventEmitter } from 'vscode';
import { raceCancellationAndTimeoutError } from '../common/async';
import { SecretStorageCachePlugin } from '../common/cachePlugin';
import { MsalLoggerOptions } from '../common/loggerOptions';
import { ICachedPublicClientApplication } from '../common/publicClientCache';

export class CachedPublicClientApplication implements ICachedPublicClientApplication {
	private _pca: PublicClientApplication;
	private _sequencer = new Sequencer();

	private _accounts: AccountInfo[] = [];
	private readonly _disposable: Disposable;

	private readonly _loggerOptions = new MsalLoggerOptions(this._logger);
	private readonly _secretStorageCachePlugin = new SecretStorageCachePlugin(
		this._secretStorage,
		// Include the prefix as a differentiator to other secrets
		`pca:${JSON.stringify({ clientId: this._clientId, authority: this._authority })}`
	);
	private readonly _config: Configuration = {
		auth: { clientId: this._clientId, authority: this._authority },
		system: {
			loggerOptions: {
				correlationId: `${this._clientId}] [${this._authority}`,
				loggerCallback: (level, message, containsPii) => this._loggerOptions.loggerCallback(level, message, containsPii),
				logLevel: LogLevel.Trace
			}
		},
		cache: {
			cachePlugin: this._secretStorageCachePlugin
		}
	};

	/**
	 * We keep track of the last time an account was removed so we can recreate the PCA if we detect that an account was removed.
	 * This is due to MSAL-node not providing a way to detect when an account is removed from the cache. An internal issue has been
	 * filed to track this. If MSAL-node ever provides a way to detect this or handle this better in the Persistant Cache Plugin,
	 * we can remove this logic.
	 */
	private _lastCreated: Date;

	//#region Events

	private readonly _onDidAccountsChangeEmitter = new EventEmitter<{ added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }>;
	readonly onDidAccountsChange = this._onDidAccountsChangeEmitter.event;

	private readonly _onDidRemoveLastAccountEmitter = new EventEmitter<void>();
	readonly onDidRemoveLastAccount = this._onDidRemoveLastAccountEmitter.event;

	//#endregion

	constructor(
		private readonly _clientId: string,
		private readonly _authority: string,
		private readonly _globalMemento: Memento,
		private readonly _secretStorage: SecretStorage,
		private readonly _logger: LogOutputChannel
	) {
		this._pca = new PublicClientApplication(this._config);
		this._lastCreated = new Date();
		this._disposable = Disposable.from(
			this._registerOnSecretStorageChanged(),
			this._onDidAccountsChangeEmitter,
			this._onDidRemoveLastAccountEmitter
		);
	}

	get accounts(): AccountInfo[] { return this._accounts; }
	get clientId(): string { return this._clientId; }
	get authority(): string { return this._authority; }

	initialize(): Promise<void> {
		return this._update();
	}

	dispose(): void {
		this._disposable.dispose();
	}

	async acquireTokenSilent(request: SilentFlowRequest): Promise<AuthenticationResult> {
		this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${this._authority}] [${request.scopes.join(' ')}] [${request.account.username}] starting...`);
		const result = await this._sequencer.queue(() => this._pca.acquireTokenSilent(request));
		this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${this._authority}] [${request.scopes.join(' ')}] [${request.account.username}] got result`);
		if (result.account && !result.fromCache) {
			this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${this._authority}] [${request.scopes.join(' ')}] [${request.account.username}] firing event due to change`);
			this._onDidAccountsChangeEmitter.fire({ added: [], changed: [result.account], deleted: [] });
		}
		return result;
	}

	async acquireTokenInteractive(request: InteractiveRequest): Promise<AuthenticationResult> {
		this._logger.debug(`[acquireTokenInteractive] [${this._clientId}] [${this._authority}] [${request.scopes?.join(' ')}] loopbackClientOverride: ${request.loopbackClient ? 'true' : 'false'}`);
		return await window.withProgress(
			{
				location: ProgressLocation.Notification,
				cancellable: true,
				title: l10n.t('Signing in to Microsoft...')
			},
			(_process, token) => raceCancellationAndTimeoutError(
				this._pca.acquireTokenInteractive(request),
				token,
				1000 * 60 * 5
			)
		);
	}

	removeAccount(account: AccountInfo): Promise<void> {
		this._globalMemento.update(`lastRemoval:${this._clientId}:${this._authority}`, new Date());
		return this._pca.getTokenCache().removeAccount(account);
	}

	private _registerOnSecretStorageChanged() {
		return this._secretStorageCachePlugin.onDidChange(() => this._update());
	}

	private async _update() {
		const before = this._accounts;
		this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication update before: ${before.length}`);
		// Dates are stored as strings in the memento
		const lastRemovalDate = this._globalMemento.get<string>(`lastRemoval:${this._clientId}:${this._authority}`);
		if (lastRemovalDate && this._lastCreated && Date.parse(lastRemovalDate) > this._lastCreated.getTime()) {
			this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication removal detected... recreating PCA...`);
			this._pca = new PublicClientApplication(this._config);
			this._lastCreated = new Date();
		}

		const after = await this._pca.getAllAccounts();
		this._accounts = after;
		this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication update after: ${after.length}`);

		const beforeSet = new Set(before.map(b => b.homeAccountId));
		const afterSet = new Set(after.map(a => a.homeAccountId));

		const added = after.filter(a => !beforeSet.has(a.homeAccountId));
		const deleted = before.filter(b => !afterSet.has(b.homeAccountId));
		if (added.length > 0 || deleted.length > 0) {
			this._onDidAccountsChangeEmitter.fire({ added, changed: [], deleted });
			this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication accounts changed. added: ${added.length}, deleted: ${deleted.length}`);
			if (!after.length) {
				this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication final account deleted. Firing event.`);
				this._onDidRemoveLastAccountEmitter.fire();
			}
		}
		this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication update complete`);
	}
}

export class Sequencer {

	private current: Promise<unknown> = Promise.resolve(null);

	queue<T>(promiseTask: () => Promise<T>): Promise<T> {
		return this.current = this.current.then(() => promiseTask(), () => promiseTask());
	}
}
