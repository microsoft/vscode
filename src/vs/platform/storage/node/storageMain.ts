/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { SQLiteStorageDatabase, ISQLiteStorageDatabaseLoggingOptions } from 'vs/base/parts/storage/node/storage';
import { Storage, IStorage, InMemoryStorageDatabase } from 'vs/base/parts/storage/common/storage';
import { join } from 'vs/base/common/path';
import { IS_NEW_KEY } from 'vs/platform/storage/common/storage';
import { currentSessionDateStorageKey, firstSessionDateStorageKey, instanceStorageKey, lastSessionDateStorageKey } from 'vs/platform/telemetry/common/telemetry';
import { generateUuid } from 'vs/base/common/uuid';

/**
 * Provides access to global and workspace storage from the
 * electron-main side that is the owner of all storage connections.
 */
export interface IStorageMain {

	/**
	 * Emitted whenever data is updated or deleted.
	 */
	readonly onDidChangeStorage: Event<IStorageChangeEvent>;

	/**
	 * Emitted when the storage is about to persist. This is the right time
	 * to persist data to ensure it is stored before the application shuts
	 * down.
	 *
	 * Note: this event may be fired many times, not only on shutdown to prevent
	 * loss of state in situations where the shutdown is not sufficient to
	 * persist the data properly.
	 */
	readonly onWillSaveState: Event<void>;

	/**
	 * Access to all cached items of this storage service.
	 */
	readonly items: Map<string, string>;

	/**
	 * Required call to ensure the service can be used.
	 */
	initialize(): Promise<void>;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined.
	 */
	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a boolean.
	 */
	getBoolean(key: string, fallbackValue: boolean): boolean;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a number using parseInt with a base of 10.
	 */
	getNumber(key: string, fallbackValue: number): number;
	getNumber(key: string, fallbackValue?: number): number | undefined;

	/**
	 * Store a string value under the given key to storage. The value will
	 * be converted to a string.
	 */
	store(key: string, value: string | boolean | number | undefined | null): void;

	/**
	 * Delete an element stored under the provided key from storage.
	 */
	remove(key: string): void;

	/**
	 * Close the storage connection.
	 */
	close(): Promise<void>;
}

export interface IStorageChangeEvent {
	key: string;
}

export class GlobalStorageMain extends Disposable implements IStorageMain {

	private static readonly STORAGE_NAME = 'state.vscdb';

	private readonly _onDidChangeStorage = this._register(new Emitter<IStorageChangeEvent>());
	readonly onDidChangeStorage = this._onDidChangeStorage.event;

	private readonly _onWillSaveState = this._register(new Emitter<void>());
	readonly onWillSaveState = this._onWillSaveState.event;

	get items(): Map<string, string> { return this.storage.items; }

	private storage: IStorage;

	private initializePromise: Promise<void> | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
		super();

