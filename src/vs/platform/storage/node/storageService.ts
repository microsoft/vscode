/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IWorkspaceStorageChangeEvent, IStorageService, StorageScope, IWillSaveStateEvent, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { Storage, ISQLiteStorageDatabaseLoggingOptions, IStorage, StorageHint, IStorageDatabase, SQLiteStorageDatabase } from 'vs/base/node/storage';
import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { localize } from 'vs/nls';
import { mark, getDuration } from 'vs/base/common/performance';
import { join } from 'path';
import { copy, exists, mkdirp, writeFile } from 'vs/base/node/pfs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceInitializationPayload, isWorkspaceIdentifier, isSingleFolderWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { onUnexpectedError } from 'vs/base/common/errors';

export class StorageService extends Disposable implements IStorageService {
	_serviceBrand: any;

	private static WORKSPACE_STORAGE_NAME = 'state.vscdb';
	private static WORKSPACE_META_NAME = 'workspace.json';

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillSaveState: Emitter<IWillSaveStateEvent> = this._register(new Emitter<IWillSaveStateEvent>());
	get onWillSaveState(): Event<IWillSaveStateEvent> { return this._onWillSaveState.event; }

	private _hasErrors = false;
	get hasErrors(): boolean { return this._hasErrors; }

	private bufferedWorkspaceStorageErrors?: Array<string | Error> = [];
	private _onWorkspaceStorageError: Emitter<string | Error> = this._register(new Emitter<string | Error>());
	get onWorkspaceStorageError(): Event<string | Error> {
		if (Array.isArray(this.bufferedWorkspaceStorageErrors)) {
			// todo@ben cleanup after a while
			if (this.bufferedWorkspaceStorageErrors.length > 0) {
				const bufferedStorageErrors = this.bufferedWorkspaceStorageErrors;
				setTimeout(() => {
					this._onWorkspaceStorageError.fire(`[startup errors] ${bufferedStorageErrors.join('\n')}`);
				}, 0);
			}

			this.bufferedWorkspaceStorageErrors = undefined;
		}

		return this._onWorkspaceStorageError.event;
	}

	private globalStorage: IStorage;

