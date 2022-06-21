/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { once } from 'vs/base/common/functional';
import { Disposable } from 'vs/base/common/lifecycle';
import { IStorage } from 'vs/base/parts/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleMainService, LifecycleMainPhase, ShutdownReason } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractStorageService, IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { GlobalStorageMain, ProfileStorageMain, InMemoryStorageMain, IStorageMain, IStorageMainOptions, WorkspaceStorageMain } from 'vs/platform/storage/electron-main/storageMain';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IUserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';
import { IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

//#region Storage Main Service (intent: make global, profile and workspace storage accessible to windows from main process)

export const IStorageMainService = createDecorator<IStorageMainService>('storageMainService');

export interface IStorageMainService {

	readonly _serviceBrand: undefined;

	/**
	 * Provides access to the global storage shared across all
	 * windows and all profiles.
	 *
	 * Note: DO NOT use this for reading/writing from the main process!
	 *       Rather use `IGlobalStorageMainService` for that purpose.
	 */
	globalStorage: IStorageMain;

	/**
	 * Provides access to the profile storage shared across all windows
	 * for the provided profile.
	 *
	 * Note: DO NOT use this for reading/writing from the main process!
	 *       This is currently not supported.
	 */
	profileStorage(profile: IUserDataProfile): IStorageMain;

	/**
	 * Provides access to the workspace storage specific to a single window.
	 *
	 * Note: DO NOT use this for reading/writing from the main process!
	 *       This is currently not supported.
	 */
	workspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier): IStorageMain;
}

export class StorageMainService extends Disposable implements IStorageMainService {

	declare readonly _serviceBrand: undefined;

	private shutdownReason: ShutdownReason | undefined = undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataProfilesMainService private readonly userDataProfilesService: IUserDataProfilesMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		this.registerListeners();
	}

	protected getStorageOptions(): IStorageMainOptions {
		return {
			useInMemoryStorage: !!this.environmentService.extensionTestsLocationURI // no storage during extension tests!
		};
	}

	private registerListeners(): void {

		// Global Storage: Warmup when any window opens
		(async () => {
			await this.lifecycleMainService.when(LifecycleMainPhase.AfterWindowOpen);

			this.globalStorage.init();
		})();

		this._register(this.lifecycleMainService.onWillLoadWindow(e => {

			// Profile Storage: Warmup when related window with profile loads
			if (e.window.profile) {
				this.profileStorage(e.window.profile).init();
			}

			// Workspace Storage: Warmup when related window with workspace loads
			if (e.workspace) {
				this.workspaceStorage(e.workspace).init();
			}
		}));

		// All Storage: Close when shutting down
		this._register(this.lifecycleMainService.onWillShutdown(e => {
			this.logService.trace('storageMainService#onWillShutdown()');

			// Remember shutdown reason
			this.shutdownReason = e.reason;

			// Global Storage
			e.join(this.globalStorage.close());

			// Profile Storage(s)
			for (const [, profileStorage] of this.mapProfileToStorage) {
				e.join(profileStorage.close());
			}

			// Workspace Storage(s)
			for (const [, workspaceStorage] of this.mapWorkspaceToStorage) {
				e.join(workspaceStorage.close());
			}
		}));

		this._register(this.userDataProfilesService.willCreateProfile(e => {
			e.join((async () => {
				if (!(await this.fileService.exists(e.profile.globalStorageHome))) {
					await this.fileService.createFolder(e.profile.globalStorageHome);
				}
			})());
		}));

		// Close the storage of the profile that is being removed
		this._register(this.userDataProfilesService.willRemoveProfile(e => {
			const storage = this.mapProfileToStorage.get(e.profile.id);
			if (storage) {
				e.join(storage.close());
			}
		}));
	}

	//#region Global Storage

	readonly globalStorage = this.createGlobalStorage();

	private createGlobalStorage(): IStorageMain {
		this.logService.trace(`StorageMainService: creating global storage`);

		const globalStorage = new GlobalStorageMain(this.getStorageOptions(), this.userDataProfilesService, this.logService, this.fileService);

		once(globalStorage.onDidCloseStorage)(() => {
			this.logService.trace(`StorageMainService: closed global storage`);
		});

		return globalStorage;
	}

	//#endregion

	//#region Profile Storage

	private readonly mapProfileToStorage = new Map<string /* profile ID */, IStorageMain>();

	profileStorage(profile: IUserDataProfile): IStorageMain {
		if (profile.isDefault) {
			return this.globalStorage; // for default profile, use global storage
		}

		let profileStorage = this.mapProfileToStorage.get(profile.id);
		if (!profileStorage) {
			this.logService.trace(`StorageMainService: creating profile storage (${profile.name})`);

			profileStorage = this.createProfileStorage(profile);
			this.mapProfileToStorage.set(profile.id, profileStorage);

			once(profileStorage.onDidCloseStorage)(() => {
				this.logService.trace(`StorageMainService: closed profile storage (${profile.name})`);

				this.mapProfileToStorage.delete(profile.id);
			});
		}

		return profileStorage;
	}

	private createProfileStorage(profile: IUserDataProfile): IStorageMain {
		if (this.shutdownReason === ShutdownReason.KILL) {

			// Workaround for native crashes that we see when
			// SQLite DBs are being created even after shutdown
			// https://github.com/microsoft/vscode/issues/143186

			return new InMemoryStorageMain(this.logService, this.fileService);
		}

		return new ProfileStorageMain(profile, this.getStorageOptions(), this.logService, this.fileService);
	}

	//#endregion


	//#region Workspace Storage

	private readonly mapWorkspaceToStorage = new Map<string /* workspace ID */, IStorageMain>();

	workspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier): IStorageMain {
		let workspaceStorage = this.mapWorkspaceToStorage.get(workspace.id);
		if (!workspaceStorage) {
			this.logService.trace(`StorageMainService: creating workspace storage (${workspace.id})`);

			workspaceStorage = this.createWorkspaceStorage(workspace);
			this.mapWorkspaceToStorage.set(workspace.id, workspaceStorage);

			once(workspaceStorage.onDidCloseStorage)(() => {
				this.logService.trace(`StorageMainService: closed workspace storage (${workspace.id})`);

				this.mapWorkspaceToStorage.delete(workspace.id);
			});
		}

		return workspaceStorage;
	}

	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier): IStorageMain {
		if (this.shutdownReason === ShutdownReason.KILL) {

			// Workaround for native crashes that we see when
			// SQLite DBs are being created even after shutdown
			// https://github.com/microsoft/vscode/issues/143186

			return new InMemoryStorageMain(this.logService, this.fileService);
		}

		return new WorkspaceStorageMain(workspace, this.getStorageOptions(), this.logService, this.environmentService, this.fileService);
	}

	//#endregion
}