		// Until the storage has been initialized, it can only be in memory
		this.storage = new Storage(new InMemoryStorageDatabase());
	}

	private get storagePath(): string {
		if (!!this.environmentService.extensionTestsLocationURI) {
			return SQLiteStorageDatabase.IN_MEMORY_PATH; // no storage during extension tests!
		}

		return join(this.environmentService.globalStorageHome.fsPath, GlobalStorageMain.STORAGE_NAME);
	}

	private createLogginOptions(): ISQLiteStorageDatabaseLoggingOptions {
		return {
			logTrace: (this.logService.getLevel() === LogLevel.Trace) ? msg => this.logService.trace(msg) : undefined,
			logError: error => this.logService.error(error)
		};
	}

	initialize(): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = this.doInitialize();
		}

		return this.initializePromise;
	}

	private async doInitialize(): Promise<void> {
		this.storage.dispose();
		this.storage = new Storage(new SQLiteStorageDatabase(this.storagePath, {
			logging: this.createLogginOptions()
		}));

		this._register(this.storage.onDidChangeStorage(key => this._onDidChangeStorage.fire({ key })));

		await this.storage.init();

		// Check to see if this is the first time we are "opening" the application
		const firstOpen = this.storage.getBoolean(IS_NEW_KEY);
		if (firstOpen === undefined) {
			this.storage.set(IS_NEW_KEY, true);
		} else if (firstOpen) {
			this.storage.set(IS_NEW_KEY, false);
		}

		// Apply global telemetry values as part of the initialization
		this.storeTelemetryStateOnce();
	}

	private storeTelemetryStateOnce(): void {
		const instanceId = this.get(instanceStorageKey, undefined);
		if (instanceId === undefined) {
			this.store(instanceStorageKey, generateUuid());
		}

		const firstSessionDate = this.get(firstSessionDateStorageKey, undefined);
		if (firstSessionDate === undefined) {
			this.store(firstSessionDateStorageKey, new Date().toUTCString());
		}

		const lastSessionDate = this.get(currentSessionDateStorageKey, undefined); // previous session date was the "current" one at that time
		const currentSessionDate = new Date().toUTCString(); // current session date is "now"
		this.store(lastSessionDateStorageKey, typeof lastSessionDate === 'undefined' ? null : lastSessionDate);
		this.store(currentSessionDateStorageKey, currentSessionDate);
	}

	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;
	get(key: string, fallbackValue?: string): string | undefined {
		return this.storage.get(key, fallbackValue);
	}

	getBoolean(key: string, fallbackValue: boolean): boolean;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined {
		return this.storage.getBoolean(key, fallbackValue);
	}

	getNumber(key: string, fallbackValue: number): number;
	getNumber(key: string, fallbackValue?: number): number | undefined;
	getNumber(key: string, fallbackValue?: number): number | undefined {
		return this.storage.getNumber(key, fallbackValue);
	}

	store(key: string, value: string | boolean | number | undefined | null): Promise<void> {
		return this.storage.set(key, value);
	}

	remove(key: string): Promise<void> {
		return this.storage.delete(key);
	}

	close(): Promise<void> {

		// Signal as event so that clients can still store data
		this._onWillSaveState.fire();

		// Do it
		return this.storage.close();
	}
}

export class WorkspaceStorageMain extends Disposable implements IStorageMain {

	readonly onDidChangeStorage = Event.None;
	readonly onWillSaveState = Event.None;

	get items(): Map<string, string> { return this.storage.items; }

	private storage: IStorage;

	private initializePromise: Promise<void> | undefined;

	constructor(
	) {
		super();

		// Until the storage has been initialized, it can only be in memory
		this.storage = new Storage(new InMemoryStorageDatabase());
	}

