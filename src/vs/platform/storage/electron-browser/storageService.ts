/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceStorageChangeEvent, IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Storage, IStorageLoggingOptions } from 'vs/base/node/storage';
import { IStorageLegacyService, StorageLegacyScope } from 'vs/platform/storage/common/storageLegacyService';
import { addDisposableListener } from 'vs/base/browser/dom';
import { startsWith } from 'vs/base/common/strings';
import { ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { localize } from 'vs/nls';

export class StorageService extends Disposable implements IStorageService {
	_serviceBrand: any;

	private static IN_MEMORY_PATH = ':memory:';

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillClose: Emitter<ShutdownReason> = this._register(new Emitter<ShutdownReason>());
	get onWillSaveState(): Event<ShutdownReason> { return this._onWillClose.event; }

	private globalStorage: Storage;
	private workspaceStorage: Storage;

	constructor(
		workspaceDBPath: string,
		@ILogService logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		const loggingOptions: IStorageLoggingOptions = {
			info: environmentService.verbose || environmentService.logStorage,
			infoLogger: msg => logService.info(msg),
			errorLogger: error => logService.error(error)
		};

		const useInMemoryStorage = !!environmentService.extensionTestsPath; // never keep any state when running extension tests

		this.globalStorage = new Storage({ path: useInMemoryStorage ? StorageService.IN_MEMORY_PATH : StorageService.IN_MEMORY_PATH, logging: loggingOptions });
		this.workspaceStorage = new Storage({ path: useInMemoryStorage ? StorageService.IN_MEMORY_PATH : workspaceDBPath, logging: loggingOptions });

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.globalStorage.onDidChangeStorage(key => this.handleDidChangeStorage(key, StorageScope.GLOBAL)));
		this._register(this.workspaceStorage.onDidChangeStorage(key => this.handleDidChangeStorage(key, StorageScope.WORKSPACE)));
	}

	private handleDidChangeStorage(key: string, scope: StorageScope): void {
		this._onDidChangeStorage.fire({ key, scope });
	}

	init(): Promise<void> {
		return Promise.all([this.globalStorage.init(), this.workspaceStorage.init()]).then(() => void 0);
	}

	get(key: string, scope: StorageScope, fallbackValue?: any): string {
		return this.getStorage(scope).get(key, fallbackValue);
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean {
		return this.getStorage(scope).getBoolean(key, fallbackValue);
	}

	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number {
		return this.getStorage(scope).getInteger(key, fallbackValue);
	}

	store(key: string, value: any, scope: StorageScope): void {
		this.getStorage(scope).set(key, value);
	}

	remove(key: string, scope: StorageScope): void {
		this.getStorage(scope).delete(key);
	}

	close(reason: ShutdownReason): Promise<void> {

		// Signal as event so that clients can still store data
		this._onWillClose.fire(reason);

		// Do it
		return Promise.all([
			this.globalStorage.close(),
			this.workspaceStorage.close()
		]).then(() => void 0);
	}

	private getStorage(scope: StorageScope): Storage {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}

	logStorage(): Promise<void> {
		return Promise.all([this.globalStorage.getItems(), this.workspaceStorage.getItems()]).then(items => {
			const safeParse = (value: string) => {
				try {
					return JSON.parse(value);
				} catch (error) {
					return value;
				}
			};

			const globalItems = Object.create(null);
			const globalItemsParsed = Object.create(null);
			items[0].forEach((value, key) => {
				globalItems[key] = value;
				globalItemsParsed[key] = safeParse(value);
			});

			const workspaceItems = Object.create(null);
			const workspaceItemsParsed = Object.create(null);
			items[1].forEach((value, key) => {
				workspaceItems[key] = value;
				workspaceItemsParsed[key] = safeParse(value);
			});

			console.group('Storage: Global');
			console.table(globalItems);
			console.groupEnd();

			console.log(globalItemsParsed);

			console.group('Storage: Workspace');
			console.table(workspaceItems);
			console.groupEnd();

			console.log(workspaceItemsParsed);
		});
	}
}

export class LogStorageAction extends Action {

	static readonly ID = 'workbench.action.logStorage';
	static LABEL = localize('logStorage', "Log Storage");

	constructor(
		id: string,
		label: string,
		@IStorageService private storageService: DelegatingStorageService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	run(): Thenable<void> {
		this.storageService.logStorage();

		return this.windowService.openDevTools();
	}
}

export class DelegatingStorageService extends Disposable implements IStorageService {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillClose: Emitter<ShutdownReason> = this._register(new Emitter<ShutdownReason>());
	get onWillSaveState(): Event<ShutdownReason> { return this._onWillClose.event; }

	private closed: boolean;

	constructor(
		@IStorageService private storageService: StorageService,
		@IStorageLegacyService private storageLegacyService: IStorageLegacyService,
		@ILogService private logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.storageService.onDidChangeStorage(e => this._onDidChangeStorage.fire(e)));
		this._register(this.storageService.onWillSaveState(reason => this._onWillClose.fire(reason)));

		const globalKeyMarker = 'storage://global/';
		this._register(addDisposableListener(window, 'storage', (e: StorageEvent) => {
			if (startsWith(e.key, globalKeyMarker)) {
				const key = e.key.substr(globalKeyMarker.length);

				this._onDidChangeStorage.fire({ key, scope: StorageScope.GLOBAL });
			}
		}));
	}

	get(key: string, scope: StorageScope, fallbackValue?: any): string {
		const localStorageValue = this.storageLegacyService.get(key, this.convertScope(scope), fallbackValue);
		const dbValue = this.storageService.get(key, scope, localStorageValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return dbValue;
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean {
		const localStorageValue = this.storageLegacyService.getBoolean(key, this.convertScope(scope), fallbackValue);
		const dbValue = this.storageService.getBoolean(key, scope, localStorageValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return dbValue;
	}

	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number {
		const localStorageValue = this.storageLegacyService.getInteger(key, this.convertScope(scope), fallbackValue);
		const dbValue = this.storageService.getInteger(key, scope, localStorageValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return dbValue;
	}

	private assertStorageValue(key: string, scope: StorageScope, dbValue: any, storageValue: any): void {
		if (dbValue !== storageValue) {
			this.logService.error(`Unexpected storage value (key: ${key}, scope: ${scope === StorageScope.GLOBAL ? 'global' : 'workspace'}), actual: ${dbValue}, expected: ${storageValue}`);
		}
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

	close(reason: ShutdownReason): Promise<void> {
		const promise = this.storageService.close(reason);

		this.closed = true;

		return promise;
	}

	private convertScope(scope: StorageScope): StorageLegacyScope {
		return scope === StorageScope.GLOBAL ? StorageLegacyScope.GLOBAL : StorageLegacyScope.WORKSPACE;
	}

	logStorage(): Promise<void> {
		return this.storageService.logStorage();
	}
}