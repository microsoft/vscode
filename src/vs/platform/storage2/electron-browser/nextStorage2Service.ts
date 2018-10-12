/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceStorageChangeEvent, INextStorage2Service, StorageScope } from 'vs/platform/storage2/common/storage2';
import { Storage, IStorageLoggingOptions } from 'vs/base/node/storage';
import { IStorageService, StorageScope as LocalStorageScope } from 'vs/platform/storage/common/storage';
import { addDisposableListener } from 'vs/base/browser/dom';
import { startsWith } from 'vs/base/common/strings';

export class NextStorage2Service extends Disposable implements INextStorage2Service {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillClose: Emitter<void> = this._register(new Emitter<void>());
	get onWillClose(): Event<void> { return this._onWillClose.event; }

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

	close(): Promise<void> {

		// Signal as event so that clients can still store data
		this._onWillClose.fire();

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

export class NextDelegatingStorage2Service extends Disposable implements INextStorage2Service {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillClose: Emitter<void> = this._register(new Emitter<void>());
	get onWillClose(): Event<void> { return this._onWillClose.event; }

	constructor(
		@INextStorage2Service private nextStorage2Service: NextStorage2Service,
		@IStorageService private storageService: IStorageService,
		@ILogService private logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.nextStorage2Service.onDidChangeStorage(e => this._onDidChangeStorage.fire(e)));
		this._register(this.nextStorage2Service.onWillClose(e => this._onWillClose.fire()));

		const globalKeyMarker = 'storage://global/';
		this._register(addDisposableListener(window, 'storage', (e: StorageEvent) => {
			if (startsWith(e.key, globalKeyMarker)) {
				const key = e.key.substr(globalKeyMarker.length);

				this._onDidChangeStorage.fire({ key, scope: StorageScope.GLOBAL });
			}
		}));
	}

	get(key: string, scope: StorageScope, fallbackValue?: any): string {
		const dbValue = this.nextStorage2Service.get(key, scope, fallbackValue);
		const localStorageValue = this.storageService.get(key, this.convertScope(scope), fallbackValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return localStorageValue;
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean {
		const dbValue = this.nextStorage2Service.getBoolean(key, scope, fallbackValue);
		const localStorageValue = this.storageService.getBoolean(key, this.convertScope(scope), fallbackValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return localStorageValue;
	}

	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number {
		const dbValue = this.nextStorage2Service.getInteger(key, scope, fallbackValue);
		const localStorageValue = this.storageService.getInteger(key, this.convertScope(scope), fallbackValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return localStorageValue;
	}

	private assertStorageValue(key: string, scope: StorageScope, dbValue: any, storageValue: any): void {
		if (dbValue && dbValue !== storageValue) {
			this.logService.error(`Unexpected storage value (key: ${key}, scope: ${scope === StorageScope.GLOBAL ? 'global' : 'workspace'}), actual: ${dbValue}, expected: ${storageValue}`);
		}
	}

	set(key: string, value: any, scope: StorageScope): Promise<void> {
		this.storageService.store(key, value, this.convertScope(scope));

		return this.nextStorage2Service.set(key, value, scope);
	}

	delete(key: string, scope: StorageScope): Promise<void> {
		this.storageService.remove(key, this.convertScope(scope));

		return this.nextStorage2Service.delete(key, scope);
	}

	close(): Promise<void> {
		return this.nextStorage2Service.close();
	}

	private convertScope(scope: StorageScope): LocalStorageScope {
		return scope === StorageScope.GLOBAL ? LocalStorageScope.GLOBAL : LocalStorageScope.WORKSPACE;
	}
}

export class NextInMemoryStorage2Service extends NextStorage2Service {

	constructor(
		@ILogService logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super(':memory:', logService, environmentService);
	}
}