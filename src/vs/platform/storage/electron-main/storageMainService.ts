/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { once } from 'vs/base/common/functional';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { GlobalStorageMain, IStorageMain, WorkspaceStorageMain } from 'vs/platform/storage/electron-main/storageMain';
import { ISingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

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
	workspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier): IStorageMain;
}

export class StorageMainService implements IStorageMainService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
	}

	//#region Global Storage

	readonly globalStorage = this.createGlobalStorage();

	private createGlobalStorage(): IStorageMain {
		if (this.globalStorage) {
			return this.globalStorage; // only once
		}

		const globalStorage = new GlobalStorageMain(this.logService, this.environmentService);

		// Trigger init of global storage directly from here
		// so that we can be ready for access when the window
		// needs it (prevents waterfall of initialization)
		globalStorage.initialize();

		return globalStorage;
	}

	//#endregion


	//#region Workspace Storage

	private readonly mapWorkspaceToStorage = new Map<string, IStorageMain>();

	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier): IStorageMain {
		const workspaceStorage = new WorkspaceStorageMain(workspace);

		return workspaceStorage;
	}

	workspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier): IStorageMain {
		let workspaceStorage = this.mapWorkspaceToStorage.get(workspace.id);
		if (!workspaceStorage) {
			this.logService.trace(`StorageMainService: creating workspace storage (${isWorkspaceIdentifier(workspace) ? workspace.configPath : workspace.uri})`);

			workspaceStorage = this.createWorkspaceStorage(workspace);
			this.mapWorkspaceToStorage.set(workspace.id, workspaceStorage);

			once(workspaceStorage.onDidCloseStorage)(() => {
				this.logService.trace(`StorageMainService: closed workspace storage (${isWorkspaceIdentifier(workspace) ? workspace.configPath : workspace.uri})`);

				this.mapWorkspaceToStorage.delete(workspace.id);
			});
		}

		return workspaceStorage;
	}

	//#endregion
}
