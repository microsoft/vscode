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
	// The key is the clientId
	private readonly _pcas = new Map<string, ICachedPublicClientApplication>();
	private readonly _pcaDisposables = new Map<string, Disposable>();

	private _disposable: Disposable;
	private _pcasSecretStorage: PublicClientApplicationsSecretStorage;

	private readonly _onDidAccountsChangeEmitter = new EventEmitter<{ added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }>();
	readonly onDidAccountsChange = this._onDidAccountsChangeEmitter.event;

	constructor(
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
		let clientIds: string[] | undefined;
		let migrations: Map<string, string[]> | undefined;
		try {
			migrations = await this._getMigrationsPerClientId();
			clientIds = await this._pcasSecretStorage.get();
		} catch (e) {
			// data is corrupted
			this._logger.error('[initialize] Error initializing PublicClientApplicationManager:', e);
			await this._pcasSecretStorage.delete();
		}
		if (!clientIds) {
			return;
		}

		const promises = new Array<Promise<ICachedPublicClientApplication>>();
		for (const clientId of clientIds) {
			try {
				// Load the PCA in memory
				promises.push(this._doCreatePublicClientApplication(clientId));
			} catch (e) {
				this._logger.error('[initialize] Error intitializing PCA:', clientId);
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
					const clientId = result.value.clientId;
					this._pcaDisposables.get(clientId)?.dispose();
					this._pcaDisposables.delete(clientId);
					this._pcas.delete(clientId);
					this._logger.debug(`[initialize] [${clientId}] PCA disposed because it's empty.`);
				}
			}
		}
		if (pcasChanged) {
			await this._storePublicClientApplications();
		}
		this._logger.debug('[initialize] PublicClientApplicationManager initialized');
	}

	private async _getMigrationsPerClientId(): Promise<Map<string, string[]> | undefined> {
		await this._pcasSecretStorage.initialize();
		const oldValue = await this._pcasSecretStorage.getOldValue();
		// returns a map of clientIds to the authorities found in the old value
		if (!oldValue) {
			return undefined;
		}
		const result = new Map<string, string[]>();
		for (const { clientId, authority } of oldValue) {
			if (!result.has(clientId)) {
				result.set(clientId, []);
			}
			result.get(clientId)?.push(authority);
		}
		return result;
	}

	dispose() {
		this._disposable.dispose();
		Disposable.from(...this._pcaDisposables.values()).dispose();
	}

	async getOrCreate(clientId: string, refreshTokensToMigrate?: string[]): Promise<ICachedPublicClientApplication> {
		let pca = this._pcas.get(clientId);
		if (pca) {
			this._logger.debug(`[getOrCreate] [${clientId}] PublicClientApplicationManager cache hit`);
		} else {
			this._logger.debug(`[getOrCreate] [${clientId}] PublicClientApplicationManager cache miss, creating new PCA...`);
			pca = await this._doCreatePublicClientApplication(clientId, refreshTokensToMigrate);
			await this._storePublicClientApplications();
			this._logger.debug(`[getOrCreate] [${clientId}] PCA created.`);
		}

		// TODO: MSAL Migration. Remove this when we remove the old flow.
		if (refreshTokensToMigrate?.length) {
			this._logger.debug(`[getOrCreate] [${clientId}] Migrating refresh tokens to PCA...`);
			for (const refreshToken of refreshTokensToMigrate) {
				try {
					// Use the refresh token to acquire a result. This will cache the refresh token for future operations.
					// The scopes don't matter here since we can create any token from the refresh token.
					const result = await pca.acquireTokenByRefreshToken({ refreshToken, forceCache: true, scopes: [] });
					if (result?.account) {
						this._logger.debug(`[getOrCreate] [${clientId}] Refresh token migrated to PCA.`);
					}
				} catch (e) {
					this._logger.error(`[getOrCreate] [${clientId}] Error migrating refresh token:`, e);
				}
			}
			// reinitialize the PCA so the account is properly cached
			await pca.initialize();
		}
		return pca;
	}

	private async _doCreatePublicClientApplication(clientId: string, authoritiesToMigrate?: string[]): Promise<ICachedPublicClientApplication> {
		const pca = new CachedPublicClientApplication(clientId, this._cloudName, this._secretStorage, this._logger, authoritiesToMigrate);
		this._pcas.set(clientId, pca);
		const disposable = Disposable.from(
			pca,
			pca.onDidAccountsChange(e => this._onDidAccountsChangeEmitter.fire(e)),
			pca.onDidRemoveLastAccount(() => {
				// The PCA has no more accounts, so we can dispose it so we're not keeping it
				// around forever.
				disposable.dispose();
				this._pcaDisposables.delete(clientId);
				this._pcas.delete(clientId);
				this._logger.debug(`[_doCreatePublicClientApplication] [${clientId}] PCA disposed. Firing off storing of PCAs...`);
				void this._storePublicClientApplications();
			})
		);
		this._pcaDisposables.set(clientId, disposable);
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
		for (const clientId of pcaKeysFromStorage) {
			try {
				this._logger.debug(`[_handleSecretStorageChange] [${clientId}] Creating new PCA that was created in another window...`);
				await this._doCreatePublicClientApplication(clientId);
				this._logger.debug(`[_handleSecretStorageChange] [${clientId}] PCA created.`);
			} catch (_e) {
				// This really shouldn't happen, but should we do something about this?
				this._logger.error(`Failed to create new PublicClientApplication: ${clientId}`);
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

	private readonly _oldKey = `publicClientApplications-${this._cloudName}`;
	private readonly _key = `publicClients-${this._cloudName}`;

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

	/**
	 * Runs the migration.
	 * TODO: Remove this after a version.
	 */
	async initialize() {
		const oldValue = await this.getOldValue();
		if (!oldValue) {
			return;
		}
		const newValue = await this.get() ?? [];
		for (const { clientId } of oldValue) {
			if (!newValue.includes(clientId)) {
				newValue.push(clientId);
			}
		}
		await this.store(newValue);
	}

	async get(): Promise<string[] | undefined> {
		const value = await this._secretStorage.get(this._key);
		if (!value) {
			return undefined;
		}
		return JSON.parse(value);
	}

	/**
	 * Old representation of data that included the authority. This should be removed in a version or 2.
	 * @returns An array of objects with clientId and authority
	 */
	async getOldValue(): Promise<{ clientId: string; authority: string }[] | undefined> {
		const value = await this._secretStorage.get(this._oldKey);
		if (!value) {
			return undefined;
		}
		const result: { clientId: string; authority: string }[] = [];
		for (const stringifiedObj of JSON.parse(value)) {
			const obj = JSON.parse(stringifiedObj);
			if (obj.clientId && obj.authority) {
				result.push(obj);
			}
		}
		return result;
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
