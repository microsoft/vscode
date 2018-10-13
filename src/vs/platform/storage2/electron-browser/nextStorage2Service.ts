/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceStorageChangeEvent, IStorageService, StorageScope } from 'vs/platform/storage2/common/storage2';
import { Storage, IStorageLoggingOptions } from 'vs/base/node/storage';
import { IStorageLegacyService, StorageLegacyScope } from 'vs/platform/storage/common/storageLegacyService';
import { addDisposableListener } from 'vs/base/browser/dom';
import { startsWith } from 'vs/base/common/strings';
import { ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';

export class StorageService extends Disposable implements IStorageService {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillClose: Emitter<ShutdownReason> = this._register(new Emitter<ShutdownReason>());
	get onWillClose(): Event<ShutdownReason> { return this._onWillClose.event; }

	private globalStorage: Storage;
	private workspaceStorage: Storage;

	constructor(
		workspaceDBPath: string,
		@ILogService logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		const loggingOptions: IStorageLoggingOptions = {
			verbose: environmentService.verbose,
			infoLogger: msg => logService.info(msg),
			errorLogger: error => logService.error(error)
		};

		this.globalStorage = new Storage({ path: ':memory:', logging: loggingOptions });
		this.workspaceStorage = new Storage({ path: workspaceDBPath, logging: loggingOptions });

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

	set(key: string, value: any, scope: StorageScope): Promise<void> {
		return this.getStorage(scope).set(key, value);
	}

	delete(key: string, scope: StorageScope): Promise<void> {
		return this.getStorage(scope).delete(key);
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
}

export class DelegatingStorageService extends Disposable implements IStorageService {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillClose: Emitter<ShutdownReason> = this._register(new Emitter<ShutdownReason>());
	get onWillClose(): Event<ShutdownReason> { return this._onWillClose.event; }

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
		this._register(this.storageService.onWillClose(reason => this._onWillClose.fire(reason)));

		const globalKeyMarker = 'storage://global/';
		this._register(addDisposableListener(window, 'storage', (e: StorageEvent) => {
			if (startsWith(e.key, globalKeyMarker)) {
				const key = e.key.substr(globalKeyMarker.length);

				this._onDidChangeStorage.fire({ key, scope: StorageScope.GLOBAL });
			}
		}));
	}

	get(key: string, scope: StorageScope, fallbackValue?: any): string {
		const dbValue = this.storageService.get(key, scope, fallbackValue);
		const localStorageValue = this.storageLegacyService.get(key, this.convertScope(scope), fallbackValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return localStorageValue;
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean {
		const dbValue = this.storageService.getBoolean(key, scope, fallbackValue);
		const localStorageValue = this.storageLegacyService.getBoolean(key, this.convertScope(scope), fallbackValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return localStorageValue;
	}

	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number {
		const dbValue = this.storageService.getInteger(key, scope, fallbackValue);
		const localStorageValue = this.storageLegacyService.getInteger(key, this.convertScope(scope), fallbackValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return localStorageValue;
	}

	private assertStorageValue(key: string, scope: StorageScope, dbValue: any, storageValue: any): void {
		if (dbValue && dbValue !== storageValue) {
			this.logService.error(`Unexpected storage value (key: ${key}, scope: ${scope === StorageScope.GLOBAL ? 'global' : 'workspace'}), actual: ${dbValue}, expected: ${storageValue}`);
		}
	}

	set(key: string, value: any, scope: StorageScope): Promise<void> {
		if (this.closed) {
			this.logService.warn(`Unsupported write (set) access after close (key: ${key})`);

			return Promise.resolve(); // prevent writing after close to detect late write access
		}

		this.storageLegacyService.store(key, value, this.convertScope(scope));

		return this.storageService.set(key, value, scope);
	}

	delete(key: string, scope: StorageScope): Promise<void> {
		if (this.closed) {
			this.logService.warn(`Unsupported write (delete) access after close (key: ${key})`);

			return Promise.resolve(); // prevent writing after close to detect late write access
		}

		this.storageLegacyService.remove(key, this.convertScope(scope));

		return this.storageService.delete(key, scope);
	}

	close(reason: ShutdownReason): Promise<void> {
		this.closed = true;

		return this.storageService.close(reason);
	}

	private convertScope(scope: StorageScope): StorageLegacyScope {
		return scope === StorageScope.GLOBAL ? StorageLegacyScope.GLOBAL : StorageLegacyScope.WORKSPACE;
	}
}