/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccountInfo, AuthenticationResult, Configuration, InteractiveRequest, PublicClientApplication, SilentFlowRequest } from '@azure/msal-node';
import { SecretStorageCachePlugin } from '../common/cachePlugin';
import { SecretStorage, LogOutputChannel, Disposable, SecretStorageChangeEvent, EventEmitter, Memento, window, ProgressLocation, l10n } from 'vscode';
import { MsalLoggerOptions } from '../common/loggerOptions';
import { ICachedPublicClientApplication, ICachedPublicClientApplicationManager } from '../common/publicClientCache';
import { raceCancellationAndTimeoutError } from '../common/async';

export interface IPublicClientApplicationInfo {
	clientId: string;
	authority: string;
}

const _keyPrefix = 'pca:';

export class CachedPublicClientApplicationManager implements ICachedPublicClientApplicationManager {
	// The key is the clientId and authority stringified
	private readonly _pcas = new Map<string, CachedPublicClientApplication>();

	private _initialized = false;
	private _disposable: Disposable;

	constructor(
		private readonly _globalMemento: Memento,
		private readonly _secretStorage: SecretStorage,
		private readonly _logger: LogOutputChannel,
		private readonly _accountChangeHandler: (e: { added: AccountInfo[]; deleted: AccountInfo[] }) => void
	) {
		this._disposable = _secretStorage.onDidChange(e => this._handleSecretStorageChange(e));
	}

	async initialize() {
		this._logger.debug('[initialize] Initializing PublicClientApplicationManager');
		const keys = await this._secretStorage.get('publicClientApplications');
		if (!keys) {
			this._initialized = true;
			return;
		}

		const promises = new Array<Promise<ICachedPublicClientApplication>>();
		try {
			for (const key of JSON.parse(keys) as string[]) {
				try {
					const { clientId, authority } = JSON.parse(key) as IPublicClientApplicationInfo;
					// Load the PCA in memory
					promises.push(this.getOrCreate(clientId, authority));
				} catch (e) {
					// ignore
				}
			}
		} catch (e) {
			// data is corrupted
			this._logger.error('[initialize] Error initializing PublicClientApplicationManager:', e);
			await this._secretStorage.delete('publicClientApplications');
		}

		// TODO: should we do anything for when this fails?
		await Promise.allSettled(promises);
		this._logger.debug('[initialize] PublicClientApplicationManager initialized');
		this._initialized = true;
	}

	dispose() {
		this._disposable.dispose();
		Disposable.from(...this._pcas.values()).dispose();
	}

	async getOrCreate(clientId: string, authority: string): Promise<ICachedPublicClientApplication> {
		if (!this._initialized) {
			throw new Error('PublicClientApplicationManager not initialized');
		}

		// Use the clientId and authority as the key
		const pcasKey = JSON.stringify({ clientId, authority });
		let pca = this._pcas.get(pcasKey);
		if (pca) {
			this._logger.debug(`[getOrCreate] [${clientId}] [${authority}] PublicClientApplicationManager cache hit`);
			return pca;
		}

		this._logger.debug(`[getOrCreate] [${clientId}] [${authority}] PublicClientApplicationManager cache miss, creating new PCA...`);
		pca = new CachedPublicClientApplication(clientId, authority, this._globalMemento, this._secretStorage, this._accountChangeHandler, this._logger);
		this._pcas.set(pcasKey, pca);
		await pca.initialize();
		await this._storePublicClientApplications();
		this._logger.debug(`[getOrCreate] [${clientId}] [${authority}] PublicClientApplicationManager PCA created`);
		return pca;
	}

	getAll(): ICachedPublicClientApplication[] {
		if (!this._initialized) {
			throw new Error('PublicClientApplicationManager not initialized');
		}
		return Array.from(this._pcas.values());
	}

	private async _handleSecretStorageChange(e: SecretStorageChangeEvent) {
		if (!e.key.startsWith(_keyPrefix)) {
			return;
		}

		this._logger.debug(`[handleSecretStorageChange] PublicClientApplicationManager secret storage change: ${e.key}`);
		const result = await this._secretStorage.get(e.key);
		const pcasKey = e.key.split(_keyPrefix)[1];

		// If the cache was deleted, or the PCA has zero accounts left, remove the PCA
		if (!result || this._pcas.get(pcasKey)?.accounts.length === 0) {
			this._logger.debug(`[handleSecretStorageChange] PublicClientApplicationManager removing PCA: ${pcasKey}`);
			this._pcas.delete(pcasKey);
			await this._storePublicClientApplications();
			this._logger.debug(`[handleSecretStorageChange] PublicClientApplicationManager PCA removed: ${pcasKey}`);
			return;
		}

		// Load the PCA in memory if it's not already loaded
		const { clientId, authority } = JSON.parse(pcasKey) as IPublicClientApplicationInfo;
		this._logger.debug(`[handleSecretStorageChange] PublicClientApplicationManager loading PCA: ${pcasKey}`);
		await this.getOrCreate(clientId, authority);
		this._logger.debug(`[handleSecretStorageChange] PublicClientApplicationManager PCA loaded: ${pcasKey}`);
	}

	private async _storePublicClientApplications() {
		await this._secretStorage.store(
			'publicClientApplications',
			JSON.stringify(Array.from(this._pcas.keys()))
		);
	}
}

class CachedPublicClientApplication implements ICachedPublicClientApplication {
	private _pca: PublicClientApplication;

	private _accounts: AccountInfo[] = [];
	private readonly _disposable: Disposable;

	private readonly _loggerOptions = new MsalLoggerOptions(this._logger);
	private readonly _secretStorageCachePlugin = new SecretStorageCachePlugin(
		this._secretStorage,
		// Include the prefix in the key so we can easily identify it later
		`${_keyPrefix}${JSON.stringify({ clientId: this._clientId, authority: this._authority })}`
	);
	private readonly _config: Configuration = {
		auth: { clientId: this._clientId, authority: this._authority },
		system: {
			loggerOptions: {
				correlationId: `${this._clientId}] [${this._authority}`,
				loggerCallback: (level, message, containsPii) => this._loggerOptions.loggerCallback(level, message, containsPii),
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

	constructor(
		private readonly _clientId: string,
		private readonly _authority: string,
		private readonly _globalMemento: Memento,
		private readonly _secretStorage: SecretStorage,
		private readonly _accountChangeHandler: (e: { added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }) => void,
		private readonly _logger: LogOutputChannel
	) {
		this._pca = new PublicClientApplication(this._config);
		this._lastCreated = new Date();
		this._disposable = this._registerOnSecretStorageChanged();
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
		this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${this._authority}] [${request.scopes.join(' ')}]`);
		const result = await this._pca.acquireTokenSilent(request);
		if (result.account && !result.fromCache) {
			this._accountChangeHandler({ added: [], changed: [result.account], deleted: [] });
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
			), // 5 minutes
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
			this._accountChangeHandler({ added, changed: [], deleted });
			this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication accounts changed. added: ${added.length}, deleted: ${deleted.length}`);
		}
		this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication update complete`);
	}
}
