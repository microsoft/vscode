/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccountInfo } from '@azure/msal-node';
import { SecretStorage, LogOutputChannel, Disposable, EventEmitter, Memento, Event } from 'vscode';
import { ICachedPublicClientApplication, ICachedPublicClientApplicationManager } from '../common/publicClientCache';
import { CachedPublicClientApplication } from './cachedPublicClientApplication';

export interface IPublicClientApplicationInfo {
	clientId: string;
	authority: string;
}

export class CachedPublicClientApplicationManager implements ICachedPublicClientApplicationManager {
	// The key is the clientId and authority JSON stringified
	private readonly _pcas = new Map<string, CachedPublicClientApplication>();
	private readonly _pcaDisposables = new Map<string, Disposable>();

	private _disposable: Disposable;
	private _pcasSecretStorage: PublicClientApplicationsSecretStorage;

	private readonly _onDidAccountsChangeEmitter = new EventEmitter<{ added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }>();
	readonly onDidAccountsChange = this._onDidAccountsChangeEmitter.event;

	constructor(
		private readonly _globalMemento: Memento,
		private readonly _secretStorage: SecretStorage,
		private readonly _logger: LogOutputChannel,
		private readonly _cloudName: string
	) {
		this._pcasSecretStorage = new PublicClientApplicationsSecretStorage(_secretStorage, _cloudName);
		this._disposable = Disposable.from(
			this._pcasSecretStorage,
			this._registerSecretStorageHandler(),
			this._onDidAccountsChangeEmitter
		);
	}

	private _registerSecretStorageHandler() {
		return this._pcasSecretStorage.onDidChange(() => this._handleSecretStorageChange());
	}

	async initialize() {
		this._logger.debug('[initialize] Initializing PublicClientApplicationManager');
		let keys: string[] | undefined;
		try {
			keys = await this._pcasSecretStorage.get();
		} catch (e) {
			// data is corrupted
			this._logger.error('[initialize] Error initializing PublicClientApplicationManager:', e);
			await this._pcasSecretStorage.delete();
		}
		if (!keys) {
			return;
		}

		const promises = new Array<Promise<ICachedPublicClientApplication>>();
		for (const key of keys) {
			try {
				const { clientId, authority } = JSON.parse(key) as IPublicClientApplicationInfo;
				// Load the PCA in memory
				promises.push(this._doCreatePublicClientApplication(clientId, authority, key));
			} catch (e) {
				this._logger.error('[initialize] Error intitializing PCA:', key);
			}
		}

		const results = await Promise.allSettled(promises);
		let pcasChanged = false;
		for (const result of results) {
			if (result.status === 'rejected') {
				this._logger.error('[initialize] Error getting PCA:', result.reason);
			} else {
				if (!result.value.accounts.length) {
					pcasChanged = true;
					const pcaKey = JSON.stringify({ clientId: result.value.clientId, authority: result.value.authority });
					this._pcaDisposables.get(pcaKey)?.dispose();
					this._pcaDisposables.delete(pcaKey);
					this._pcas.delete(pcaKey);
					this._logger.debug(`[initialize] [${result.value.clientId}] [${result.value.authority}] PCA disposed because it's empty.`);
				}
			}
		}
		if (pcasChanged) {
			await this._storePublicClientApplications();
		}
		this._logger.debug('[initialize] PublicClientApplicationManager initialized');
	}

	dispose() {
		this._disposable.dispose();
		Disposable.from(...this._pcaDisposables.values()).dispose();
	}

	async getOrCreate(clientId: string, authority: string, refreshTokensToMigrate?: string[]): Promise<ICachedPublicClientApplication> {
		// Use the clientId and authority as the key
		const pcasKey = JSON.stringify({ clientId, authority });
		let pca = this._pcas.get(pcasKey);
		if (pca) {
			this._logger.debug(`[getOrCreate] [${clientId}] [${authority}] PublicClientApplicationManager cache hit`);
		} else {
			this._logger.debug(`[getOrCreate] [${clientId}] [${authority}] PublicClientApplicationManager cache miss, creating new PCA...`);
			pca = await this._doCreatePublicClientApplication(clientId, authority, pcasKey);
			await this._storePublicClientApplications();
			this._logger.debug(`[getOrCreate] [${clientId}] [${authority}] PCA created.`);
		}

		// TODO: MSAL Migration. Remove this when we remove the old flow.
		if (refreshTokensToMigrate?.length) {
			this._logger.debug(`[getOrCreate] [${clientId}] [${authority}] Migrating refresh tokens to PCA...`);
			for (const refreshToken of refreshTokensToMigrate) {
				try {
					// Use the refresh token to acquire a result. This will cache the refresh token for future operations.
					// The scopes don't matter here since we can create any token from the refresh token.
					const result = await pca.acquireTokenByRefreshToken({ refreshToken, forceCache: true, scopes: [] });
					if (result?.account) {
						this._logger.debug(`[getOrCreate] [${clientId}] [${authority}] Refresh token migrated to PCA.`);
					}
				} catch (e) {
					this._logger.error(`[getOrCreate] [${clientId}] [${authority}] Error migrating refresh token:`, e);
				}
			}
			// reinitialize the PCA so the account is properly cached
			await pca.initialize();
		}
		return pca;
	}

