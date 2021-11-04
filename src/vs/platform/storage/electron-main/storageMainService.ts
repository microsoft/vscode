/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { once } from 'vs/base/common/functional';
import { Disposable } from 'vs/base/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleMainService, LifecycleMainPhase } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ILogService } from 'vs/platform/log/common/log';
import { GlobalStorageMain, IStorageMain, IStorageMainOptions, WorkspaceStorageMain } from 'vs/platform/storage/electron-main/storageMain';
import { IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export const IStorageMainService = createDecorator<IStorageMainService>('storageMainService');

export interface IStorageMainService {

	readonly _serviceBrand: undefined;

	/**
	 * Provides access to the global storage shared across all windows.
	 */
	readonly globalStorage: IStorageMain;

	/**
	 * Provides access to the workspace storage specific to a single window.
	 */
	workspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier): IStorageMain;
}

export class StorageMainService extends Disposable implements IStorageMainService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService
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
		this._register(this.lifecycleMainService.onWillLoadWindow(async e => {
			if (e.workspace) {
				this.workspaceStorage(e.workspace).init();
			}
		}));

		// All Storage: Close when shutting down
		this._register(this.lifecycleMainService.onWillShutdown(e => {

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
		if (this.globalStorage) {
			return this.globalStorage; // only once
		}

		this.logService.trace(`StorageMainService: creating global storage`);

		const globalStorage = new GlobalStorageMain(this.getStorageOptions(), this.logService, this.environmentService);

		once(globalStorage.onDidCloseStorage)(() => {
			this.logService.trace(`StorageMainService: closed global storage`);
		});

		return globalStorage;
	}

	//#endregion


	//#region Workspace Storage

	private readonly mapWorkspaceToStorage = new Map<string, IStorageMain>();

	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IEmptyWorkspaceIdentifier): IStorageMain {
		const workspaceStorage = new WorkspaceStorageMain(workspace, this.getStorageOptions(), this.logService, this.environmentService);

		return workspaceStorage;
	}

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

	//#endregion
}
