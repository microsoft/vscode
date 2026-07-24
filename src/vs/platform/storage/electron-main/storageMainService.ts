/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { join } from '../../../base/common/path.js';
import { IStorage } from '../../../base/parts/storage/common/storage.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILifecycleMainService, LifecycleMainPhase, ShutdownReason } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractStorageService, isProfileUsingDefaultStorage, IStorageService, StorageScope, StorageTarget } from '../common/storage.js';
import { ApplicationStorageMain, ApplicationSharedStorageMain, ProfileStorageMain, InMemoryStorageMain, IStorageMain, IStorageMainOptions, WorkspaceStorageMain, IStorageChangeEvent } from './storageMain.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataProfilesMainService } from '../../userDataProfile/electron-main/userDataProfile.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IAnyWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { Schemas } from '../../../base/common/network.js';

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
	profileStorage(profile: IUserDataProfile, ownerWindowId?: number): IStorageMain;

	/**
	 * Provides access to the workspace storage specific to a single window.
	 *
	 * Note: DO NOT use this for reading/writing from the main process!
	 *       This is currently not supported.
	 */
	workspaceStorage(workspace: IAnyWorkspaceIdentifier, ownerWindowId?: number): IStorageMain;

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
	private readonly profileStorageMap: StorageMap;
	private readonly workspaceStorageMap: StorageMap;
	private readonly mapWindowIdToStorageReleaseListener = new Map<number /* window ID */, IDisposable>();

	private readonly _onDidChangeProfileStorage = this._register(new Emitter<IProfileStorageChangeEvent>());
	readonly onDidChangeProfileStorage = this._onDidChangeProfileStorage.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@IUserDataProfilesMainService private readonly userDataProfilesService: IUserDataProfilesMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();

		this.profileStorageMap = this._register(new StorageMap());
		this.workspaceStorageMap = this._register(new StorageMap());

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
			this.registerWindowStorageWarmup(e.window);
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
			for (const profileStorageClosePromise of this.profileStorageMap.closeAll()) {
				e.join('profileStorage', profileStorageClosePromise);
			}

			// Workspace Storage(s)
			for (const workspaceStorageClosePromise of this.workspaceStorageMap.closeAll()) {
				e.join('workspaceStorage', workspaceStorageClosePromise);
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
			const storageClosePromise = this.profileStorageMap.close(e.profile.id);
			if (storageClosePromise) {
				e.join(storageClosePromise);
			}
		}));
	}

	private registerWindowStorageWarmup(window: ICodeWindow): void {
		if (this.mapWindowIdToStorageReleaseListener.has(window.id)) {
			return;
		}

		const listener = Event.once(Event.any(window.onDidClose, window.onDidDestroy))(() => {
			this.mapWindowIdToStorageReleaseListener.delete(window.id);
			listener.dispose();

			void Promise.all([
				this.profileStorageMap.releaseWindowStorage(window.id),
				this.workspaceStorageMap.releaseWindowStorage(window.id)
			]).catch(error => this.logService.error(error));
		});
		this.mapWindowIdToStorageReleaseListener.set(window.id, listener);
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

		// Use the local application storage as fallback for transparent migration
		// of keys from APPLICATION to APPLICATION_SHARED scope. The agents window is
		// now part of the same VS Code app, so there is no separate "host" app DB to
		// fall back to.
		const applicationSharedStorage = new ApplicationSharedStorageMain(this.getStorageOptions(), sharedStorageFolderPath, this.applicationStorage, this.logService, this.fileService);

		this._register(Event.once(applicationSharedStorage.onDidCloseStorage)(() => {
			this.logService.trace(`StorageMainService: closed application shared storage`);
		}));

		return applicationSharedStorage;
	}

	//#endregion

	//#region Profile Storage

	profileStorage(profile: IUserDataProfile, ownerWindowId?: number): IStorageMain {
		if (isProfileUsingDefaultStorage(profile)) {
			return this.applicationStorage; // for profiles using default storage, use application storage
		}

		return this.profileStorageMap.getOrCreate(profile.id, ownerWindowId, () => {
			this.logService.trace(`StorageMainService: creating profile storage (${profile.name})`);

			const profileStorage = this.createProfileStorage(profile);

			// Don't use this._register() for listeners that are disposed early
			// as it causes entries to accumulate in _store when storage is closed/reopened
			const listener = profileStorage.onDidChangeStorage(e => this._onDidChangeProfileStorage.fire({
				...e,
				storage: profileStorage,
				profile
			}));

			return {
				storage: profileStorage,
				onDidClose: () => {
					this.logService.trace(`StorageMainService: closed profile storage (${profile.name})`);

					listener.dispose();
				}
			};
		});
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

	workspaceStorage(workspace: IAnyWorkspaceIdentifier, ownerWindowId?: number): IStorageMain {
		return this.workspaceStorageMap.getOrCreate(workspace.id, ownerWindowId, () => {
			this.logService.trace(`StorageMainService: creating workspace storage (${workspace.id})`);

			const storage = this.createWorkspaceStorage(workspace);

			return {
				storage,
				onDidClose: () => this.logService.trace(`StorageMainService: closed workspace storage (${workspace.id})`)
			};
		});
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

		const storages = [
			this.applicationStorage,
			this.applicationSharedStorage,
			...this.profileStorageMap.storages,
			...this.workspaceStorageMap.storages
		];

		for (const storage of storages) {
			if (!storage.path) {
				continue;
			}

			if (this.uriIdentityService.extUri.isEqualOrParent(URI.file(storage.path), pathUri)) {
				return true;
			}
		}

		return false;
	}

	override dispose(): void {
		for (const listener of this.mapWindowIdToStorageReleaseListener.values()) {
			listener.dispose();
		}
		this.mapWindowIdToStorageReleaseListener.clear();

		super.dispose();
	}

}

