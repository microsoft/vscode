/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspacesService, IWorkspaceFolderCreationData, IEnterWorkspaceResult, IRecentlyOpened, restoreRecentlyOpened, IRecent, isRecentFile, isRecentFolder, toStoreData, IStoredWorkspaceFolder, getStoredWorkspaceFolder, IStoredWorkspace, isRecentWorkspace } from '../../../../platform/workspaces/common/workspaces.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { isTemporaryWorkspace, IWorkspaceContextService, IWorkspaceFoldersChangeEvent, IWorkspaceIdentifier, WorkbenchState, WORKSPACE_EXTENSION } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getWorkspaceIdentifier } from './workspaces.js';
import { IFileService, FileOperationError, FileOperationResult } from '../../../../platform/files/common/files.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { joinPath } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceBackupInfo, IFolderBackupInfo } from '../../../../platform/backup/common/backup.js';
import { Schemas } from '../../../../base/common/network.js';

export class BrowserWorkspacesService extends Disposable implements IWorkspacesService {

	static readonly RECENTLY_OPENED_KEY = 'recently.opened';

	declare readonly _serviceBrand: undefined;

	private readonly _onRecentlyOpenedChange = this._register(new Emitter<void>());
	readonly onDidChangeRecentlyOpened = this._onRecentlyOpenedChange.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();

