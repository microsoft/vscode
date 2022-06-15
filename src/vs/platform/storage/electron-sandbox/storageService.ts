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
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IAnyWorkspaceIdentifier, IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class NativeStorageService extends AbstractStorageService {

	// Application Storage is readonly and shared across
	// windows and profiles.
	private readonly applicationStorage: IStorage;

	// Global Storage is readonly and shared across windows
	// under the same profile.
	private readonly globalStorage: IStorage;

	// Workspace Storage is scoped to a window but can change
	// in the current window, when entering a workspace!
	private workspaceStorage: IStorage | undefined = undefined;
	private workspaceStorageId: string | undefined = undefined;
	private workspaceStorageDisposable = this._register(new MutableDisposable());

	constructor(
		workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined,
		private readonly mainProcessService: IMainProcessService,
		private readonly userDataProfilesService: IUserDataProfilesService,
		private readonly environmentService: IEnvironmentService,
	) {
		super();

		this.applicationStorage = this.createApplicationStorage();
		this.globalStorage = this.createGlobalStorage();
		this.workspaceStorage = this.createWorkspaceStorage(workspace);
	}

	private createApplicationStorage(): IStorage {
		const storageDataBaseClient = new StorageDatabaseChannelClient(this.mainProcessService.getChannel('storage'), this.userDataProfilesService, undefined);
		const applicationStorage = new Storage(storageDataBaseClient.applicationStorage);

		this._register(applicationStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.APPLICATION, key)));

		return applicationStorage;
	}

	private createGlobalStorage(): IStorage {
		let globalStorage: IStorage;

		if (this.userDataProfilesService.currentProfile.isDefault) {

			// If we are in default profile, the global storage is
			// actually the same as application storage. As such we
			// avoid creating the storage library a second time on
			// the same DB.

			globalStorage = this.applicationStorage;
		} else {
			const storageDataBaseClient = new StorageDatabaseChannelClient(this.mainProcessService.getChannel('storage'), this.userDataProfilesService, undefined);
			globalStorage = new Storage(storageDataBaseClient.globalStorage);
		}

		this._register(globalStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.GLOBAL, key)));

		return globalStorage;
	}

	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier): IStorage;
	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): IStorage | undefined;
	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): IStorage | undefined {
		const storageDataBaseClient = new StorageDatabaseChannelClient(this.mainProcessService.getChannel('storage'), this.userDataProfilesService, workspace);

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
			this.applicationStorage.init(),
			this.globalStorage.init(),
			this.workspaceStorage?.init() ?? Promise.resolve()
		]);
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		switch (scope) {
			case StorageScope.APPLICATION:
				return this.applicationStorage;
			case StorageScope.GLOBAL:
				return this.globalStorage;
			default:
				return this.workspaceStorage;
		}
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		switch (scope) {
			case StorageScope.APPLICATION:
				return this.userDataProfilesService.defaultProfile.globalStorageHome.fsPath;
			case StorageScope.GLOBAL:
				return this.userDataProfilesService.currentProfile.globalStorageHome.fsPath;
			default:
				return this.workspaceStorageId ? `${joinPath(this.environmentService.workspaceStorageHome, this.workspaceStorageId, 'state.vscdb').fsPath}` : undefined;
		}
	}

	async close(): Promise<void> {

		// Stop periodic scheduler and idle runner as we now collect state normally
		this.stopFlushWhenIdle();

		// Signal as event so that clients can still store data
		this.emitWillSaveState(WillSaveStateReason.SHUTDOWN);

		// Do it
		await Promises.settled([
			this.applicationStorage.close(),
			this.globalStorage.close(),
			this.workspaceStorage?.close() ?? Promise.resolve()
		]);
	}

	async migrate(toWorkspace: IAnyWorkspaceIdentifier): Promise<void> {

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
