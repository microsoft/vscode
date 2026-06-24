/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccountInfo } from '@azure/msal-node';
import { SecretStorage, LogOutputChannel, Disposable, EventEmitter, Memento, Event } from 'vscode';
import { ICachedPublicClientApplication, ICachedPublicClientApplicationManager } from '../common/publicClientCache';
import { CachedPublicClientApplication } from './cachedPublicClientApplication';
import { IAccountAccess, ScopedAccountAccess } from '../common/accountAccess';
import { MicrosoftAuthenticationTelemetryReporter } from '../common/telemetryReporter';
import { Environment } from '@azure/ms-rest-azure-env';
import { Config } from '../common/config';
import { DEFAULT_REDIRECT_URI } from '../common/env';

export interface IPublicClientApplicationInfo {
	clientId: string;
	authority: string;
}

export class CachedPublicClientApplicationManager implements ICachedPublicClientApplicationManager {
	// The key is the clientId
	private readonly _pcas = new Map<string, ICachedPublicClientApplication>();
	private readonly _pcaDisposables = new Map<string, Disposable>();

	private _disposable: Disposable;

	private readonly _onDidAccountsChangeEmitter = new EventEmitter<{ added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }>();
	readonly onDidAccountsChange = this._onDidAccountsChangeEmitter.event;

	private constructor(
		private readonly _env: Environment,
		private readonly _pcasSecretStorage: IPublicClientApplicationSecretStorage,
		private readonly _accountAccess: IAccountAccess,
		private readonly _secretStorage: SecretStorage,
		private readonly _logger: LogOutputChannel,
		private readonly _telemetryReporter: MicrosoftAuthenticationTelemetryReporter,
		disposables: Disposable[]
	) {
		this._disposable = Disposable.from(
			...disposables,
			this._registerSecretStorageHandler(),
			this._onDidAccountsChangeEmitter
		);
	}

	static async create(
		secretStorage: SecretStorage,
		logger: LogOutputChannel,
		telemetryReporter: MicrosoftAuthenticationTelemetryReporter,
		env: Environment
	): Promise<CachedPublicClientApplicationManager> {
		const pcasSecretStorage = await PublicClientApplicationsSecretStorage.create(secretStorage, env.name);
		// TODO: Remove the migrations in a version
		const migrations = await pcasSecretStorage.getOldValue();
		const accountAccess = await ScopedAccountAccess.create(secretStorage, env.name, logger, migrations);
		const manager = new CachedPublicClientApplicationManager(env, pcasSecretStorage, accountAccess, secretStorage, logger, telemetryReporter, [pcasSecretStorage, accountAccess]);
		await manager.initialize();
		return manager;
	}

	private _registerSecretStorageHandler() {
		return this._pcasSecretStorage.onDidChange(() => this._handleSecretStorageChange());
	}

	private async initialize() {
		this._logger.debug('[initialize] Initializing PublicClientApplicationManager');
		let clientIds: string[] | undefined;
		try {
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

	dispose() {
		this._disposable.dispose();
		Disposable.from(...this._pcaDisposables.values()).dispose();
	}

	async getOrCreate(clientId: string, migrate?: { refreshTokensToMigrate?: string[]; tenant: string }): Promise<ICachedPublicClientApplication> {
		let pca = this._pcas.get(clientId);
		if (pca) {
			this._logger.debug(`[getOrCreate] [${clientId}] PublicClientApplicationManager cache hit`);
		} else {
			this._logger.debug(`[getOrCreate] [${clientId}] PublicClientApplicationManager cache miss, creating new PCA...`);
			pca = await this._doCreatePublicClientApplication(clientId);
			await this._storePublicClientApplications();
			this._logger.debug(`[getOrCreate] [${clientId}] PCA created.`);
		}

		// TODO: MSAL Migration. Remove this when we remove the old flow.
		if (migrate?.refreshTokensToMigrate?.length) {
			this._logger.debug(`[getOrCreate] [${clientId}] Migrating refresh tokens to PCA...`);
			const authority = new URL(migrate.tenant, this._env.activeDirectoryEndpointUrl).toString();
			let redirectUri = DEFAULT_REDIRECT_URI;
			if (pca.isBrokerAvailable && process.platform === 'darwin') {
				redirectUri = Config.macOSBrokerRedirectUri;
			}
			for (const refreshToken of migrate.refreshTokensToMigrate) {
				try {
					// Use the refresh token to acquire a result. This will cache the refresh token for future operations.
					// The scopes don't matter here since we can create any token from the refresh token.
					const result = await pca.acquireTokenByRefreshToken({
						refreshToken,
						forceCache: true,
						scopes: [],
						authority,
						redirectUri
					});
					if (result?.account) {
						this._logger.debug(`[getOrCreate] [${clientId}] Refresh token migrated to PCA.`);
					}
				} catch (e) {
					this._logger.error(`[getOrCreate] [${clientId}] Error migrating refresh token:`, e);
				}
			}
		}
		return pca;
	}

	private async _doCreatePublicClientApplication(clientId: string): Promise<ICachedPublicClientApplication> {
		const pca = await CachedPublicClientApplication.create(clientId, this._secretStorage, this._accountAccess, this._logger, this._telemetryReporter);
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
		// Fire for the initial state and only if accounts exist
		if (pca.accounts.length > 0) {
			this._onDidAccountsChangeEmitter.fire({ added: pca.accounts, changed: [], deleted: [] });
		}
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

interface IPublicClientApplicationSecretStorage {
	get(): Promise<string[] | undefined>;
	getOldValue(): Promise<{ clientId: string; authority: string }[] | undefined>;
	store(value: string[]): Thenable<void>;
	delete(): Thenable<void>;
	onDidChange: Event<void>;
}

class PublicClientApplicationsSecretStorage implements IPublicClientApplicationSecretStorage, Disposable {
	private _disposable: Disposable;

	private readonly _onDidChangeEmitter = new EventEmitter<void>;
	readonly onDidChange: Event<void> = this._onDidChangeEmitter.event;

	private readonly _oldKey: string;
	private readonly _key: string;

	private constructor(
		private readonly _secretStorage: SecretStorage,
		private readonly _cloudName: string
	) {
		this._oldKey = `publicClientApplications-${this._cloudName}`;
		this._key = `publicClients-${this._cloudName}`;

		this._disposable = Disposable.from(
			this._onDidChangeEmitter,
			this._secretStorage.onDidChange(e => {
				if (e.key === this._key) {
					this._onDidChangeEmitter.fire();
				}
			})
		);
	}

	static async create(secretStorage: SecretStorage, cloudName: string): Promise<PublicClientApplicationsSecretStorage> {
		const storage = new PublicClientApplicationsSecretStorage(secretStorage, cloudName);
		await storage.initialize();
		return storage;
	}

	/**
	 * Runs the migration.
	 * TODO: Remove this after a version.
	 */
	private async initialize() {
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
