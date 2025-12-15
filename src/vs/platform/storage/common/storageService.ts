/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from '../../../base/common/async.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { joinPath } from '../../../base/common/resources.js';
import { IStorage, Storage } from '../../../base/parts/storage/common/storage.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IRemoteService } from '../../ipc/common/services.js';
import { AbstractStorageService, isProfileUsingDefaultStorage, StorageScope, WillSaveStateReason } from './storage.js';
import { ApplicationStorageDatabaseClient, ProfileStorageDatabaseClient, WorkspaceStorageDatabaseClient } from './storageIpc.js';
import { isUserDataProfile, IUserDataProfile } from '../../userDataProfile/common/userDataProfile.js';
import { IAnyWorkspaceIdentifier } from '../../workspace/common/workspace.js';

export class RemoteStorageService extends AbstractStorageService {

	private readonly applicationStorageProfile: IUserDataProfile;
	private readonly applicationStorage: IStorage;

	private profileStorageProfile: IUserDataProfile;
	private readonly profileStorageDisposables = this._register(new DisposableStore());
	private profileStorage: IStorage;

	private workspaceStorageId: string | undefined;
	private readonly workspaceStorageDisposables = this._register(new DisposableStore());
	private workspaceStorage: IStorage | undefined;

	constructor(
		initialWorkspace: IAnyWorkspaceIdentifier | undefined,
		initialProfiles: { defaultProfile: IUserDataProfile; currentProfile: IUserDataProfile },
		private readonly remoteService: IRemoteService,
		private readonly environmentService: IEnvironmentService
	) {
		super();

		this.applicationStorageProfile = initialProfiles.defaultProfile;
		this.applicationStorage = this.createApplicationStorage();

		this.profileStorageProfile = initialProfiles.currentProfile;
		this.profileStorage = this.createProfileStorage(this.profileStorageProfile);

		this.workspaceStorageId = initialWorkspace?.id;
		this.workspaceStorage = this.createWorkspaceStorage(initialWorkspace);
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