		// Opening a workspace should push it as most
		// recently used to the workspaces history
		this.addWorkspaceToRecentlyOpened();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Storage
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, BrowserWorkspacesService.RECENTLY_OPENED_KEY, this._store)(() => this._onRecentlyOpenedChange.fire()));

		// Workspace
		this._register(this.contextService.onDidChangeWorkspaceFolders(e => this.onDidChangeWorkspaceFolders(e)));
	}

	private onDidChangeWorkspaceFolders(e: IWorkspaceFoldersChangeEvent): void {
		if (!isTemporaryWorkspace(this.contextService.getWorkspace())) {
			return;
		}

		// When in a temporary workspace, make sure to track folder changes
		// in the history so that these can later be restored.

		for (const folder of e.added) {
			this.addRecentlyOpened([{ folderUri: folder.uri }]);
		}
	}

	private addWorkspaceToRecentlyOpened(): void {
		const workspace = this.contextService.getWorkspace();
		const remoteAuthority = this.environmentService.remoteAuthority;
		switch (this.contextService.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				this.addRecentlyOpened([{ folderUri: workspace.folders[0].uri, remoteAuthority }]);
				break;
			case WorkbenchState.WORKSPACE:
				this.addRecentlyOpened([{ workspace: { id: workspace.id, configPath: workspace.configuration! }, remoteAuthority }]);
				break;
		}
	}

	//#region Workspaces History

	async getRecentlyOpened(): Promise<IRecentlyOpened> {
		const recentlyOpenedRaw = this.storageService.get(BrowserWorkspacesService.RECENTLY_OPENED_KEY, StorageScope.APPLICATION);
		if (recentlyOpenedRaw) {
			const recentlyOpened = restoreRecentlyOpened(JSON.parse(recentlyOpenedRaw), this.logService);
			recentlyOpened.workspaces = recentlyOpened.workspaces.filter(recent => {

				// In web, unless we are in a temporary workspace, we cannot support
				// to switch to local folders because this would require a window
				// reload and local file access only works with explicit user gesture
				// from the current session.
				if (isRecentFolder(recent) && recent.folderUri.scheme === Schemas.file && !isTemporaryWorkspace(this.contextService.getWorkspace())) {
					return false;
				}

				// Never offer temporary workspaces in the history
				if (isRecentWorkspace(recent) && isTemporaryWorkspace(recent.workspace.configPath)) {
					return false;
				}

				return true;
			});

			return recentlyOpened;
		}

		return { workspaces: [], files: [] };
	}

	async addRecentlyOpened(recents: IRecent[]): Promise<void> {
		const recentlyOpened = await this.getRecentlyOpened();

		for (const recent of recents) {
			if (isRecentFile(recent)) {
				this.doRemoveRecentlyOpened(recentlyOpened, [recent.fileUri]);
				recentlyOpened.files.unshift(recent);
			} else if (isRecentFolder(recent)) {
				this.doRemoveRecentlyOpened(recentlyOpened, [recent.folderUri]);
				recentlyOpened.workspaces.unshift(recent);
			} else {
				this.doRemoveRecentlyOpened(recentlyOpened, [recent.workspace.configPath]);
				recentlyOpened.workspaces.unshift(recent);
			}
		}

		return this.saveRecentlyOpened(recentlyOpened);
	}

	async removeRecentlyOpened(paths: URI[]): Promise<void> {
		const recentlyOpened = await this.getRecentlyOpened();

		this.doRemoveRecentlyOpened(recentlyOpened, paths);

		return this.saveRecentlyOpened(recentlyOpened);
	}

	private doRemoveRecentlyOpened(recentlyOpened: IRecentlyOpened, paths: URI[]): void {
		recentlyOpened.files = recentlyOpened.files.filter(file => {
			return !paths.some(path => path.toString() === file.fileUri.toString());
		});

		recentlyOpened.workspaces = recentlyOpened.workspaces.filter(workspace => {
			return !paths.some(path => path.toString() === (isRecentFolder(workspace) ? workspace.folderUri.toString() : workspace.workspace.configPath.toString()));
		});
	}

	private async saveRecentlyOpened(data: IRecentlyOpened): Promise<void> {
		return this.storageService.store(BrowserWorkspacesService.RECENTLY_OPENED_KEY, JSON.stringify(toStoreData(data)), StorageScope.APPLICATION, StorageTarget.USER);
	}

	async clearRecentlyOpened(): Promise<void> {
		this.storageService.remove(BrowserWorkspacesService.RECENTLY_OPENED_KEY, StorageScope.APPLICATION);
	}

	//#endregion

	//#region Workspace Management

	async enterWorkspace(workspaceUri: URI): Promise<IEnterWorkspaceResult | undefined> {
		return { workspace: await this.getWorkspaceIdentifier(workspaceUri) };
	}

	async createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier> {
		const randomId = (Date.now() + Math.round(Math.random() * 1000)).toString();
		const newUntitledWorkspacePath = joinPath(this.environmentService.untitledWorkspacesHome, `Untitled-${randomId}.${WORKSPACE_EXTENSION}`);

		// Build array of workspace folders to store
		const storedWorkspaceFolder: IStoredWorkspaceFolder[] = [];
		if (folders) {
			for (const folder of folders) {
				storedWorkspaceFolder.push(getStoredWorkspaceFolder(folder.uri, true, folder.name, this.environmentService.untitledWorkspacesHome, this.uriIdentityService.extUri));
			}
		}

		// Store at untitled workspaces location
		const storedWorkspace: IStoredWorkspace = { folders: storedWorkspaceFolder, remoteAuthority };
		await this.fileService.writeFile(newUntitledWorkspacePath, VSBuffer.fromString(JSON.stringify(storedWorkspace, null, '\t')));

		return this.getWorkspaceIdentifier(newUntitledWorkspacePath);
	}

	async deleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void> {
		try {
			await this.fileService.del(workspace.configPath);
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				throw error; // re-throw any other error than file not found which is OK
			}
		}
	}

	async getWorkspaceIdentifier(workspaceUri: URI): Promise<IWorkspaceIdentifier> {
		return getWorkspaceIdentifier(workspaceUri);
	}

	//#endregion


	//#region Dirty Workspaces

	async getDirtyWorkspaces(): Promise<Array<IWorkspaceBackupInfo | IFolderBackupInfo>> {
		return []; // Currently not supported in web
	}

	//#endregion
}

registerSingleton(IWorkspacesService, BrowserWorkspacesService, InstantiationType.Delayed);
