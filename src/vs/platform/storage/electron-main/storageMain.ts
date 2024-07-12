/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { top } from 'vs/base/common/arrays';
import { DeferredPromise } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { join } from 'vs/base/common/path';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI } from 'vs/base/common/uri';
import { Promises } from 'vs/base/node/pfs';
import { InMemoryStorageDatabase, IStorage, Storage, StorageHint, StorageState } from 'vs/base/parts/storage/common/storage';
import { ISQLiteStorageDatabaseLoggingOptions, SQLiteStorageDatabase } from 'vs/base/parts/storage/node/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IS_NEW_KEY } from 'vs/platform/storage/common/storage';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { currentSessionDateStorageKey, firstSessionDateStorageKey, lastSessionDateStorageKey } from 'vs/platform/telemetry/common/telemetry';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, IAnyWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { Schemas } from 'vs/base/common/network';

export interface IStorageMainOptions {

	/**
	 * If enabled, storage will not persist to disk
	 * but into memory.
	 */
	readonly useInMemoryStorage?: boolean;
}

/**
 * Provides access to application, profile and workspace storage from
 * the electron-main side that is the owner of all storage connections.
 */
export interface IStorageMain extends IDisposable {

	/**
	 * Emitted whenever data is updated or deleted.
	 */
	readonly onDidChangeStorage: Event<IStorageChangeEvent>;

	/**
	 * Emitted when the storage is closed.
	 */
	readonly onDidCloseStorage: Event<void>;

	/**
	 * Access to all cached items of this storage service.
	 */
	readonly items: Map<string, string>;

	/**
	 * Allows to join on the `init` call having completed
	 * to be able to safely use the storage.
	 */
	readonly whenInit: Promise<void>;

	/**
	 * Provides access to the `IStorage` implementation which will be
	 * in-memory for as long as the storage has not been initialized.
	 */
	readonly storage: IStorage;

	/**
	 * The file path of the underlying storage file if any.
	 */
	readonly path: string | undefined;

	/**
	 * Required call to ensure the service can be used.
	 */
	init(): Promise<void>;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined.
	 */
	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;

	/**
	 * Store a string value under the given key to storage. The value will
	 * be converted to a string.
	 */
	set(key: string, value: string | boolean | number | undefined | null): void;

	/**
	 * Delete an element stored under the provided key from storage.
	 */
	delete(key: string): void;

	/**
	 * Whether the storage is using in-memory persistence or not.
	 */
	isInMemory(): boolean;

	/**
	 * Attempts to reduce the DB size via optimization commands if supported.
	 */
	optimize(): Promise<void>;

	/**
	 * Close the storage connection.
	 */
	close(): Promise<void>;
}

export interface IStorageChangeEvent {
	readonly key: string;
}

abstract class BaseStorageMain extends Disposable implements IStorageMain {

	private static readonly LOG_SLOW_CLOSE_THRESHOLD = 2000;

	protected readonly _onDidChangeStorage = this._register(new Emitter<IStorageChangeEvent>());
	readonly onDidChangeStorage = this._onDidChangeStorage.event;

	private readonly _onDidCloseStorage = this._register(new Emitter<void>());
	readonly onDidCloseStorage = this._onDidCloseStorage.event;