	private async _doCreatePublicClientApplication(clientId: string, authority: string, pcasKey: string) {
		const pca = new CachedPublicClientApplication(clientId, authority, this._cloudName, this._globalMemento, this._secretStorage, this._logger);
		this._pcas.set(pcasKey, pca);
		const disposable = Disposable.from(
			pca,
			pca.onDidAccountsChange(e => this._onDidAccountsChangeEmitter.fire(e)),
			pca.onDidRemoveLastAccount(() => {
				// The PCA has no more accounts, so we can dispose it so we're not keeping it
				// around forever.
				disposable.dispose();
				this._pcaDisposables.delete(pcasKey);
				this._pcas.delete(pcasKey);
				this._logger.debug(`[_doCreatePublicClientApplication] [${clientId}] [${authority}] PCA disposed. Firing off storing of PCAs...`);
				void this._storePublicClientApplications();
			})
		);
		this._pcaDisposables.set(pcasKey, disposable);
		// Intialize the PCA after the `onDidAccountsChange` is set so we get initial state.
		await pca.initialize();
		return pca;
	}

	getAll(): ICachedPublicClientApplication[] {
		return Array.from(this._pcas.values());
	}

	private async _handleSecretStorageChange() {
		this._logger.debug(`[_handleSecretStorageChange] Handling PCAs secret storage change...`);
		let result: string[] | undefined;
		try {
			result = await this._pcasSecretStorage.get();
		} catch (_e) {
			// The data in secret storage has been corrupted somehow so
			// we store what we have in this window
			await this._storePublicClientApplications();
			return;
		}
		if (!result) {
			this._logger.debug(`[_handleSecretStorageChange] PCAs deleted in secret storage. Disposing all...`);
			Disposable.from(...this._pcaDisposables.values()).dispose();
			this._pcas.clear();
			this._pcaDisposables.clear();
			this._logger.debug(`[_handleSecretStorageChange] Finished PCAs secret storage change.`);
			return;
		}

		const pcaKeysFromStorage = new Set(result);
		// Handle the deleted ones
		for (const pcaKey of this._pcas.keys()) {
			if (!pcaKeysFromStorage.delete(pcaKey)) {
				this._logger.debug(`[_handleSecretStorageChange] PCA was deleted in another window: ${pcaKey}`);
			}
		}

		// Handle the new ones
		for (const newPca of pcaKeysFromStorage) {
			try {
				const { clientId, authority } = JSON.parse(newPca);
				this._logger.debug(`[_handleSecretStorageChange] [${clientId}] [${authority}] Creating new PCA that was created in another window...`);
				await this._doCreatePublicClientApplication(clientId, authority, newPca);
				this._logger.debug(`[_handleSecretStorageChange] [${clientId}] [${authority}] PCA created.`);
			} catch (_e) {
				// This really shouldn't happen, but should we do something about this?
				this._logger.error(`Failed to parse new PublicClientApplication: ${newPca}`);
				continue;
			}
		}

		this._logger.debug('[_handleSecretStorageChange] Finished handling PCAs secret storage change.');
	}

	private _storePublicClientApplications() {
		return this._pcasSecretStorage.store(Array.from(this._pcas.keys()));
	}
}

class PublicClientApplicationsSecretStorage {
	private _disposable: Disposable;

	private readonly _onDidChangeEmitter = new EventEmitter<void>;
	readonly onDidChange: Event<void> = this._onDidChangeEmitter.event;

	private readonly _key = `publicClientApplications-${this._cloudName}`;

	constructor(private readonly _secretStorage: SecretStorage, private readonly _cloudName: string) {
		this._disposable = Disposable.from(
			this._onDidChangeEmitter,
			this._secretStorage.onDidChange(e => {
				if (e.key === this._key) {
					this._onDidChangeEmitter.fire();
				}
			})
		);
	}

	async get(): Promise<string[] | undefined> {
		const value = await this._secretStorage.get(this._key);
		if (!value) {
			return undefined;
		}
		return JSON.parse(value);
	}

	store(value: string[]): Thenable<void> {
		return this._secretStorage.store(this._key, JSON.stringify(value));
	}

	delete(): Thenable<void> {
		return this._secretStorage.delete(this._key);
	}

	dispose() {
		this._disposable.dispose();
	}
}