//#endregion

class StorageMap extends Disposable {

	private readonly mapStorage = new Map<string /* storage ID */, RefCountedStorage>();
	private readonly mapWindowIdToStorageIds = new Map<number /* window ID */, Set<string /* storage ID */>>();

	get storages(): IStorageMain[] {
		return Array.from(this.mapStorage.values(), storage => storage.storage);
	}

	getOrCreate(storageId: string, ownerWindowId: number | undefined, create: () => { storage: IStorageMain; onDidClose: () => void }): IStorageMain {
		let storage = this.mapStorage.get(storageId);
		if (storage?.isClosing) {
			this.mapStorage.delete(storageId);
			this.clearStorageReferences(storageId);
			storage = undefined;
		}

		if (!storage) {
			const result = create();
			const refCountedStorage = new RefCountedStorage(result.storage, result.onDidClose, () => {
				if (this.mapStorage.get(storageId) === refCountedStorage) {
					this.mapStorage.delete(storageId);
					this.clearStorageReferences(storageId);
				}
			});
			storage = refCountedStorage;
			this.mapStorage.set(storageId, storage);
		}

		this.addWindowReference(storageId, storage, ownerWindowId);

		return storage.storage;
	}

	close(storageId: string): Promise<void> | undefined {
		return this.closeStorage(storageId);
	}

	closeAll(): Promise<void>[] {
		this.clearWindowReferences();

		return Array.from(this.mapStorage.keys()).map(storageId => this.closeStorage(storageId)!);
	}

	private addWindowReference(storageId: string, storage: RefCountedStorage, ownerWindowId: number | undefined): void {
		if (typeof ownerWindowId !== 'number') {
			return;
		}

		let storageIds = this.mapWindowIdToStorageIds.get(ownerWindowId);
		if (!storageIds) {
			storageIds = new Set();
			this.mapWindowIdToStorageIds.set(ownerWindowId, storageIds);
		}

		storageIds.add(storageId);
		storage.increment(ownerWindowId);
	}

	async releaseWindowStorage(ownerWindowId: number): Promise<void> {
		const storageIds = this.mapWindowIdToStorageIds.get(ownerWindowId);
		this.mapWindowIdToStorageIds.delete(ownerWindowId);
		if (!storageIds) {
			return;
		}

		for (const storageId of storageIds) {
			if (this.mapStorage.get(storageId)?.decrement(ownerWindowId)) {
				await this.closeStorage(storageId);
			}
		}
	}

	private closeStorage(storageId: string): Promise<void> | undefined {
		const storage = this.mapStorage.get(storageId);
		if (!storage) {
			return undefined;
		}

		this.mapStorage.delete(storageId);
		this.clearStorageReferences(storageId);

		return storage.close();
	}

	private clearWindowReferences(): void {
		this.mapWindowIdToStorageIds.clear();
	}

	private clearStorageReferences(storageId: string): void {
		for (const [ownerWindowId, storageIds] of this.mapWindowIdToStorageIds) {
			storageIds.delete(storageId);
			if (storageIds.size === 0) {
				this.mapWindowIdToStorageIds.delete(ownerWindowId);
			}
		}
	}

	override dispose(): void {
		this.clearWindowReferences();
		for (const storage of this.mapStorage.values()) {
			storage.dispose();
		}
		this.mapStorage.clear();

		super.dispose();
	}
}

class RefCountedStorage extends Disposable {

	private readonly ownerWindowIds = new Set<number>();
	private readonly closeListener: IDisposable;
	private readonly doClose: () => Promise<void>;
	private closePromise: Promise<void> | undefined;
	private didClose = false;
	private didCleanup = false;

	get isClosing(): boolean {
		return !!this.closePromise;
	}

	constructor(
		readonly storage: IStorageMain,
		private readonly onDidClose: () => void,
		private readonly onDidCloseStorage: () => void
	) {
		super();

		this.doClose = storage.close.bind(storage);
		storage.close = () => this.close();

		this.closeListener = Event.once(storage.onDidCloseStorage)(() => this.handleDidClose());
	}

	increment(ownerWindowId: number): void {
		this.ownerWindowIds.add(ownerWindowId);
	}

	decrement(ownerWindowId: number): boolean {
		if (!this.ownerWindowIds.delete(ownerWindowId)) {
			return false;
		}

		return this.ownerWindowIds.size === 0;
	}

	async close(): Promise<void> {
		if (!this.closePromise) {
			this.ownerWindowIds.clear();
			this.closePromise = this.doClose();
		}

		await this.closePromise;
	}

	private handleDidClose(): void {
		if (this.didClose) {
			return;
		}

		this.didClose = true;
		this.onDidCloseStorage();
		queueMicrotask(() => this.dispose());
	}

	override dispose(): void {
		this.ownerWindowIds.clear();
		this.closeListener.dispose();
		this.cleanup();
		this.storage.close = this.doClose;
		this.storage.dispose();

		super.dispose();
	}

	private cleanup(): void {
		if (this.didCleanup) {
			return;
		}

		this.didCleanup = true;
		this.onDidClose();
	}
}


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
