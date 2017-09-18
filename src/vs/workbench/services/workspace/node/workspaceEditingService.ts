/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWorkspacesService, IStoredWorkspaceFolder, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { dirname } from 'path';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { massageFolderPathForWorkspace } from 'vs/platform/workspaces/node/workspaces';
import { isLinux } from 'vs/base/common/platform';
import { WorkspaceServiceImpl } from 'vs/workbench/services/configuration/node/configuration';

export class WorkspaceEditingService implements IWorkspaceEditingService {

	public _serviceBrand: any;

	constructor(
		@IJSONEditingService private jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IWorkspacesService private workspacesService: IWorkspacesService,
		@IWorkspaceConfigurationService private workspaceConfigurationService: IWorkspaceConfigurationService
	) {
	}

	public addFolders(foldersToAdd: URI[]): TPromise<void> {
		if (!this.isSupported()) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const currentWorkspaceFolders = this.contextService.getWorkspace().folders;
		const currentWorkspaceFolderUris = currentWorkspaceFolders.map(folder => folder.uri);
		const currentStoredFolders = currentWorkspaceFolders.map(folder => folder.raw);

		const storedFoldersToAdd: IStoredWorkspaceFolder[] = [];

		const workspaceConfigFolder = dirname(this.contextService.getWorkspace().configuration.fsPath);

		foldersToAdd.forEach(foldersToAdd => {
			if (this.contains(currentWorkspaceFolderUris, foldersToAdd)) {
				return; // already existing
			}

			storedFoldersToAdd.push({
				path: massageFolderPathForWorkspace(foldersToAdd.fsPath, workspaceConfigFolder, currentStoredFolders)
			});
		});

		if (storedFoldersToAdd.length > 0) {
			return this.doSetFolders([...currentStoredFolders, ...storedFoldersToAdd]);
		}

		return TPromise.as(void 0);
	}

	public removeFolders(foldersToRemove: URI[]): TPromise<void> {
		if (!this.isSupported()) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const currentWorkspaceFolders = this.contextService.getWorkspace().folders;
		const currentStoredFolders = currentWorkspaceFolders.map(folder => folder.raw);

		const newStoredFolders: IStoredWorkspaceFolder[] = currentStoredFolders.filter((folder, index) => {
			if (!folder.path) {
				return true; // keep entries which are unrelated
			}

			return !this.contains(foldersToRemove, currentWorkspaceFolders[index].uri); // keep entries which are unrelated
		});

		if (newStoredFolders.length !== currentStoredFolders.length) {
			return this.doSetFolders(newStoredFolders);
		}

		return TPromise.as(void 0);
	}

	private doSetFolders(folders: IStoredWorkspaceFolder[]): TPromise<void> {
		if (folders.length) {
			const workspace = this.contextService.getWorkspace();

			return this.jsonEditingService.write(workspace.configuration, { key: 'folders', value: folders }, true);
		} else {
			// TODO: Sandeep - Removing all folders?
		}

		return TPromise.as(void 0);
	}

	private isSupported(): boolean {
		// TODO@Ben multi root
		return (
			this.environmentService.appQuality !== 'stable'  // not yet enabled in stable
			&& this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE // we need a multi folder workspace to begin with
		);
	}

	private contains(resources: URI[], toCheck: URI): boolean {
		return resources.some(resource => {
			if (isLinux) {
				return resource.toString() === toCheck.toString();
			}

			return resource.toString().toLowerCase() === toCheck.toString().toLowerCase();
		});
	}

	public createAndOpenWorkspace(folders?: string[], path?: string): TPromise<void> {
		return this.windowService.createAndOpenWorkspace(folders).then(workspace => this.openWorkspace(workspace));
	}

	public saveAndOpenWorkspace(path: string): TPromise<void> {
		return this.windowService.saveAndOpenWorkspace(path).then(workspace => this.openWorkspace(workspace));
	}

	private openWorkspace(workspace: IWorkspaceIdentifier): TPromise<void> {
		return (this.contextService as WorkspaceServiceImpl).initialize(workspace); // TODO@Ben ugly cast
	}
}