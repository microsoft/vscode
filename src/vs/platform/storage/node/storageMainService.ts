/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { GlobalStorageMain, IStorageMain, WorkspaceStorageMain } from 'vs/platform/storage/node/storageMain';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

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

	readonly globalStorage = this.createGlobalStorage();

	private readonly mapWorkspaceToStorage = new Map<string, IStorageMain>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
	}

	private createGlobalStorage(): IStorageMain {
		const globalStorage = new GlobalStorageMain(this.logService, this.environmentService);

		return globalStorage;
	}

	private createWorkspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier): IStorageMain {
		const workspaceStorage = new WorkspaceStorageMain();
		// TODO@bpasero lifecycle like global storage? window events? crashes?

		return workspaceStorage;
	}

	workspaceStorage(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier): IStorageMain {
		let workspaceStorage = this.mapWorkspaceToStorage.get(workspace.id);
		if (!workspaceStorage) {
			workspaceStorage = this.createWorkspaceStorage(workspace);
			this.mapWorkspaceToStorage.set(workspace.id, workspaceStorage);
		}

		return workspaceStorage;
	}
}