	async initialize(): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = this.doInitialize();
		}

		return this.initializePromise;
	}

	private async doInitialize(): Promise<void> {
		// 	private async initializeWorkspaceStorage(payload: IWorkspaceInitializationPayload): Promise<void> {

		// 	// Prepare workspace storage folder for DB
		// 	try {
		// 		const result = await this.prepareWorkspaceStorageFolder(payload);

		// 		const useInMemoryStorage = !!this.environmentService.extensionTestsLocationURI; // no storage during extension tests!

		// 		// Create workspace storage and initialize
		// 		mark('code/willInitWorkspaceStorage');
		// 		try {
		// 			const workspaceStorage = this.createWorkspaceStorage(
		// 				useInMemoryStorage ? SQLiteStorageDatabase.IN_MEMORY_PATH : join(result.path, NativeStorageService.WORKSPACE_STORAGE_NAME),
		// 				result.wasCreated ? StorageHint.STORAGE_DOES_NOT_EXIST : undefined
		// 			);
		// 			await workspaceStorage.init();

		// 			// Check to see if this is the first time we are "opening" this workspace
		// 			const firstWorkspaceOpen = workspaceStorage.getBoolean(IS_NEW_KEY);
		// 			if (firstWorkspaceOpen === undefined) {
		// 				workspaceStorage.set(IS_NEW_KEY, result.wasCreated);
		// 			} else if (firstWorkspaceOpen) {
		// 				workspaceStorage.set(IS_NEW_KEY, false);
		// 			}
		// 		} finally {
		// 			mark('code/didInitWorkspaceStorage');
		// 		}
		// 	} catch (error) {
		// 		this.logService.error(`[storage] initializeWorkspaceStorage(): Unable to init workspace storage due to ${error}`);
		// 	}
		// }

		// private createWorkspaceStorage(workspaceStoragePath: string, hint?: StorageHint): IStorage {

		// 	// Logger for workspace storage
		// 	const workspaceLoggingOptions: ISQLiteStorageDatabaseLoggingOptions = {
		// 		logTrace: (this.logService.getLevel() === LogLevel.Trace) ? msg => this.logService.trace(msg) : undefined,
		// 		logError: error => this.logService.error(error)
		// 	};

		// 	// Dispose old (if any)
		// 	dispose(this.workspaceStorage);
		// 	dispose(this.workspaceStorageListener);

		// 	// Create new
		// 	this.workspaceStoragePath = workspaceStoragePath;
		// 	this.workspaceStorage = new Storage(new SQLiteStorageDatabase(workspaceStoragePath, { logging: workspaceLoggingOptions }), { hint });
		// 	this.workspaceStorageListener = this.workspaceStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.WORKSPACE, key));

		// 	return this.workspaceStorage;
		// }

		// private getWorkspaceStorageFolderPath(payload: IWorkspaceInitializationPayload): string {
		// 	return join(this.environmentService.workspaceStorageHome.fsPath, payload.id); // workspace home + workspace id;
		// }

		// private async prepareWorkspaceStorageFolder(payload: IWorkspaceInitializationPayload): Promise<{ path: string, wasCreated: boolean }> {
		// 	const workspaceStorageFolderPath = this.getWorkspaceStorageFolderPath(payload);

		// 	const storageExists = await exists(workspaceStorageFolderPath);
		// 	if (storageExists) {
		// 		return { path: workspaceStorageFolderPath, wasCreated: false };
		// 	}

		// 	await promises.mkdir(workspaceStorageFolderPath, { recursive: true });

		// 	// Write metadata into folder
		// 	this.ensureWorkspaceStorageFolderMeta(payload);

		// 	return { path: workspaceStorageFolderPath, wasCreated: true };
		// }

		// private ensureWorkspaceStorageFolderMeta(payload: IWorkspaceInitializationPayload): void {
		// 	let meta: object | undefined = undefined;
		// 	if (isSingleFolderWorkspaceIdentifier(payload)) {
		// 		meta = { folder: payload.uri.toString() };
		// 	} else if (isWorkspaceIdentifier(payload)) {
		// 		meta = { workspace: payload.configPath.toString() };
		// 	}

		// 	if (meta) {
		// 		(async () => {
		// 			try {
		// 				const workspaceStorageMetaPath = join(this.getWorkspaceStorageFolderPath(payload), NativeStorageService.WORKSPACE_META_NAME);
		// 				const storageExists = await exists(workspaceStorageMetaPath);
		// 				if (!storageExists) {
		// 					await writeFile(workspaceStorageMetaPath, JSON.stringify(meta, undefined, 2));
		// 				}
		// 			} catch (error) {
		// 				this.logService.error(error);
		// 			}
		// 		})();
		// 	}
		// }
	}

	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;
	get(key: string, fallbackValue?: string): string | undefined {
		return this.storage.get(key, fallbackValue);
	}

	getBoolean(key: string, fallbackValue: boolean): boolean;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined {
		return this.storage.getBoolean(key, fallbackValue);
	}

	getNumber(key: string, fallbackValue: number): number;
	getNumber(key: string, fallbackValue?: number): number | undefined;
	getNumber(key: string, fallbackValue?: number): number | undefined {
		return this.storage.getNumber(key, fallbackValue);
	}

	store(key: string, value: string | boolean | number | undefined | null): Promise<void> {
		return this.storage.set(key, value);
	}

	remove(key: string): Promise<void> {
		return this.storage.delete(key);
	}

	close(): Promise<void> {
		return this.storage.close();
	}
}