	private _storage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY })); // storage is in-memory until initialized
	get storage(): IStorage { return this._storage; }

	abstract get path(): string | undefined;

	private initializePromise: Promise<void> | undefined = undefined;

	private readonly whenInitPromise = new DeferredPromise<void>();
	readonly whenInit = this.whenInitPromise.p;

	private state = StorageState.None;

	constructor(
		protected readonly logService: ILogService,
		private readonly fileService: IFileService
	) {
		super();
	}

	isInMemory(): boolean {
		return this._storage.isInMemory();
	}

	init(): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = (async () => {
				if (this.state !== StorageState.None) {
					return; // either closed or already initialized
				}

				try {

					// Create storage via subclasses
					const storage = this._register(await this.doCreate());

					// Replace our in-memory storage with the real
					// once as soon as possible without awaiting
					// the init call.
					this._storage.dispose();
					this._storage = storage;

					// Re-emit storage changes via event
					this._register(storage.onDidChangeStorage(e => this._onDidChangeStorage.fire(e)));

					// Await storage init
					await this.doInit(storage);

					// Ensure we track whether storage is new or not
					const isNewStorage = storage.getBoolean(IS_NEW_KEY);
					if (isNewStorage === undefined) {
						storage.set(IS_NEW_KEY, true);
					} else if (isNewStorage) {
						storage.set(IS_NEW_KEY, false);
					}
				} catch (error) {
					this.logService.error(`[storage main] initialize(): Unable to init storage due to ${error}`);
				} finally {

					// Update state
					this.state = StorageState.Initialized;

					// Mark init promise as completed
					this.whenInitPromise.complete();
				}
			})();
		}

		return this.initializePromise;
	}

	protected createLoggingOptions(): ISQLiteStorageDatabaseLoggingOptions {
		return {
			logTrace: (this.logService.getLevel() === LogLevel.Trace) ? msg => this.logService.trace(msg) : undefined,
			logError: error => this.logService.error(error)
		};
	}

	protected doInit(storage: IStorage): Promise<void> {
		return storage.init();
	}

	protected abstract doCreate(): Promise<Storage>;

	get items(): Map<string, string> { return this._storage.items; }

	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;
	get(key: string, fallbackValue?: string): string | undefined {
		return this._storage.get(key, fallbackValue);
	}

	set(key: string, value: string | boolean | number | undefined | null): Promise<void> {
		return this._storage.set(key, value);
	}

	delete(key: string): Promise<void> {
		return this._storage.delete(key);
	}

	optimize(): Promise<void> {
		return this._storage.optimize();
	}

	async close(): Promise<void> {

		// Measure how long it takes to close storage
		const watch = new StopWatch(false);
		await this.doClose();
		watch.stop();

		// If close() is taking a long time, there is
		// a chance that the underlying DB is large
		// either on disk or in general. In that case
		// log some additional info to further diagnose
		if (watch.elapsed() > BaseStorageMain.LOG_SLOW_CLOSE_THRESHOLD) {
			await this.logSlowClose(watch);
		}

		// Signal as event
		this._onDidCloseStorage.fire();
	}

	private async logSlowClose(watch: StopWatch) {
		if (!this.path) {
			return;
		}

		try {
			const largestEntries = top(Array.from(this._storage.items.entries())
				.map(([key, value]) => ({ key, length: value.length })), (entryA, entryB) => entryB.length - entryA.length, 5)
				.map(entry => `${entry.key}:${entry.length}`).join(', ');
			const dbSize = (await this.fileService.stat(URI.file(this.path))).size;

			this.logService.warn(`[storage main] detected slow close() operation: Time: ${watch.elapsed()}ms, DB size: ${dbSize}b, Large Keys: ${largestEntries}`);
		} catch (error) {
			this.logService.error('[storage main] figuring out stats for slow DB on close() resulted in an error', error);
		}
	}

	private async doClose(): Promise<void> {

		// Ensure we are not accidentally leaving
		// a pending initialized storage behind in
		// case `close()` was called before `init()`
		// finishes.
		if (this.initializePromise) {
			await this.initializePromise;
		}

		// Update state
		this.state = StorageState.Closed;

		// Propagate to storage lib
		await this._storage.close();
	}
}

class BaseProfileAwareStorageMain extends BaseStorageMain {

	private static readonly STORAGE_NAME = 'state.vscdb';

	get path(): string | undefined {
		if (!this.options.useInMemoryStorage) {
			return join(this.profile.globalStorageHome.with({ scheme: Schemas.file }).fsPath, BaseProfileAwareStorageMain.STORAGE_NAME);
		}

		return undefined;
	}

	constructor(
		private readonly profile: IUserDataProfile,
		private readonly options: IStorageMainOptions,
		logService: ILogService,
		fileService: IFileService
	) {
		super(logService, fileService);
	}

	protected async doCreate(): Promise<Storage> {
		return new Storage(new SQLiteStorageDatabase(this.path ?? SQLiteStorageDatabase.IN_MEMORY_PATH, {
			logging: this.createLoggingOptions()
		}), !this.path ? { hint: StorageHint.STORAGE_IN_MEMORY } : undefined);
	}
}

export class ProfileStorageMain extends BaseProfileAwareStorageMain {

	constructor(
		profile: IUserDataProfile,
		options: IStorageMainOptions,
		logService: ILogService,
		fileService: IFileService
	) {
		super(profile, options, logService, fileService);
	}
}

export class ApplicationStorageMain extends BaseProfileAwareStorageMain {

	constructor(
		options: IStorageMainOptions,
		userDataProfileService: IUserDataProfilesService,
		logService: ILogService,
		fileService: IFileService
	) {
		super(userDataProfileService.defaultProfile, options, logService, fileService);
	}

