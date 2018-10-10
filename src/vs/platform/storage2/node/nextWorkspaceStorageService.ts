/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceStorageChangeEvent, INextWorkspaceStorageService, StorageScope } from 'vs/platform/storage2/common/storage2';
import { Storage, IStorageLoggingOptions } from 'vs/base/node/storage';

export class NextWorkspaceStorageService extends Disposable implements INextWorkspaceStorageService {
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
		this._register(this.globalStorage.onDidChangeStorage(keys => this.handleDidChangeStorage(keys, StorageScope.GLOBAL)));
		this._register(this.workspaceStorage.onDidChangeStorage(keys => this.handleDidChangeStorage(keys, StorageScope.WORKSPACE)));
	}

	private handleDidChangeStorage(keys: Set<string>, scope: StorageScope): void {
		this._onDidChangeStorage.fire({ keys, scope });
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