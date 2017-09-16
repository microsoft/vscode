/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import URI from 'vs/base/common/uri';
import { equals, distinct } from 'vs/base/common/arrays';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWorkspacesService, IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { isLinux } from 'vs/base/common/platform';
import { dirname, relative } from 'path';
import { isEqualOrParent } from 'vs/base/common/paths';

export class WorkspaceEditingService implements IWorkspaceEditingService {

	public _serviceBrand: any;

	constructor(
		@IJSONEditingService private jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkspacesService private workspacesService: IWorkspacesService
	) {
	}

	public addFolders(foldersToAdd: URI[]): TPromise<void> {
		if (!this.isSupported()) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const folders = this.contextService.getWorkspace().folders.map(folder => folder.uri);

		return this.doSetFolders([...folders, ...foldersToAdd]);
	}

	public removeFolders(foldersToRemove: URI[]): TPromise<void> {
		if (!this.isSupported()) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const folders = this.contextService.getWorkspace().folders;
		const foldersToRemoveRaw = foldersToRemove.map(folder => folder.toString());

		return this.doSetFolders(folders.filter(folder => foldersToRemoveRaw.indexOf(folder.uri.toString()) === -1).map(folder => folder.uri));
	}

	private isSupported(): boolean {
		return (
			this.environmentService.appQuality !== 'stable'  // not yet enabled in stable
			&& !!this.contextService.getWorkspace().configuration // we need a workspace configuration file to begin with
		);
	}

	private doSetFolders(newFolders: URI[]): TPromise<void> {
		const workspace = this.contextService.getWorkspace();
		const currentWorkspaceFolders = this.contextService.getWorkspace().folders.map(folder => folder.uri.fsPath);
		const newWorkspaceFolders = this.validateFolders(newFolders);

		// See if there are any changes
		if (equals(currentWorkspaceFolders, newWorkspaceFolders)) {
			return TPromise.as(void 0);
		}

		// Apply to config
		if (newWorkspaceFolders.length) {
			const workspaceConfigFolder = dirname(workspace.configuration.fsPath);
			const value: IStoredWorkspaceFolder[] = newWorkspaceFolders.map(newWorkspaceFolder => {
				if (isEqualOrParent(newWorkspaceFolder, workspaceConfigFolder, !isLinux)) {
					newWorkspaceFolder = relative(workspaceConfigFolder, newWorkspaceFolder) || '.'; // absolute paths get converted to relative ones to workspace location if possible
				}

				return { path: newWorkspaceFolder };
			});

			return this.jsonEditingService.write(workspace.configuration, { key: 'folders', value }, true);
		} else {
			// TODO: Sandeep - Removing all folders?
		}

		return TPromise.as(null);
	}

	private validateFolders(folders: URI[]): string[] {
		if (!folders) {
			return [];
		}

		// Prevent duplicates
		return distinct(folders.map(folder => folder.fsPath), folder => isLinux ? folder : folder.toLowerCase());
	}
}
