/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, MutableDisposable } from 'vs/base/common/lifecycle';
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

	// Global Storage is readonly and shared across windows
	private readonly globalStorage: IStorage;

	// Workspace Storage is scoped to a window but can change
	// in the current window, when entering a workspace!
	private workspaceStorage: IStorage | undefined = undefined;
	private workspaceStorageId: string | undefined = undefined;
	private workspaceStorageDisposables = this._register(new MutableDisposable());

	private initializePromise: Promise<void> | undefined;

	private readonly periodicFlushScheduler = this._register(new RunOnceScheduler(() => this.doFlushWhenIdle(), 60 * 1000 /* every minute */));
	private runWhenIdleDisposable: IDisposable | undefined = undefined;

	constructor(
		workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined,
		private readonly mainProcessService: IMainProcessService,
		private readonly environmentService: IEnvironmentService
	) {
		super();

		this.globalStorage = this.createGlobalStorage();
		this.workspaceStorage = this.createWorkspaceStorage(workspace);
	}

	private createGlobalStorage(): IStorage {
		const storageDataBaseClient = new StorageDatabaseChannelClient(this.mainProcessService.getChannel('storage'), undefined);

		const globalStorage = new Storage(storageDataBaseClient.globalStorage);

		this._register(globalStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.GLOBAL, key)));

		return globalStorage;
	}

	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier): IStorage;
	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): IStorage | undefined;
	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier | undefined): IStorage | undefined {

		// Keep id around for logging
		this.workspaceStorageId = workspace?.id;

		// Create new
		const storageDataBaseClient = new StorageDatabaseChannelClient(this.mainProcessService.getChannel('storage'), workspace);
		if (storageDataBaseClient.workspaceStorage) {
			const workspaceStorage = new Storage(storageDataBaseClient.workspaceStorage);

			this.workspaceStorageDisposables.value = workspaceStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.WORKSPACE, key));

			return workspaceStorage;
		}

		return undefined;
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
		return scope === StorageScope.GLOBAL ? this.environmentService.globalStorageHome.fsPath : this.workspaceStorageId ? `${joinPath(this.environmentService.workspaceStorageHome, this.workspaceStorageId, 'state.vscdb').fsPath} [!!! Experimental Main Storage !!!]` : undefined;
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
