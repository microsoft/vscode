/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IWorkspaceStorageChangeEvent, IStorageService, StorageScope, IWillSaveStateEvent, WillSaveStateReason, logStorage } from 'vs/platform/storage/common/storage';
import { SQLiteStorageDatabase, ISQLiteStorageDatabaseLoggingOptions } from 'vs/base/parts/storage/node/storage';
import { Storage, IStorageDatabase, IStorage, StorageHint } from 'vs/base/parts/storage/common/storage';
import { mark } from 'vs/base/common/performance';
import { join } from 'vs/base/common/path';
import { copy, exists, mkdirp, writeFile } from 'vs/base/node/pfs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceInitializationPayload, isWorkspaceIdentifier, isSingleFolderWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class StorageService extends Disposable implements IStorageService {

	_serviceBrand!: ServiceIdentifier<any>;

	private static WORKSPACE_STORAGE_NAME = 'state.vscdb';
	private static WORKSPACE_META_NAME = 'workspace.json';

	private readonly _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	readonly onDidChangeStorage: Event<IWorkspaceStorageChangeEvent> = this._onDidChangeStorage.event;

	private readonly _onWillSaveState: Emitter<IWillSaveStateEvent> = this._register(new Emitter<IWillSaveStateEvent>());
	readonly onWillSaveState: Event<IWillSaveStateEvent> = this._onWillSaveState.event;

	private globalStorage: IStorage;

	private workspaceStoragePath: string;
	private workspaceStorage: IStorage;
	private workspaceStorageListener: IDisposable;

	private initializePromise: Promise<void>;

	constructor(
		globalStorageDatabase: IStorageDatabase,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
		super();

		// Global Storage
		this.globalStorage = new Storage(globalStorageDatabase);
		this._register(this.globalStorage.onDidChangeStorage(key => this.handleDidChangeStorage(key, StorageScope.GLOBAL)));
	}

	private handleDidChangeStorage(key: string, scope: StorageScope): void {
		this._onDidChangeStorage.fire({ key, scope });
	}

	initialize(payload: IWorkspaceInitializationPayload): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = this.doInitialize(payload);
		}

		return this.initializePromise;
	}

	private async doInitialize(payload: IWorkspaceInitializationPayload): Promise<void> {
		await Promise.all([
			this.initializeGlobalStorage(),
			this.initializeWorkspaceStorage(payload)
		]);
	}

	private initializeGlobalStorage(): Promise<void> {
		return this.globalStorage.init();
	}

	private async initializeWorkspaceStorage(payload: IWorkspaceInitializationPayload): Promise<void> {

		// Prepare workspace storage folder for DB
		try {
			const result = await this.prepareWorkspaceStorageFolder(payload);

			const useInMemoryStorage = !!this.environmentService.extensionTestsLocationURI; // no storage during extension tests!

			// Create workspace storage and initialize
			mark('willInitWorkspaceStorage');
			try {
				await this.createWorkspaceStorage(useInMemoryStorage ? SQLiteStorageDatabase.IN_MEMORY_PATH : join(result.path, StorageService.WORKSPACE_STORAGE_NAME), result.wasCreated ? StorageHint.STORAGE_DOES_NOT_EXIST : undefined).init();
			} finally {
				mark('didInitWorkspaceStorage');
			}
		} catch (error) {
			onUnexpectedError(error);

			// Upon error, fallback to in-memory storage
			return this.createWorkspaceStorage(SQLiteStorageDatabase.IN_MEMORY_PATH).init();
		}
	}

	private createWorkspaceStorage(workspaceStoragePath: string, hint?: StorageHint): IStorage {

		// Logger for workspace storage
		const workspaceLoggingOptions: ISQLiteStorageDatabaseLoggingOptions = {
			logTrace: (this.logService.getLevel() === LogLevel.Trace) ? msg => this.logService.trace(msg) : undefined,
			logError: error => this.logService.error(error)
		};

		// Dispose old (if any)
		dispose(this.workspaceStorage);
		dispose(this.workspaceStorageListener);

		// Create new
		this.workspaceStoragePath = workspaceStoragePath;
		this.workspaceStorage = new Storage(new SQLiteStorageDatabase(workspaceStoragePath, { logging: workspaceLoggingOptions }), { hint });
		this.workspaceStorageListener = this.workspaceStorage.onDidChangeStorage(key => this.handleDidChangeStorage(key, StorageScope.WORKSPACE));

		return this.workspaceStorage;
	}

	private getWorkspaceStorageFolderPath(payload: IWorkspaceInitializationPayload): string {
		return join(this.environmentService.workspaceStorageHome, payload.id); // workspace home + workspace id;
	}

	private async prepareWorkspaceStorageFolder(payload: IWorkspaceInitializationPayload): Promise<{ path: string, wasCreated: boolean }> {
		const workspaceStorageFolderPath = this.getWorkspaceStorageFolderPath(payload);

		const storageExists = await exists(workspaceStorageFolderPath);
		if (storageExists) {
			return { path: workspaceStorageFolderPath, wasCreated: false };
		}

		await mkdirp(workspaceStorageFolderPath);

		// Write metadata into folder
		this.ensureWorkspaceStorageFolderMeta(payload);

		return { path: workspaceStorageFolderPath, wasCreated: true };
	}

	private ensureWorkspaceStorageFolderMeta(payload: IWorkspaceInitializationPayload): void {
		let meta: object | undefined = undefined;
		if (isSingleFolderWorkspaceInitializationPayload(payload)) {
			meta = { folder: payload.folder.toString() };
		} else if (isWorkspaceIdentifier(payload)) {
			meta = { configuration: payload.configPath };
		}

		if (meta) {
			const workspaceStorageMetaPath = join(this.getWorkspaceStorageFolderPath(payload), StorageService.WORKSPACE_META_NAME);
			(async function () {
				try {
					const storageExists = await exists(workspaceStorageMetaPath);
					if (!storageExists) {
						await writeFile(workspaceStorageMetaPath, JSON.stringify(meta, undefined, 2));
					}
				} catch (error) {
					onUnexpectedError(error);
				}
			})();
		}
	}

	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope): string | undefined;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined {
		return this.getStorage(scope).get(key, fallbackValue);
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope): boolean | undefined;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
		return this.getStorage(scope).getBoolean(key, fallbackValue);
	}

	getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope): number | undefined;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		return this.getStorage(scope).getNumber(key, fallbackValue);
	}

	store(key: string, value: string | boolean | number | undefined | null, scope: StorageScope): void {
		this.getStorage(scope).set(key, value);
	}

	remove(key: string, scope: StorageScope): void {
		this.getStorage(scope).delete(key);
	}

	async close(): Promise<void> {

		// Signal as event so that clients can still store data
		this._onWillSaveState.fire({ reason: WillSaveStateReason.SHUTDOWN });

		// Do it
		await Promise.all([
			this.globalStorage.close(),
			this.workspaceStorage.close()
		]);
	}

	private getStorage(scope: StorageScope): IStorage {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}

	async logStorage(): Promise<void> {
		const result = await Promise.all([
			this.globalStorage.items,
			this.workspaceStorage.items
		]);

		logStorage(result[0], result[1], this.environmentService.globalStorageHome, this.workspaceStoragePath);
	}

	async migrate(toWorkspace: IWorkspaceInitializationPayload): Promise<void> {
		if (this.workspaceStoragePath === SQLiteStorageDatabase.IN_MEMORY_PATH) {
			return Promise.resolve(); // no migration needed if running in memory
		}

		// Close workspace DB to be able to copy
		await this.workspaceStorage.close();

		// Prepare new workspace storage folder
		const result = await this.prepareWorkspaceStorageFolder(toWorkspace);

		const newWorkspaceStoragePath = join(result.path, StorageService.WORKSPACE_STORAGE_NAME);

		// Copy current storage over to new workspace storage
		await copy(this.workspaceStoragePath, newWorkspaceStoragePath);

		// Recreate and init workspace storage
		return this.createWorkspaceStorage(newWorkspaceStoragePath).init();
	}
}
