/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceStorageChangeEvent, IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Storage, IStorageLoggingOptions, NullStorage, IStorage } from 'vs/base/node/storage';
import { IStorageLegacyService, StorageLegacyScope } from 'vs/platform/storage/common/storageLegacyService';
import { startsWith } from 'vs/base/common/strings';
import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { localize } from 'vs/nls';
import { mark, getDuration } from 'vs/base/common/performance';
import { join, basename } from 'path';
import { copy } from 'vs/base/node/pfs';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class StorageService extends Disposable implements IStorageService {
	_serviceBrand: any;

	static IN_MEMORY_PATH = ':memory:';

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillSaveState: Emitter<void> = this._register(new Emitter<void>());
	get onWillSaveState(): Event<void> { return this._onWillSaveState.event; }

	private _hasErrors = false;
	get hasErrors(): boolean { return this._hasErrors; }

	private bufferedStorageErrors: (string | Error)[] = [];
	private _onStorageError: Emitter<string | Error> = this._register(new Emitter<string | Error>());
	get onStorageError(): Event<string | Error> {
		if (Array.isArray(this.bufferedStorageErrors)) {
			// todo@ben cleanup after a while
			if (this.bufferedStorageErrors.length > 0) {
				const bufferedStorageErrors = this.bufferedStorageErrors;
				setTimeout(() => {
					this._onStorageError.fire(`[startup errors] ${bufferedStorageErrors.join('\n')}`);
				}, 0);
			}

			this.bufferedStorageErrors = void 0;
		}

		return this._onStorageError.event;
	}

	private globalStorage: IStorage;
	private globalStorageWorkspacePath: string;

	private workspaceStoragePath: string;
	private workspaceStorage: IStorage;
	private workspaceStorageListener: IDisposable;

	private loggingOptions: IStorageLoggingOptions;

	constructor(
		workspaceStoragePath: string,
		disableGlobalStorage: boolean,
		@ILogService logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		this.loggingOptions = {
			trace: logService.getLevel() === LogLevel.Trace,
			logTrace: msg => logService.trace(msg),
			logError: error => {
				logService.error(error);

				this._hasErrors = true;

				if (Array.isArray(this.bufferedStorageErrors)) {
					this.bufferedStorageErrors.push(error);
				} else {
					this._onStorageError.fire(error);
				}
			}
		};

		this.globalStorageWorkspacePath = workspaceStoragePath === StorageService.IN_MEMORY_PATH ? StorageService.IN_MEMORY_PATH : StorageService.IN_MEMORY_PATH;
		this.globalStorage = disableGlobalStorage ? new NullStorage() : new Storage({ path: this.globalStorageWorkspacePath, logging: this.loggingOptions });
		this._register(this.globalStorage.onDidChangeStorage(key => this.handleDidChangeStorage(key, StorageScope.GLOBAL)));

		this.createWorkspaceStorage(workspaceStoragePath);
	}

	private createWorkspaceStorage(workspaceStoragePath: string): void {

		// Dispose old (if any)
		this.workspaceStorage = dispose(this.workspaceStorage);
		this.workspaceStorageListener = dispose(this.workspaceStorageListener);

		// Create new
		this.workspaceStoragePath = workspaceStoragePath;
		this.workspaceStorage = new Storage({ path: workspaceStoragePath, logging: this.loggingOptions });
		this.workspaceStorageListener = this.workspaceStorage.onDidChangeStorage(key => this.handleDidChangeStorage(key, StorageScope.WORKSPACE));
	}

	private handleDidChangeStorage(key: string, scope: StorageScope): void {
		this._onDidChangeStorage.fire({ key, scope });
	}

	init(): Promise<void> {
		mark('willInitWorkspaceStorage');
		return this.workspaceStorage.init().then(() => {
			mark('didInitWorkspaceStorage');

			mark('willInitGlobalStorage');
			return this.globalStorage.init().then(() => {
				mark('didInitGlobalStorage');
			});
		});
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
		this._onWillSaveState.fire();

		// Do it
		return Promise.all([
			this.globalStorage.close(),
			this.workspaceStorage.close()
		]).then(() => void 0);
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
			this.globalStorage.getItems(),
			this.workspaceStorage.getItems(),
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

			console.group(`Storage: Global (integrity: ${result[2]}, load: ${getDuration('willInitGlobalStorage', 'didInitGlobalStorage')}, path: ${this.globalStorageWorkspacePath})`);
			let globalValues = [];
			globalItems.forEach((value, key) => {
				globalValues.push({ key, value });
			});
			console.table(globalValues);
			console.groupEnd();

			console.log(globalItemsParsed);

			console.group(`Storage: Workspace (integrity: ${result[3]}, load: ${getDuration('willInitWorkspaceStorage', 'didInitWorkspaceStorage')}, path: ${this.workspaceStoragePath})`);
			let workspaceValues = [];
			workspaceItems.forEach((value, key) => {
				workspaceValues.push({ key, value });
			});
			console.table(workspaceValues);
			console.groupEnd();

			console.log(workspaceItemsParsed);
		});
	}

	migrate(toWorkspaceStorageFolder: string): Thenable<void> {
		if (this.workspaceStoragePath === StorageService.IN_MEMORY_PATH) {
			return Promise.resolve(); // no migration needed if running in memory
		}

		// Compute new workspace storage path based on workspace identifier
		const newWorkspaceStoragePath = join(toWorkspaceStorageFolder, basename(this.workspaceStoragePath));
		if (this.workspaceStoragePath === newWorkspaceStoragePath) {
			return Promise.resolve(); // guard against migrating to same path
		}

		// Close workspace DB to be able to copy
		return this.workspaceStorage.close().then(() => {
			return copy(this.workspaceStoragePath, newWorkspaceStoragePath).then(() => {
				this.createWorkspaceStorage(newWorkspaceStoragePath);

				return this.workspaceStorage.init();
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
		@IStorageService private storageService: DelegatingStorageService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	run(): Thenable<void> {
		this.storageService.storage.logStorage();

		return this.windowService.openDevTools();
	}
}

export class DelegatingStorageService extends Disposable implements IStorageService {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillSaveState: Emitter<void> = this._register(new Emitter<void>());
	get onWillSaveState(): Event<void> { return this._onWillSaveState.event; }

	private closed: boolean;
	private useLegacyWorkspaceStorage: boolean;

	constructor(
		private storageService: IStorageService,
		private storageLegacyService: IStorageLegacyService,
		private logService: ILogService,
		configurationService: IConfigurationService
	) {
		super();

		this.useLegacyWorkspaceStorage = configurationService.inspect<boolean>('workbench.enableLegacyStorage').value === true;

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.storageService.onDidChangeStorage(e => this._onDidChangeStorage.fire(e)));
		this._register(this.storageService.onWillSaveState(() => this._onWillSaveState.fire()));

		const globalKeyMarker = 'storage://global/';

		window.addEventListener('storage', e => {
			if (startsWith(e.key, globalKeyMarker)) {
				const key = e.key.substr(globalKeyMarker.length);

				this._onDidChangeStorage.fire({ key, scope: StorageScope.GLOBAL });
			}
		});
	}

	get storage(): StorageService {
		return this.storageService as StorageService;
	}

	get(key: string, scope: StorageScope, fallbackValue?: string): string {
		if (scope === StorageScope.WORKSPACE && !this.useLegacyWorkspaceStorage) {
			return this.storageService.get(key, scope, fallbackValue);
		}

		return this.storageLegacyService.get(key, this.convertScope(scope), fallbackValue);
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean {
		if (scope === StorageScope.WORKSPACE && !this.useLegacyWorkspaceStorage) {
			return this.storageService.getBoolean(key, scope, fallbackValue);
		}

		return this.storageLegacyService.getBoolean(key, this.convertScope(scope), fallbackValue);
	}

	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number {
		if (scope === StorageScope.WORKSPACE && !this.useLegacyWorkspaceStorage) {
			return this.storageService.getInteger(key, scope, fallbackValue);
		}

		return this.storageLegacyService.getInteger(key, this.convertScope(scope), fallbackValue);
	}

	store(key: string, value: any, scope: StorageScope): void {
		if (this.closed) {
			this.logService.warn(`Unsupported write (store) access after close (key: ${key})`);

			return; // prevent writing after close to detect late write access
		}

		this.storageLegacyService.store(key, value, this.convertScope(scope));

		this.storageService.store(key, value, scope);
	}

	remove(key: string, scope: StorageScope): void {
		if (this.closed) {
			this.logService.warn(`Unsupported write (remove) access after close (key: ${key})`);

			return; // prevent writing after close to detect late write access
		}

		this.storageLegacyService.remove(key, this.convertScope(scope));

		this.storageService.remove(key, scope);
	}

	close(): Promise<void> {
		const promise = this.storage.close();

		this.closed = true;

		return promise;
	}

	private convertScope(scope: StorageScope): StorageLegacyScope {
		return scope === StorageScope.GLOBAL ? StorageLegacyScope.GLOBAL : StorageLegacyScope.WORKSPACE;
	}
}