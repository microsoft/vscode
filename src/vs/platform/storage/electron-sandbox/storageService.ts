/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from 'vs/base/common/async';
import { MutableDisposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { IStorage, Storage } from 'vs/base/parts/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { AbstractStorageService, StorageScope, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { StorageDatabaseChannelClient } from 'vs/platform/storage/common/storageIpc';
import { IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier, IWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';

export class NativeStorageService extends AbstractStorageService {

	// Global Storage is readonly and shared across windows
	private readonly globalStorage: IStorage;

	// Workspace Storage is scoped to a window but can change
	// in the current window, when entering a workspace!
	private workspaceStorage: IStorage | undefined = undefined;
	private workspaceStorageId: string | undefined = undefined;
	private workspaceStorageDisposable = this._register(new MutableDisposable());

	constructor(
		workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined,
		private readonly mainProcessService: IMainProcessService,
		private readonly environmentService: IEnvironmentService
	) {
		super();

		this.globalStorage = this.createGlobalStorage();
		this.workspaceStorage = this.createWorkspaceStorage(workspace);
	}

	private createGlobalStorage(): IStorage {
		const storageDataBaseClient = new StorageDatabaseChannelClient(this.mainProcessService.getChannel('storage'), undefined);

		const globalStorage = new Storage(storageDataBaseClient.globalStorage);

		this._register(globalStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.GLOBAL, key)));

		return globalStorage;
	}

	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier): IStorage;
	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): IStorage | undefined;
	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): IStorage | undefined {
		const storageDataBaseClient = new StorageDatabaseChannelClient(this.mainProcessService.getChannel('storage'), workspace);

		if (storageDataBaseClient.workspaceStorage) {
			const workspaceStorage = new Storage(storageDataBaseClient.workspaceStorage);

			this.workspaceStorageDisposable.value = workspaceStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.WORKSPACE, key));
			this.workspaceStorageId = workspace?.id;

			return workspaceStorage;
		} else {
			this.workspaceStorageDisposable.clear();
			this.workspaceStorageId = undefined;

			return undefined;
		}
	}

	protected async doInitialize(): Promise<void> {
		// Init all storage locations
		await Promises.settled([
			this.globalStorage.init(),
			this.workspaceStorage?.init() ?? Promise.resolve()
		]);
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		return scope === StorageScope.GLOBAL ? this.environmentService.globalStorageHome.fsPath : this.workspaceStorageId ? `${joinPath(this.environmentService.workspaceStorageHome, this.workspaceStorageId, 'state.vscdb').fsPath}` : undefined;
	}

	async close(): Promise<void> {

		// Stop periodic scheduler and idle runner as we now collect state normally
		this.stopFlushWhenIdle();

		// Signal as event so that clients can still store data
		this.emitWillSaveState(WillSaveStateReason.SHUTDOWN);

		// Do it
		await Promises.settled([
			this.globalStorage.close(),
			this.workspaceStorage?.close() ?? Promise.resolve()
		]);
	}

	async migrate(toWorkspace: IWorkspaceInitializationPayload): Promise<void> {

		// Keep current workspace storage items around to restore
		const oldWorkspaceStorage = this.workspaceStorage;
		const oldItems = oldWorkspaceStorage?.items ?? new Map();

		// Close current which will change to new workspace storage
		if (oldWorkspaceStorage) {
			await oldWorkspaceStorage.close();
			oldWorkspaceStorage.dispose();
		}

		// Create new workspace storage & init
		this.workspaceStorage = this.createWorkspaceStorage(toWorkspace);
		await this.workspaceStorage.init();

		// Copy over previous keys
		for (const [key, value] of oldItems) {
			this.workspaceStorage.set(key, value);
		}
	}
}
