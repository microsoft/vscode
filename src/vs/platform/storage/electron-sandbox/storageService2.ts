/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { StorageScope, WillSaveStateReason, AbstractStorageService } from 'vs/platform/storage/common/storage';
import { Storage, IStorage } from 'vs/base/parts/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier, IWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { Promises, RunOnceScheduler, runWhenIdle } from 'vs/base/common/async';
import { mark } from 'vs/base/common/performance';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { StorageDatabaseChannelClient } from 'vs/platform/storage/common/storageIpc';
import { joinPath } from 'vs/base/common/resources';

export class NativeStorageService2 extends AbstractStorageService {

	private readonly globalStorage: IStorage;
	private readonly workspaceStorage: IStorage | undefined;

	private initializePromise: Promise<void> | undefined;

	private readonly periodicFlushScheduler = this._register(new RunOnceScheduler(() => this.doFlushWhenIdle(), 60 * 1000 /* every minute */));
	private runWhenIdleDisposable: IDisposable | undefined = undefined;

	constructor(
		private workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined,
		mainProcessService: IMainProcessService,
		private readonly environmentService: IEnvironmentService
	) {
		super();

		// Connect to storage via channel client
		const storageDataBaseClient = new StorageDatabaseChannelClient(mainProcessService.getChannel('storage'), workspace);
		this.globalStorage = new Storage(storageDataBaseClient.globalStorage);
		this.workspaceStorage = storageDataBaseClient.workspaceStorage ? new Storage(storageDataBaseClient.workspaceStorage) : undefined;

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.globalStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.GLOBAL, key)));
		this._register(this.workspaceStorage?.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.WORKSPACE, key)) ?? Disposable.None);
	}

	initialize(): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = this.doInitialize();
		}

		return this.initializePromise;
	}

	private async doInitialize(): Promise<void> {

		// Init all storage locations
		mark('code/willInitStorage');
		try {
			await Promises.settled([
				this.globalStorage.init(),
				this.workspaceStorage?.init() ?? Promise.resolve()
			]);
		} finally {
			mark('code/didInitStorage');
		}

		// On some OS we do not get enough time to persist state on shutdown (e.g. when
		// Windows restarts after applying updates). In other cases, VSCode might crash,
		// so we periodically save state to reduce the chance of loosing any state.
		this.periodicFlushScheduler.schedule();
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		return scope === StorageScope.GLOBAL ? this.environmentService.globalStorageHome.fsPath : this.workspace ? `${joinPath(this.environmentService.workspaceStorageHome, this.workspace.id, 'state.vscdb').fsPath} [!!! Experimental Main Storage !!!]` : undefined;
	}

	private doFlushWhenIdle(): void {

		// Dispose any previous idle runner
		dispose(this.runWhenIdleDisposable);

		// Run when idle
		this.runWhenIdleDisposable = runWhenIdle(() => {

			// send event to collect state
			this.flush();

			// repeat
			this.periodicFlushScheduler.schedule();
		});
	}

	async close(): Promise<void> {

		// Stop periodic scheduler and idle runner as we now collect state normally
		this.periodicFlushScheduler.dispose();
		dispose(this.runWhenIdleDisposable);
		this.runWhenIdleDisposable = undefined;

		// Signal as event so that clients can still store data
		this.emitWillSaveState(WillSaveStateReason.SHUTDOWN);

		// Do it
		await Promises.settled([
			this.globalStorage.close(),
			this.workspaceStorage?.close() ?? Promise.resolve()
		]);
	}

	async migrate(toWorkspace: IWorkspaceInitializationPayload): Promise<void> {
		// if (this.workspaceStoragePath === SQLiteStorageDatabase.IN_MEMORY_PATH) {
		// 	return; // no migration needed if running in memory
		// }

		// // Close workspace DB to be able to copy
		// await this.getStorage(StorageScope.WORKSPACE).close();

		// // Prepare new workspace storage folder
		// const result = await this.prepareWorkspaceStorageFolder(toWorkspace);

		// const newWorkspaceStoragePath = join(result.path, NativeStorageService.WORKSPACE_STORAGE_NAME);

		// // Copy current storage over to new workspace storage
		// await copy(assertIsDefined(this.workspaceStoragePath), newWorkspaceStoragePath, { preserveSymlinks: false });

		// // Recreate and init workspace storage
		// return this.createWorkspaceStorage(newWorkspaceStoragePath).init();
	}
}
