/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { once } from 'vs/base/common/functional';
import { Disposable } from 'vs/base/common/lifecycle';
import { IStorage } from 'vs/base/parts/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleMainService, LifecycleMainPhase, ShutdownReason } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractStorageService, IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { GlobalStorageMain, InMemoryStorageMain, IStorageMain, IStorageMainOptions, WorkspaceStorageMain } from 'vs/platform/storage/electron-main/storageMain';
import { IAnyWorkspaceIdentifier, IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

//#region Storage Main Service (intent: make global and workspace storage accessible to windows from main process)

export const IStorageMainService = createDecorator<IStorageMainService>('storageMainService');

export interface IStorageMainService {

	readonly _serviceBrand: undefined;

	/**
	 * Provides access to the global storage shared across all windows.
	 *
	 * Note: DO NOT use this for reading/writing from the main process!
	 *       Rather use `IGlobalStorageMainService` for that purpose.
	 */
	readonly globalStorage: IStorageMain;

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

		// Workspace Storage: Warmup when related window with workspace loads
		this._register(this.lifecycleMainService.onWillLoadWindow(e => {
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

			// Workspace Storage(s)
			for (const [, storage] of this.mapWorkspaceToStorage) {
				e.join(storage.close());
			}
		}));
	}

	//#region Global Storage

	readonly globalStorage = this.createGlobalStorage();

	private createGlobalStorage(): IStorageMain {
		this.logService.trace(`StorageMainService: creating global storage`);

		const globalStorage = new GlobalStorageMain(this.getStorageOptions(), this.logService, this.environmentService, this.fileService);

		once(globalStorage.onDidCloseStorage)(() => {
			this.logService.trace(`StorageMainService: closed global storage`);
		});

		return globalStorage;
	}

	//#endregion


	//#region Workspace Storage

	private readonly mapWorkspaceToStorage = new Map<string, IStorageMain>();

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

	migrate(toWorkspace: IAnyWorkspaceIdentifier): never;

	isNew(scope: StorageScope.GLOBAL): boolean;
}

export class GlobalStorageMainService extends AbstractStorageService implements IGlobalStorageMainService {

	declare readonly _serviceBrand: undefined;

	readonly whenReady = this.storageMainService.globalStorage.whenInit;

	constructor(
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@IStorageMainService private readonly storageMainService: IStorageMainService
	) {
		super();
	}

	protected doInitialize(): Promise<void> {

		// global storage is being initialized as part
		// of the first window opening, so we do not
		// trigger it here but can join it
		return this.storageMainService.globalStorage.whenInit;
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		switch (scope) {
			case StorageScope.GLOBAL:
				return this.storageMainService.globalStorage.storage;
			case StorageScope.WORKSPACE:
				return undefined; // unsupported from main process
		}
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		return scope === StorageScope.GLOBAL ? this.environmentMainService.globalStorageHome.fsPath : undefined;
	}

	protected override shouldFlushWhenIdle(): boolean {
		return false; // not needed here, will be triggered from any window that is opened
	}

	migrate(): never {
		throw new Error('Migrating storage is unsupported from main process');
	}
}
