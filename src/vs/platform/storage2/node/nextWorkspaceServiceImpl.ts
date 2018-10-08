/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceStorageChangeEvent, INextWorkspaceStorageService, StorageScope } from 'vs/platform/storage2/common/nextWorkspaceStorageService';
import { NextStorageServiceImpl } from 'vs/platform/storage2/node/nextStorageServiceImpl';
import { INextStorageService } from 'vs/platform/storage2/common/nextStorageService';
import { ILifecycleService, ShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';

export class NextWorkspaceStorageServiceImpl extends Disposable implements INextWorkspaceStorageService {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private globalStorage: NextStorageServiceImpl;
	private workspaceStorage: NextStorageServiceImpl;

	constructor(
		workspaceDBPath: string,
		@ILogService logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILifecycleService private lifecycleService: ILifecycleService
	) {
		super();

		this.globalStorage = new NextStorageServiceImpl(':memory:', logService, environmentService); // TODO proxy from main side!
		this.workspaceStorage = new NextStorageServiceImpl(workspaceDBPath, logService, environmentService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.globalStorage.onDidChangeStorage(keys => this.handleDidChangeStorage(keys, StorageScope.GLOBAL)));
		this._register(this.workspaceStorage.onDidChangeStorage(keys => this.handleDidChangeStorage(keys, StorageScope.WORKSPACE)));

		this._register(this.lifecycleService.onShutdown(event => this.onShutdown(event)));
	}

	private handleDidChangeStorage(keys: Set<string>, scope: StorageScope): void {
		this._onDidChangeStorage.fire({ keys, scope });
	}

	private onShutdown(event: ShutdownEvent): void {
		event.join(this.close());
	}

	init(): Promise<void> {
		return Promise.all([this.globalStorage.init(), this.workspaceStorage.init()]).then(() => void 0);
	}

	get(key: string, scope: StorageScope = StorageScope.GLOBAL, fallbackValue?: any): string {
		return this.getStorage(scope).get(key, fallbackValue);
	}

	getBoolean(key: string, scope: StorageScope = StorageScope.GLOBAL, fallbackValue?: boolean): boolean {
		return this.getStorage(scope).getBoolean(key, fallbackValue);
	}

	getInteger(key: string, scope: StorageScope = StorageScope.GLOBAL, fallbackValue?: number): number {
		return this.getStorage(scope).getInteger(key, fallbackValue);
	}

	set(key: string, value: any, scope: StorageScope = StorageScope.GLOBAL): Promise<void> {
		return this.getStorage(scope).set(key, value);

	}

	delete(key: string, scope: StorageScope = StorageScope.GLOBAL): Promise<void> {
		return this.getStorage(scope).delete(key);
	}

	close(): Promise<void> {
		return this.workspaceStorage.close();
	}

	private getStorage(scope: StorageScope): INextStorageService {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}
}