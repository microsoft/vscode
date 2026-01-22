/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IEnvironmentService } from '../../platform/environment/common/environment.js';
import { IUserDataProfilesService, IUserDataProfile } from '../../platform/userDataProfile/common/userDataProfile.js';
import { isProfileUsingDefaultStorage } from '../../platform/storage/common/storage.js';
import { IStorageMain, IStorageMainOptions, IStorageChangeEvent, ApplicationStorageMain, ProfileStorageMain, WorkspaceStorageMain } from '../../platform/storage/node/storageMain.js';
import { IAnyWorkspaceIdentifier } from '../../platform/workspace/common/workspace.js';

//#region Server Storage Main Service

export const IServerStorageMainService = createDecorator<IServerStorageMainService>('serverStorageMainService');

export interface IProfileStorageChangeEvent extends IStorageChangeEvent {
	readonly storage: IStorageMain;
	readonly profile: IUserDataProfile;
}

export interface IServerStorageMainService {

	readonly _serviceBrand: undefined;

	/**
	 * Provides access to the application storage shared across all
	 * windows and all profiles.
	 */
	readonly applicationStorage: IStorageMain;

	/**
	 * Emitted whenever data is updated or deleted in profile scoped storage.
	 */
	readonly onDidChangeProfileStorage: Event<IProfileStorageChangeEvent>;

	/**
	 * Provides access to the profile storage shared across all windows
	 * for the provided profile.
	 */
	profileStorage(profile: IUserDataProfile): IStorageMain;

	/**
	 * Provides access to the workspace storage specific to a single window.
	 */
	workspaceStorage(workspace: IAnyWorkspaceIdentifier): IStorageMain;

	/**
	 * Checks if the provided path is currently in use for a storage database.
	 *
	 * @param path the path to the storage file or parent folder
	 */
	isUsed(path: string): boolean;
}

export class ServerStorageMainService extends Disposable implements IServerStorageMainService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProfileStorage = this._register(new Emitter<IProfileStorageChangeEvent>());
	readonly onDidChangeProfileStorage = this._onDidChangeProfileStorage.event;

	readonly applicationStorage: IStorageMain;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		this.applicationStorage = this._register(this.createApplicationStorage());

		this.registerListeners();
	}

	protected getStorageOptions(): IStorageMainOptions {
		return {
			useInMemoryStorage: false
		};
	}

	private registerListeners(): void {
		// Initialize application storage immediately
		this.applicationStorage.init();

		// Listen for profile changes
		this._register(this.userDataProfilesService.onDidChangeProfiles(e => {
			// Create storage for added profiles
			for (const profile of e.added) {
				(async () => {
					if (!(await this.fileService.exists(profile.globalStorageHome))) {
						await this.fileService.createFolder(profile.globalStorageHome);
					}
				})();
			}

			// Close storage for removed profiles
			for (const profile of e.removed) {
				const storage = this.mapProfileToStorage.get(profile.id);
				if (storage) {
					storage.close();
					this.mapProfileToStorage.delete(profile.id);
				}
			}
		}));
	}

	//#region Application Storage

	private createApplicationStorage(): IStorageMain {
		this.logService.trace(`ServerStorageMainService: creating application storage`);

		const applicationStorage = new ApplicationStorageMain(this.getStorageOptions(), this.userDataProfilesService, this.logService, this.fileService);

		this._register(Event.once(applicationStorage.onDidCloseStorage)(() => {
			this.logService.trace(`ServerStorageMainService: closed application storage`);
		}));

		return applicationStorage;
	}

	//#endregion

	//#region Profile Storage

	private readonly mapProfileToStorage = new Map<string /* profile ID */, IStorageMain>();

	profileStorage(profile: IUserDataProfile): IStorageMain {
		if (isProfileUsingDefaultStorage(profile)) {
			return this.applicationStorage; // for profiles using default storage, use application storage
		}

		let profileStorage = this.mapProfileToStorage.get(profile.id);
		if (!profileStorage) {
			this.logService.trace(`ServerStorageMainService: creating profile storage (${profile.name})`);

			profileStorage = this._register(this.createProfileStorage(profile));
			this.mapProfileToStorage.set(profile.id, profileStorage);

			const listener = this._register(profileStorage.onDidChangeStorage(e => this._onDidChangeProfileStorage.fire({
				...e,
				storage: profileStorage!,
				profile
			})));

			this._register(Event.once(profileStorage.onDidCloseStorage)(() => {
				this.logService.trace(`ServerStorageMainService: closed profile storage (${profile.name})`);

				this.mapProfileToStorage.delete(profile.id);
				listener.dispose();
			}));
		}

		return profileStorage;
	}

	private createProfileStorage(profile: IUserDataProfile): IStorageMain {
		return new ProfileStorageMain(profile, this.getStorageOptions(), this.logService, this.fileService);
	}

	//#endregion


	//#region Workspace Storage

	private readonly mapWorkspaceToStorage = new Map<string /* workspace ID */, IStorageMain>();

	workspaceStorage(workspace: IAnyWorkspaceIdentifier): IStorageMain {
		let workspaceStorage = this.mapWorkspaceToStorage.get(workspace.id);
		if (!workspaceStorage) {
			this.logService.trace(`ServerStorageMainService: creating workspace storage (${workspace.id})`);

			workspaceStorage = this._register(this.createWorkspaceStorage(workspace));
			this.mapWorkspaceToStorage.set(workspace.id, workspaceStorage);

			this._register(Event.once(workspaceStorage.onDidCloseStorage)(() => {
				this.logService.trace(`ServerStorageMainService: closed workspace storage (${workspace.id})`);

				this.mapWorkspaceToStorage.delete(workspace.id);
			}));
		}

		return workspaceStorage;
	}

	private createWorkspaceStorage(workspace: IAnyWorkspaceIdentifier): IStorageMain {
		return new WorkspaceStorageMain(workspace, this.getStorageOptions(), this.logService, this.environmentService, this.fileService);
	}

	//#endregion

	isUsed(path: string): boolean {
		// For server, we don't need to track file usage like the electron-main service
		// This is primarily used for external file operations in the desktop app
		return false;
	}
}

//#endregion
