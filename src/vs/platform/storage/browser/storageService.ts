/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { IWorkspaceStorageChangeEvent, IStorageService, StorageScope, IWillSaveStateEvent, WillSaveStateReason, logStorage, FileStorageDatabase } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IFileService } from 'vs/platform/files/common/files';
import { IStorage, Storage } from 'vs/base/parts/storage/common/storage';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { runWhenIdle } from 'vs/base/common/async';

export class BrowserStorageService extends Disposable implements IStorageService {

	_serviceBrand: ServiceIdentifier<any>;

	private readonly _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	readonly onDidChangeStorage: Event<IWorkspaceStorageChangeEvent> = this._onDidChangeStorage.event;

	private readonly _onWillSaveState: Emitter<IWillSaveStateEvent> = this._register(new Emitter<IWillSaveStateEvent>());
	readonly onWillSaveState: Event<IWillSaveStateEvent> = this._onWillSaveState.event;

	private globalStorage: IStorage;
	private workspaceStorage: IStorage;

	private globalStorageFile: URI;
	private workspaceStorageFile: URI;

	private initializePromise: Promise<void>;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		// In the browser we do not have support for long running unload sequences. As such,
		// we cannot ask for saving state in that moment, because that would result in a
		// long running operation.
		// Instead, periodically ask customers to save save. The library will be clever enough
		// to only save state that has actually changed.
		this.saveStatePeriodically();
	}

	private saveStatePeriodically(): void {
		setTimeout(() => {
			runWhenIdle(() => {

				// this event will potentially cause new state to be stored
				this._onWillSaveState.fire({ reason: WillSaveStateReason.NONE });

				// repeat
				this.saveStatePeriodically();
			});
		}, 5000);
	}

	initialize(payload: IWorkspaceInitializationPayload): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = this.doInitialize(payload);
		}

		return this.initializePromise;
	}

	private async doInitialize(payload: IWorkspaceInitializationPayload): Promise<void> {

		// Ensure state folder exists
		const stateRoot = joinPath(this.environmentService.userRoamingDataHome, 'state');
		await this.fileService.createFolder(stateRoot);

		// Workspace Storage
		this.workspaceStorageFile = joinPath(stateRoot, `${payload.id}.json`);
		this.workspaceStorage = new Storage(this._register(new FileStorageDatabase(this.workspaceStorageFile, this.fileService)));
		this._register(this.workspaceStorage.onDidChangeStorage(key => this._onDidChangeStorage.fire({ key, scope: StorageScope.WORKSPACE })));

		// Global Storage
		this.globalStorageFile = joinPath(stateRoot, 'global.json');
		this.globalStorage = new Storage(this._register(new FileStorageDatabase(this.globalStorageFile, this.fileService)));
		this._register(this.globalStorage.onDidChangeStorage(key => this._onDidChangeStorage.fire({ key, scope: StorageScope.GLOBAL })));

		// Init both
		await Promise.all([
			this.workspaceStorage.init(),
			this.globalStorage.init()
		]);
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

	private getStorage(scope: StorageScope): IStorage {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}

	async logStorage(): Promise<void> {
		const result = await Promise.all([
			this.globalStorage.items,
			this.workspaceStorage.items
		]);

		return logStorage(result[0], result[1], this.globalStorageFile.toString(), this.workspaceStorageFile.toString());
	}

	close(): void {

		// Signal as event so that clients can still store data
		this._onWillSaveState.fire({ reason: WillSaveStateReason.SHUTDOWN });
	}
}
