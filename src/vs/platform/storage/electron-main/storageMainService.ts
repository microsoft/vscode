/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { join } from '../../../base/common/path.js';
import { IStorage } from '../../../base/parts/storage/common/storage.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILifecycleMainService, LifecycleMainPhase, ShutdownReason } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractStorageService, isProfileUsingDefaultStorage, IStorageService, StorageScope, StorageTarget } from '../common/storage.js';
import { ApplicationStorageMain, ApplicationSharedStorageMain, ProfileStorageMain, InMemoryStorageMain, IStorageMain, IStorageMainOptions, WorkspaceStorageMain, IStorageChangeEvent, HostApplicationStorageMain } from './storageMain.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataProfilesMainService } from '../../userDataProfile/electron-main/userDataProfile.js';
import { IAnyWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { Schemas } from '../../../base/common/network.js';
import { ICrossAppIPCService } from '../../crossAppIpc/electron-main/crossAppIpcService.js';

//#region Storage Main Service (intent: make application, profile and workspace storage accessible to windows from main process)

export const IStorageMainService = createDecorator<IStorageMainService>('storageMainService');

export interface IProfileStorageChangeEvent extends IStorageChangeEvent {
	readonly storage: IStorageMain;
	readonly profile: IUserDataProfile;
}

export interface IStorageMainService {

	readonly _serviceBrand: undefined;

	/**
	 * Provides access to the application storage shared across all
	 * windows and all profiles.
	 *
	 * Note: DO NOT use this for reading/writing from the main process!
	 *       Rather use `IApplicationStorageMainService` for that purpose.
	 */
	readonly applicationStorage: IStorageMain;

	/**
	 * Provides access to the application shared storage that is shared
	 * across VS Code and Agents app.
	 */
	readonly applicationSharedStorage: IStorageMain;

	/**
	 * Emitted whenever data is updated or deleted in profile scoped storage.
	 */
	readonly onDidChangeProfileStorage: Event<IProfileStorageChangeEvent>;

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
	workspaceStorage(workspace: IAnyWorkspaceIdentifier): IStorageMain;

	/**
	 * Checks if the provided path is currently in use for a storage database.
	 *
	 * @param path the path to the storage file or parent folder
	 */
	isUsed(path: string): boolean;
}

export class StorageMainService extends Disposable implements IStorageMainService {

	declare readonly _serviceBrand: undefined;

	private shutdownReason: ShutdownReason | undefined = undefined;

	private readonly _onDidChangeProfileStorage = this._register(new Emitter<IProfileStorageChangeEvent>());
	readonly onDidChangeProfileStorage = this._onDidChangeProfileStorage.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@IUserDataProfilesMainService private readonly userDataProfilesService: IUserDataProfilesMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ICrossAppIPCService private readonly crossAppIPCService: ICrossAppIPCService,
	) {
		super();

		this.applicationStorage = this._register(this.createApplicationStorage());
		this.applicationSharedStorage = this._register(this.createApplicationSharedStorage());

		this.registerListeners();
	}

	protected getStorageOptions(): IStorageMainOptions {
		return {
			useInMemoryStorage: !!this.environmentService.extensionTestsLocationURI // no storage during extension tests!
		};
	}

	private registerListeners(): void {

		// Application Storage: Warmup when any window opens
		(async () => {
			await this.lifecycleMainService.when(LifecycleMainPhase.AfterWindowOpen);

			this.applicationStorage.init();
			this.applicationSharedStorage.init();
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

			// Application Storage
			e.join('applicationStorage', this.applicationStorage.close());

			// Application Shared Storage
			e.join('applicationSharedStorage', this.applicationSharedStorage.close());

			// Profile Storage(s)
			for (const [, profileStorage] of this.mapProfileToStorage) {
				e.join('profileStorage', profileStorage.close());
			}

			// Workspace Storage(s)
			for (const [, workspaceStorage] of this.mapWorkspaceToStorage) {
				e.join('workspaceStorage', workspaceStorage.close());
			}
		}));

		// Prepare storage location as needed
		this._register(this.userDataProfilesService.onWillCreateProfile(e => {
			e.join((async () => {
				if (!(await this.fileService.exists(e.profile.globalStorageHome))) {
					await this.fileService.createFolder(e.profile.globalStorageHome);
				}
			})());
		}));

		// Close the storage of the profile that is being removed
		this._register(this.userDataProfilesService.onWillRemoveProfile(e => {
			const storage = this.mapProfileToStorage.get(e.profile.id);
			if (storage) {
				e.join(storage.close());
			}
		}));
	}

	//#region Application Storage

	readonly applicationStorage: IStorageMain;

	private createApplicationStorage(): IStorageMain {
		this.logService.trace(`StorageMainService: creating application storage`);

		const applicationStorage = new ApplicationStorageMain(this.getStorageOptions(), this.userDataProfilesService, this.logService, this.fileService);

		this._register(Event.once(applicationStorage.onDidCloseStorage)(() => {
			this.logService.trace(`StorageMainService: closed application storage`);
		}));

		return applicationStorage;
	}

	//#endregion

	//#region Application Shared Storage

	readonly applicationSharedStorage: IStorageMain;

	private createApplicationSharedStorage(): IStorageMain {
		this.logService.info(`StorageMainService: creating application shared storage`);

		const sharedStorageFolderPath = join(this.environmentService.appSharedDataHome.with({ scheme: Schemas.file }).fsPath, 'sharedStorage');

		// Determine the fallback storage for transparent migration of keys
		// from APPLICATION to APPLICATION_SHARED scope:
		// In VS Code: reuse the own application storage (keys are local)
		let fallbackStorage: IStorageMain = this.applicationStorage;
		const hostUserRoamingDataHome = this.environmentService.hostUserRoamingDataHome;
		if (hostUserRoamingDataHome) {
			// - In the Agents App: create a storage backed by the host (VS Code)
			//   app's application DB so keys are found even if VS Code hasn't
			//   migrated them to the shared DB yet.
			//   We use ProfileStorageMain (not ApplicationStorageMain) to avoid
			//   writing telemetry state into the host app's DB — this is read-only.
			const hostApplicationStoragePath = join(hostUserRoamingDataHome.with({ scheme: Schemas.file }).fsPath, 'globalStorage', 'state.vscdb');
			this.logService.info(`StorageMainService: creating application shared storage with host app fallback at '${hostApplicationStoragePath}'`);
			fallbackStorage = this._register(new HostApplicationStorageMain(
				hostApplicationStoragePath,
				this.logService,
				this.fileService
			));
		} else {
			this.logService.info(`StorageMainService: creating application shared storage with local application storage fallback`);
		}

		const applicationSharedStorage = new ApplicationSharedStorageMain(this.getStorageOptions(), sharedStorageFolderPath, fallbackStorage, this.logService, this.fileService, this.crossAppIPCService);

		this._register(Event.once(applicationSharedStorage.onDidCloseStorage)(() => {
			this.logService.trace(`StorageMainService: closed application shared storage`);
		}));

		return applicationSharedStorage;
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
			this.logService.trace(`StorageMainService: creating profile storage (${profile.name})`);

			profileStorage = this._register(this.createProfileStorage(profile));
			this.mapProfileToStorage.set(profile.id, profileStorage);

			// Don't use this._register() for listeners that are disposed early
			// as it causes entries to accumulate in _store when storage is closed/reopened
			const listener = profileStorage.onDidChangeStorage(e => this._onDidChangeProfileStorage.fire({
				...e,
				storage: profileStorage!,
				profile
			}));

			Event.once(profileStorage.onDidCloseStorage)(() => {
				this.logService.trace(`StorageMainService: closed profile storage (${profile.name})`);

				this.mapProfileToStorage.delete(profile.id);
				listener.dispose();
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

	workspaceStorage(workspace: IAnyWorkspaceIdentifier): IStorageMain {
		let workspaceStorage = this.mapWorkspaceToStorage.get(workspace.id);
		if (!workspaceStorage) {
			this.logService.trace(`StorageMainService: creating workspace storage (${workspace.id})`);

			workspaceStorage = this._register(this.createWorkspaceStorage(workspace));
			this.mapWorkspaceToStorage.set(workspace.id, workspaceStorage);

			// Don't use this._register() for Event.once as it auto-disposes
			Event.once(workspaceStorage.onDidCloseStorage)(() => {
				this.logService.trace(`StorageMainService: closed workspace storage (${workspace.id})`);

				this.mapWorkspaceToStorage.delete(workspace.id);
			});
		}

		return workspaceStorage;
	}

	private createWorkspaceStorage(workspace: IAnyWorkspaceIdentifier): IStorageMain {
		if (this.shutdownReason === ShutdownReason.KILL) {

			// Workaround for native crashes that we see when
			// SQLite DBs are being created even after shutdown
			// https://github.com/microsoft/vscode/issues/143186

			return new InMemoryStorageMain(this.logService, this.fileService);
		}

		return new WorkspaceStorageMain(workspace, this.getStorageOptions(), this.logService, this.environmentService, this.fileService);
	}

	//#endregion

	isUsed(path: string): boolean {
		const pathUri = URI.file(path);

		for (const storage of [this.applicationStorage, this.applicationSharedStorage, ...this.mapProfileToStorage.values(), ...this.mapWorkspaceToStorage.values()]) {
			if (!storage.path) {
				continue;
			}

			if (this.uriIdentityService.extUri.isEqualOrParent(URI.file(storage.path), pathUri)) {
				return true;
			}
		}

		return false;
	}
}

//#endregion


//#region Application Main Storage Service (intent: use application storage from main process)

export const IApplicationStorageMainService = createDecorator<IStorageMainService>('applicationStorageMainService');

/**
 * A specialized `IStorageService` interface that only allows
 * access to the `StorageScope.APPLICATION` scope.
 */
type ApplicationStorageScope = StorageScope.APPLICATION | StorageScope.APPLICATION_SHARED;

export interface IApplicationStorageMainService extends IStorageService {

	/**
	 * Important: unlike other storage services in the renderer, the
	 * main process does not await the storage to be ready, rather
	 * storage is being initialized while a window opens to reduce
	 * pressure on startup.
	 *
	 * As such, any client wanting to access application storage from the
	 * main process needs to wait for `whenReady`, otherwise there is
	 * a chance that the service operates on an in-memory store that
	 * is not backed by any persistent DB.
	 */
	readonly whenReady: Promise<void>;

	get(key: string, scope: ApplicationStorageScope, fallbackValue: string): string;
	get(key: string, scope: ApplicationStorageScope, fallbackValue?: string): string | undefined;

	getBoolean(key: string, scope: ApplicationStorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: ApplicationStorageScope, fallbackValue?: boolean): boolean | undefined;

	getNumber(key: string, scope: ApplicationStorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: ApplicationStorageScope, fallbackValue?: number): number | undefined;

	store(key: string, value: string | boolean | number | undefined | null, scope: ApplicationStorageScope, target: StorageTarget): void;

	remove(key: string, scope: ApplicationStorageScope): void;

	keys(scope: ApplicationStorageScope, target: StorageTarget): string[];

	switch(): never;

	isNew(scope: ApplicationStorageScope): boolean;
}

export class ApplicationStorageMainService extends AbstractStorageService implements IApplicationStorageMainService {

	declare readonly _serviceBrand: undefined;

	readonly whenReady: Promise<void>;

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IStorageMainService private readonly storageMainService: IStorageMainService
	) {
		super();

		this.whenReady = Promise.all([
			this.storageMainService.applicationStorage.whenInit,
			this.storageMainService.applicationSharedStorage.whenInit
		]).then(() => undefined);
	}

	protected doInitialize(): Promise<void> {

		// application storage is being initialized as part
		// of the first window opening, so we do not trigger
		// it here but can join it
		return Promise.all([
			this.storageMainService.applicationStorage.whenInit,
			this.storageMainService.applicationSharedStorage.whenInit
		]).then(() => undefined);
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		if (scope === StorageScope.APPLICATION) {
			return this.storageMainService.applicationStorage.storage;
		}

		if (scope === StorageScope.APPLICATION_SHARED) {
			return this.storageMainService.applicationSharedStorage.storage;
		}

		return undefined; // any other scope is unsupported from main process
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		if (scope === StorageScope.APPLICATION) {
			return this.userDataProfilesService.defaultProfile.globalStorageHome.with({ scheme: Schemas.file }).fsPath;
		}

		if (scope === StorageScope.APPLICATION_SHARED) {
			return this.storageMainService.applicationSharedStorage.path;
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

	hasScope(): never {
		throw new Error('Main process is never profile or workspace scoped');
	}
}