//#endregion


//#region Global Main Storage Service (intent: use global storage from main process)

export const IGlobalStorageMainService = createDecorator<IStorageMainService>('globalStorageMainService');

/**
 * A specialized `IStorageService` interface that only allows
 * access to the `StorageScope.GLOBAL` scope.
 */
export interface IGlobalStorageMainService extends IStorageService {

	/**
	 * Important: unlike other storage services in the renderer, the
	 * main process does not await the storage to be ready, rather
	 * storage is being initialized while a window opens to reduce
	 * pressure on startup.
	 *
	 * As such, any client wanting to access global storage from the
	 * main process needs to wait for `whenReady`, otherwise there is
	 * a chance that the service operates on an in-memory store that
	 * is not backed by any persistent DB.
	 */
	readonly whenReady: Promise<void>;

	get(key: string, scope: StorageScope.GLOBAL, fallbackValue: string): string;
	get(key: string, scope: StorageScope.GLOBAL, fallbackValue?: string): string | undefined;

	getBoolean(key: string, scope: StorageScope.GLOBAL, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope.GLOBAL, fallbackValue?: boolean): boolean | undefined;

	getNumber(key: string, scope: StorageScope.GLOBAL, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope.GLOBAL, fallbackValue?: number): number | undefined;

	store(key: string, value: string | boolean | number | undefined | null, scope: StorageScope.GLOBAL, target: StorageTarget): void;

	remove(key: string, scope: StorageScope.GLOBAL): void;

	keys(scope: StorageScope.GLOBAL, target: StorageTarget): string[];

	switch(): never;

	isNew(scope: StorageScope.GLOBAL): boolean;
}

export class GlobalStorageMainService extends AbstractStorageService implements IGlobalStorageMainService {

	declare readonly _serviceBrand: undefined;

	readonly whenReady = this.storageMainService.globalStorage.whenInit;

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IStorageMainService private readonly storageMainService: IStorageMainService
	) {
		super();
	}

	protected doInitialize(): Promise<void> {

		// global storage is being initialized as part
		// of the first window opening, so we do not trigger
		// it here but can join it
		return this.storageMainService.globalStorage.whenInit;
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		if (scope === StorageScope.GLOBAL) {
			return this.storageMainService.globalStorage.storage;
		}

		return undefined; // any other scope is unsupported from main process
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		if (scope === StorageScope.GLOBAL) {
			return this.userDataProfilesService.defaultProfile.globalStorageHome.fsPath;
		}

		return undefined; // any other scope is unsupported from main process
	}

	protected override shouldFlushWhenIdle(): boolean {
		return false; // not needed here, will be triggered from any window that is opened
	}

	override switch(): never {
		throw new Error('Migrating storage is unsupported from main process');
	}

	protected switchToProfile(): never {
		throw new Error('Switching storage profile is unsupported from main process');
	}

	protected switchToWorkspace(): never {
		throw new Error('Switching storage workspace is unsupported from main process');
	}
}
