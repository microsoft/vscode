/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from 'vs/base/common/async';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { joinPath } from 'vs/base/common/resources';
import { IStorage, Storage } from 'vs/base/parts/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IRemoteService } from 'vs/platform/ipc/common/services';
import { AbstractStorageService, isProfileUsingDefaultStorage, StorageScope, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { ApplicationStorageDatabaseClient, ProfileStorageDatabaseClient, WorkspaceStorageDatabaseClient } from 'vs/platform/storage/common/storageIpc';
import { isUserDataProfile, IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IAnyWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class RemoteStorageService extends AbstractStorageService {

	private readonly applicationStorageProfile = this.initialProfiles.defaultProfile;
	private readonly applicationStorage = this.createApplicationStorage();

	private profileStorageProfile = this.initialProfiles.currentProfile;
	private readonly profileStorageDisposables = this._register(new DisposableStore());
	private profileStorage = this.createProfileStorage(this.profileStorageProfile);

	private workspaceStorageId = this.initialWorkspace?.id;
	private readonly workspaceStorageDisposables = this._register(new DisposableStore());
	private workspaceStorage = this.createWorkspaceStorage(this.initialWorkspace);

	constructor(
		private readonly initialWorkspace: IAnyWorkspaceIdentifier | undefined,
		private readonly initialProfiles: { defaultProfile: IUserDataProfile; currentProfile: IUserDataProfile },
		private readonly remoteService: IRemoteService,
		private readonly environmentService: IEnvironmentService
	) {
		super();
	}

	private createApplicationStorage(): IStorage {
		const storageDataBaseClient = this._register(new ApplicationStorageDatabaseClient(this.remoteService.getChannel('storage')));
		const applicationStorage = this._register(new Storage(storageDataBaseClient));

		this._register(applicationStorage.onDidChangeStorage(e => this.emitDidChangeValue(StorageScope.APPLICATION, e)));

		return applicationStorage;
	}

	private createProfileStorage(profile: IUserDataProfile): IStorage {

		// First clear any previously associated disposables
		this.profileStorageDisposables.clear();

		// Remember profile associated to profile storage
		this.profileStorageProfile = profile;

		let profileStorage: IStorage;
		if (isProfileUsingDefaultStorage(profile)) {

			// If we are using default profile storage, the profile storage is
			// actually the same as application storage. As such we
			// avoid creating the storage library a second time on
			// the same DB.

			profileStorage = this.applicationStorage;
		} else {
			const storageDataBaseClient = this.profileStorageDisposables.add(new ProfileStorageDatabaseClient(this.remoteService.getChannel('storage'), profile));
			profileStorage = this.profileStorageDisposables.add(new Storage(storageDataBaseClient));
		}

		this.profileStorageDisposables.add(profileStorage.onDidChangeStorage(e => this.emitDidChangeValue(StorageScope.PROFILE, e)));

		return profileStorage;
	}

	private createWorkspaceStorage(workspace: IAnyWorkspaceIdentifier): IStorage;
	private createWorkspaceStorage(workspace: IAnyWorkspaceIdentifier | undefined): IStorage | undefined;
	private createWorkspaceStorage(workspace: IAnyWorkspaceIdentifier | undefined): IStorage | undefined {

		// First clear any previously associated disposables
		this.workspaceStorageDisposables.clear();

		// Remember workspace ID for logging later
		this.workspaceStorageId = workspace?.id;

		let workspaceStorage: IStorage | undefined = undefined;
		if (workspace) {
			const storageDataBaseClient = this.workspaceStorageDisposables.add(new WorkspaceStorageDatabaseClient(this.remoteService.getChannel('storage'), workspace));
			workspaceStorage = this.workspaceStorageDisposables.add(new Storage(storageDataBaseClient));

			this.workspaceStorageDisposables.add(workspaceStorage.onDidChangeStorage(e => this.emitDidChangeValue(StorageScope.WORKSPACE, e)));
		}

		return workspaceStorage;
	}

	protected async doInitialize(): Promise<void> {

		// Init all storage locations
		await Promises.settled([
			this.applicationStorage.init(),
			this.profileStorage.init(),
			this.workspaceStorage?.init() ?? Promise.resolve()
		]);
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		switch (scope) {
			case StorageScope.APPLICATION:
				return this.applicationStorage;
			case StorageScope.PROFILE:
				return this.profileStorage;
			default:
				return this.workspaceStorage;
		}
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		switch (scope) {
			case StorageScope.APPLICATION:
				return this.applicationStorageProfile.globalStorageHome.with({ scheme: Schemas.file }).fsPath;
			case StorageScope.PROFILE:
				return this.profileStorageProfile?.globalStorageHome.with({ scheme: Schemas.file }).fsPath;
			default:
				return this.workspaceStorageId ? `${joinPath(this.environmentService.workspaceStorageHome, this.workspaceStorageId, 'state.vscdb').with({ scheme: Schemas.file }).fsPath}` : undefined;
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
			this.profileStorage.close(),
			this.workspaceStorage?.close() ?? Promise.resolve()
		]);
	}

	protected async switchToProfile(toProfile: IUserDataProfile): Promise<void> {
		if (!this.canSwitchProfile(this.profileStorageProfile, toProfile)) {
			return;
		}

		const oldProfileStorage = this.profileStorage;
		const oldItems = oldProfileStorage.items;

		// Close old profile storage but only if this is
		// different from application storage!
		if (oldProfileStorage !== this.applicationStorage) {
			await oldProfileStorage.close();
		}

		// Create new profile storage & init
		this.profileStorage = this.createProfileStorage(toProfile);
		await this.profileStorage.init();

		// Handle data switch and eventing
		this.switchData(oldItems, this.profileStorage, StorageScope.PROFILE);
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
		this.switchData(oldItems, this.workspaceStorage, StorageScope.WORKSPACE);
	}

	hasScope(scope: IAnyWorkspaceIdentifier | IUserDataProfile): boolean {
		if (isUserDataProfile(scope)) {
			return this.profileStorageProfile.id === scope.id;
		}

		return this.workspaceStorageId === scope.id;
	}
}
