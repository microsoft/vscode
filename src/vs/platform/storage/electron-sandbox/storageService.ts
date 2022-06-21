/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from 'vs/base/common/async';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { IStorage, Storage } from 'vs/base/parts/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { AbstractStorageService, StorageScope, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { GlobalStorageDatabaseClient, ProfileStorageDatabaseClient, WorkspaceStorageDatabaseClient } from 'vs/platform/storage/common/storageIpc';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IAnyWorkspaceIdentifier, IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class NativeStorageService extends AbstractStorageService {

	private readonly globalStorage: IStorage;
	private readonly globalStorageProfile: IUserDataProfile;

	private profileStorage: IStorage;
	private profileStorageProfile: IUserDataProfile | undefined = undefined;
	private readonly profileStorageDisposables = this._register(new DisposableStore());

	private workspaceStorage: IStorage | undefined = undefined;
	private workspaceStorageId: string | undefined = undefined;
	private readonly workspaceStorageDisposables = this._register(new DisposableStore());

	constructor(
		workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined,
		{ defaultProfile, currentProfile }: { defaultProfile: IUserDataProfile; currentProfile: IUserDataProfile },
		private readonly mainProcessService: IMainProcessService,
		private readonly environmentService: IEnvironmentService
	) {
		super();

		this.globalStorageProfile = defaultProfile;

		this.globalStorage = this.createGlobalStorage();
		this.profileStorage = this.createProfileStorage(currentProfile);
		this.workspaceStorage = this.createWorkspaceStorage(workspace);
	}

	private createGlobalStorage(): IStorage {
		const storageDataBaseClient = this._register(new GlobalStorageDatabaseClient(this.mainProcessService.getChannel('storage')));
		const globalStorage = this._register(new Storage(storageDataBaseClient));

		this._register(globalStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.GLOBAL, key)));

		return globalStorage;
	}

	private createProfileStorage(profile: IUserDataProfile): IStorage {

		// First clear any previously associated disposables
		this.profileStorageDisposables.clear();

		// Remember profile associated to profile storage
		this.profileStorageProfile = profile;

		let profileStorage: IStorage;
		if (profile.isDefault) {

			// If we are in default profile, the profile storage is
			// actually the same as global storage. As such we
			// avoid creating the storage library a second time on
			// the same DB.

			profileStorage = this.globalStorage;
		} else {
			const storageDataBaseClient = this.profileStorageDisposables.add(new ProfileStorageDatabaseClient(this.mainProcessService.getChannel('storage'), profile));
			profileStorage = this.profileStorageDisposables.add(new Storage(storageDataBaseClient));
		}

		this.profileStorageDisposables.add(profileStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.PROFILE, key)));

		return profileStorage;
	}

	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier): IStorage;
	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): IStorage | undefined;
	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): IStorage | undefined {

		// First clear any previously associated disposables
		this.workspaceStorageDisposables.clear();

		// Remember workspace ID for logging later
		this.workspaceStorageId = workspace?.id;

		let workspaceStorage: IStorage | undefined = undefined;
		if (workspace) {
			const storageDataBaseClient = this.workspaceStorageDisposables.add(new WorkspaceStorageDatabaseClient(this.mainProcessService.getChannel('storage'), workspace));
			workspaceStorage = this.workspaceStorageDisposables.add(new Storage(storageDataBaseClient));

			this.workspaceStorageDisposables.add(workspaceStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.WORKSPACE, key)));
		}

		return workspaceStorage;
	}

	protected async doInitialize(): Promise<void> {

		// Init all storage locations
		await Promises.settled([
			this.globalStorage.init(),
			this.profileStorage.init(),
			this.workspaceStorage?.init() ?? Promise.resolve()
		]);
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		switch (scope) {
			case StorageScope.GLOBAL:
				return this.globalStorage;
			case StorageScope.PROFILE:
				return this.profileStorage;
			default:
				return this.workspaceStorage;
		}
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		switch (scope) {
			case StorageScope.GLOBAL:
				return this.globalStorageProfile.globalStorageHome.fsPath;
			case StorageScope.PROFILE:
				return this.profileStorageProfile?.globalStorageHome.fsPath;
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
			this.globalStorage.close(),
			this.profileStorage.close(),
			this.workspaceStorage?.close() ?? Promise.resolve()
		]);
	}

	protected async switchToProfile(toProfile: IUserDataProfile, preserveData: boolean): Promise<void> {
		if (this.profileStorageProfile && !this.canSwitchProfile(this.profileStorageProfile, toProfile)) {
			return;
		}

		const oldProfileStorage = this.profileStorage;
		const oldItems = oldProfileStorage.items;

		// Close old profile storage but only if this is
		// different from global storage!
		if (oldProfileStorage !== this.globalStorage) {
			await oldProfileStorage.close();
		}

		// Create new profile storage & init
		this.profileStorage = this.createProfileStorage(toProfile);
		await this.profileStorage.init();

		// Handle data switch and eventing
		this.switchData(oldItems, this.profileStorage, StorageScope.PROFILE, preserveData);
	}

	protected async switchToWorkspace(toWorkspace: IAnyWorkspaceIdentifier, preserveData: boolean): Promise<void> {
		const oldWorkspaceStorage = this.workspaceStorage;
		const oldItems = oldWorkspaceStorage?.items ?? new Map();

		// Close old workspace storage
		await oldWorkspaceStorage?.close();

		// Create new workspace storage & init
		this.workspaceStorage = this.createWorkspaceStorage(toWorkspace);
		await this.workspaceStorage.init();

		// Handle data switch and eventing
		this.switchData(oldItems, this.workspaceStorage, StorageScope.WORKSPACE, preserveData);
	}
}