	protected override async doInit(storage: IStorage): Promise<void> {
		await super.doInit(storage);

		// Apply telemetry values as part of the application storage initialization
		this.updateTelemetryState(storage);
	}

	private updateTelemetryState(storage: IStorage): void {

		// First session date (once)
		const firstSessionDate = storage.get(firstSessionDateStorageKey, undefined);
		if (firstSessionDate === undefined) {
			storage.set(firstSessionDateStorageKey, new Date().toUTCString());
		}

		// Last / current session (always)
		// previous session date was the "current" one at that time
		// current session date is "now"
		const lastSessionDate = storage.get(currentSessionDateStorageKey, undefined);
		const currentSessionDate = new Date().toUTCString();
		storage.set(lastSessionDateStorageKey, typeof lastSessionDate === 'undefined' ? null : lastSessionDate);
		storage.set(currentSessionDateStorageKey, currentSessionDate);
	}
}

export class WorkspaceStorageMain extends BaseStorageMain {

	private static readonly WORKSPACE_STORAGE_NAME = 'state.vscdb';
	private static readonly WORKSPACE_META_NAME = 'workspace.json';

	get path(): string | undefined {
		if (!this.options.useInMemoryStorage) {
			return join(this.environmentService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath, this.workspace.id, WorkspaceStorageMain.WORKSPACE_STORAGE_NAME);
		}

		return undefined;
	}

	constructor(
		private workspace: IAnyWorkspaceIdentifier,
		private readonly options: IStorageMainOptions,
		logService: ILogService,
		private readonly environmentService: IEnvironmentService,
		fileService: IFileService
	) {
		super(logService, fileService);
	}

	protected async doCreate(): Promise<Storage> {
		const { storageFilePath, wasCreated } = await this.prepareWorkspaceStorageFolder();

		return new Storage(new SQLiteStorageDatabase(storageFilePath, {
			logging: this.createLoggingOptions()
		}), { hint: this.options.useInMemoryStorage ? StorageHint.STORAGE_IN_MEMORY : wasCreated ? StorageHint.STORAGE_DOES_NOT_EXIST : undefined });
	}

	private async prepareWorkspaceStorageFolder(): Promise<{ storageFilePath: string; wasCreated: boolean }> {

		// Return early if using inMemory storage
		if (this.options.useInMemoryStorage) {
			return { storageFilePath: SQLiteStorageDatabase.IN_MEMORY_PATH, wasCreated: true };
		}

		// Otherwise, ensure the storage folder exists on disk
		const workspaceStorageFolderPath = join(this.environmentService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath, this.workspace.id);
		const workspaceStorageDatabasePath = join(workspaceStorageFolderPath, WorkspaceStorageMain.WORKSPACE_STORAGE_NAME);

		const storageExists = await Promises.exists(workspaceStorageFolderPath);
		if (storageExists) {
			return { storageFilePath: workspaceStorageDatabasePath, wasCreated: false };
		}

		// Ensure storage folder exists
		await fs.promises.mkdir(workspaceStorageFolderPath, { recursive: true });

		// Write metadata into folder (but do not await)
		this.ensureWorkspaceStorageFolderMeta(workspaceStorageFolderPath);

		return { storageFilePath: workspaceStorageDatabasePath, wasCreated: true };
	}

	private async ensureWorkspaceStorageFolderMeta(workspaceStorageFolderPath: string): Promise<void> {
		let meta: object | undefined = undefined;
		if (isSingleFolderWorkspaceIdentifier(this.workspace)) {
			meta = { folder: this.workspace.uri.toString() };
		} else if (isWorkspaceIdentifier(this.workspace)) {
			meta = { workspace: this.workspace.configPath.toString() };
		}

		if (meta) {
			try {
				const workspaceStorageMetaPath = join(workspaceStorageFolderPath, WorkspaceStorageMain.WORKSPACE_META_NAME);
				const storageExists = await Promises.exists(workspaceStorageMetaPath);
				if (!storageExists) {
					await Promises.writeFile(workspaceStorageMetaPath, JSON.stringify(meta, undefined, 2));
				}
			} catch (error) {
				this.logService.error(`[storage main] ensureWorkspaceStorageFolderMeta(): Unable to create workspace storage metadata due to ${error}`);
			}
		}
	}
}

export class InMemoryStorageMain extends BaseStorageMain {

	get path(): string | undefined {
		return undefined; // in-memory has no path
	}

	protected async doCreate(): Promise<Storage> {
		return new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY });
	}
}
