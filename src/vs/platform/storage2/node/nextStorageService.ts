/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceStorageChangeEvent, INextStorageService, StorageScope } from 'vs/platform/storage2/common/storage2';
import { Storage, IStorageLoggingOptions } from 'vs/base/node/storage';
import { IStorageService, StorageScope as LocalStorageScope } from 'vs/platform/storage/common/storage';

export class NextStorageService extends Disposable implements INextStorageService {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

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
		return Promise.all([
			this.globalStorage.close(),
			this.workspaceStorage.close()
		]).then(() => void 0);
	}

	private getStorage(scope: StorageScope): Storage {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}
}

export class NextDelegatingStorageService extends Disposable implements INextStorageService {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	constructor(
		@INextStorageService private nextStorageService: NextStorageService,
		@IStorageService private storageService: IStorageService,
		@ILogService private logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		this._register(this.nextStorageService.onDidChangeStorage(e => this._onDidChangeStorage.fire(e)));
	}

	get(key: string, scope: StorageScope, fallbackValue?: any): string {
		const dbValue = this.nextStorageService.get(key, scope, fallbackValue);
		const localStorageValue = this.storageService.get(key, this.convertScope(scope), fallbackValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return localStorageValue;
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean {
		const dbValue = this.nextStorageService.getBoolean(key, scope, fallbackValue);
		const localStorageValue = this.storageService.getBoolean(key, this.convertScope(scope), fallbackValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return localStorageValue;
	}

	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number {
		const dbValue = this.nextStorageService.getInteger(key, scope, fallbackValue);
		const localStorageValue = this.storageService.getInteger(key, this.convertScope(scope), fallbackValue);

		this.assertStorageValue(key, scope, dbValue, localStorageValue);

		return localStorageValue;
	}

	private assertStorageValue(key: string, scope: StorageScope, dbValue: any, storageValue: any): void {
		if (dbValue !== storageValue) {
			this.logService.error(`Unexpected storage value (key: ${key}, scope: ${scope === StorageScope.GLOBAL ? 'global' : 'workspace'}), actual: ${dbValue}, expected: ${storageValue}`);
		}
	}

	set(key: string, value: any, scope: StorageScope): Promise<void> {
		this.storageService.store(key, value, this.convertScope(scope));

		return this.nextStorageService.set(key, value, scope);
	}

	delete(key: string, scope: StorageScope): Promise<void> {
		this.storageService.remove(key, this.convertScope(scope));

		return this.nextStorageService.delete(key, scope);
	}

	close(): Promise<void> {
		return this.nextStorageService.close();
	}

	private convertScope(scope: StorageScope): LocalStorageScope {
		return scope === StorageScope.GLOBAL ? LocalStorageScope.GLOBAL : LocalStorageScope.WORKSPACE;
	}
}