	private workspaceStoragePath: string;
	private workspaceStorage: IStorage;
	private workspaceStorageListener: IDisposable;

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
		return Promise.all([
			this.initializeGlobalStorage(),
			this.initializeWorkspaceStorage(payload)
		]).then(() => undefined);
	}

	private initializeGlobalStorage(): Promise<void> {
		mark('willInitGlobalStorage');

		return this.globalStorage.init().then(() => {
			mark('didInitGlobalStorage');
		}, error => {
			mark('didInitGlobalStorage');

			return Promise.reject(error);
		});
	}

	private initializeWorkspaceStorage(payload: IWorkspaceInitializationPayload): Promise<void> {

		// Prepare workspace storage folder for DB
		return this.prepareWorkspaceStorageFolder(payload).then(result => {
			const useInMemoryStorage = !!this.environmentService.extensionTestsPath; // no storage during extension tests!

			// Create workspace storage and initalize
			mark('willInitWorkspaceStorage');
			return this.createWorkspaceStorage(useInMemoryStorage ? SQLiteStorageDatabase.IN_MEMORY_PATH : join(result.path, StorageService.WORKSPACE_STORAGE_NAME), result.wasCreated ? StorageHint.STORAGE_DOES_NOT_EXIST : undefined).init().then(() => {
				mark('didInitWorkspaceStorage');
			}, error => {
				mark('didInitWorkspaceStorage');

				return Promise.reject(error);
			});
		}).then(undefined, error => {
			onUnexpectedError(error);

			// Upon error, fallback to in-memory storage
			return this.createWorkspaceStorage(SQLiteStorageDatabase.IN_MEMORY_PATH).init();
		});
	}

	private createWorkspaceStorage(workspaceStoragePath: string, hint?: StorageHint): IStorage {

		// Logger for workspace storage
		const workspaceLoggingOptions: ISQLiteStorageDatabaseLoggingOptions = {
			logTrace: (this.logService.getLevel() === LogLevel.Trace) ? msg => this.logService.trace(msg) : undefined,
			logError: error => {
				this.logService.error(error);

				this._hasErrors = true;

				if (Array.isArray(this.bufferedWorkspaceStorageErrors)) {
					this.bufferedWorkspaceStorageErrors.push(error);
				} else {
					this._onWorkspaceStorageError.fire(error);
				}
			}
		};

		// Dispose old (if any)
		this.workspaceStorage = dispose(this.workspaceStorage);
		this.workspaceStorageListener = dispose(this.workspaceStorageListener);

		// Create new
		this.workspaceStoragePath = workspaceStoragePath;
		this.workspaceStorage = new Storage(new SQLiteStorageDatabase(workspaceStoragePath, { logging: workspaceLoggingOptions }), { hint });
		this.workspaceStorageListener = this.workspaceStorage.onDidChangeStorage(key => this.handleDidChangeStorage(key, StorageScope.WORKSPACE));

		return this.workspaceStorage;
	}

	private getWorkspaceStorageFolderPath(payload: IWorkspaceInitializationPayload): string {
		return join(this.environmentService.workspaceStorageHome, payload.id); // workspace home + workspace id;
	}

	private prepareWorkspaceStorageFolder(payload: IWorkspaceInitializationPayload): Promise<{ path: string, wasCreated: boolean }> {
		const workspaceStorageFolderPath = this.getWorkspaceStorageFolderPath(payload);

		return exists(workspaceStorageFolderPath).then(exists => {
			if (exists) {
				return { path: workspaceStorageFolderPath, wasCreated: false };
			}

			return mkdirp(workspaceStorageFolderPath).then(() => {

				// Write metadata into folder
				this.ensureWorkspaceStorageFolderMeta(payload);

				return { path: workspaceStorageFolderPath, wasCreated: true };
			});
		});
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
			exists(workspaceStorageMetaPath).then(exists => {
				if (exists) {
					return undefined; // already existing
				}

				return writeFile(workspaceStorageMetaPath, JSON.stringify(meta, undefined, 2));
			}).then(undefined, error => onUnexpectedError(error));
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

	getInteger(key: string, scope: StorageScope, fallbackValue: number): number;
	getInteger(key: string, scope: StorageScope): number | undefined;
	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		return this.getStorage(scope).getInteger(key, fallbackValue);
	}

	store(key: string, value: any, scope: StorageScope): void {
		this.getStorage(scope).set(key, value);
	}

	remove(key: string, scope: StorageScope): void {
		this.getStorage(scope).delete(key);
	}

	close(): Promise<void> {

		// Signal as event so that clients can still store data
		this._onWillSaveState.fire({ reason: WillSaveStateReason.SHUTDOWN });

		// Do it
		mark('willCloseGlobalStorage');
		mark('willCloseWorkspaceStorage');
		return Promise.all([
			this.globalStorage.close().then(() => mark('didCloseGlobalStorage')),
			this.workspaceStorage.close().then(() => mark('didCloseWorkspaceStorage'))
		]).then(() => {
			this.logService.trace(`[storage] closing took ${getDuration('willCloseGlobalStorage', 'didCloseGlobalStorage')}ms global / ${getDuration('willCloseWorkspaceStorage', 'didCloseWorkspaceStorage')}ms workspace`);
		});
	}

	private getStorage(scope: StorageScope): IStorage {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}

	getSize(scope: StorageScope): number {
		return scope === StorageScope.GLOBAL ? this.globalStorage.size : this.workspaceStorage.size;
	}

	checkIntegrity(scope: StorageScope, full: boolean): Promise<string> {
		return scope === StorageScope.GLOBAL ? this.globalStorage.checkIntegrity(full) : this.workspaceStorage.checkIntegrity(full);
	}

	logStorage(): Promise<void> {
		return Promise.all([
			this.globalStorage.items,
			this.workspaceStorage.items,
			this.globalStorage.checkIntegrity(true /* full */),
			this.workspaceStorage.checkIntegrity(true /* full */)
		]).then(result => {
			const safeParse = (value: string) => {
				try {
					return JSON.parse(value);
				} catch (error) {
					return value;
				}
			};

			const globalItems = new Map<string, string>();
			const globalItemsParsed = new Map<string, string>();
			result[0].forEach((value, key) => {
				globalItems.set(key, value);
				globalItemsParsed.set(key, safeParse(value));
			});

			const workspaceItems = new Map<string, string>();
			const workspaceItemsParsed = new Map<string, string>();
			result[1].forEach((value, key) => {
				workspaceItems.set(key, value);
				workspaceItemsParsed.set(key, safeParse(value));
			});

			console.group(`Storage: Global (integrity: ${result[2]}, load: ${getDuration('main:willInitGlobalStorage', 'main:didInitGlobalStorage')}, path: ${this.environmentService.globalStorageHome})`);
			let globalValues: { key: string, value: string }[] = [];
			globalItems.forEach((value, key) => {
				globalValues.push({ key, value });
			});
			console.table(globalValues);
			console.groupEnd();

			console.log(globalItemsParsed);

			console.group(`Storage: Workspace (integrity: ${result[3]}, load: ${getDuration('willInitWorkspaceStorage', 'didInitWorkspaceStorage')}, path: ${this.workspaceStoragePath})`);
			let workspaceValues: { key: string, value: string }[] = [];
			workspaceItems.forEach((value, key) => {
				workspaceValues.push({ key, value });
			});
			console.table(workspaceValues);
			console.groupEnd();

			console.log(workspaceItemsParsed);
		});
	}

	migrate(toWorkspace: IWorkspaceInitializationPayload): Promise<void> {
		if (this.workspaceStoragePath === SQLiteStorageDatabase.IN_MEMORY_PATH) {
			return Promise.resolve(); // no migration needed if running in memory
		}

		// Close workspace DB to be able to copy
		return this.workspaceStorage.close().then(() => {

			// Prepare new workspace storage folder
			return this.prepareWorkspaceStorageFolder(toWorkspace).then(result => {
				const newWorkspaceStoragePath = join(result.path, StorageService.WORKSPACE_STORAGE_NAME);

				// Copy current storage over to new workspace storage
				return copy(this.workspaceStoragePath, newWorkspaceStoragePath).then(() => {

					// Recreate and init workspace storage
					return this.createWorkspaceStorage(newWorkspaceStoragePath).init();
				});
			});
		});
	}
}

export class LogStorageAction extends Action {

	static readonly ID = 'workbench.action.logStorage';
	static LABEL = localize({ key: 'logStorage', comment: ['A developer only action to log the contents of the storage for the current window.'] }, "Log Storage Database Contents");

	constructor(
		id: string,
		label: string,
		@IStorageService private readonly storageService: StorageService,
		@IWindowService private readonly windowService: IWindowService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		this.storageService.logStorage();

		return this.windowService.openDevTools();
	}
}
