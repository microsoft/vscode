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

	public addRoots(rootsToAdd: URI[]): TPromise<void> {
		if (!this.isSupported()) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const roots = this.contextService.getWorkspace().roots;

		return this.doSetRoots([...roots, ...rootsToAdd]);
	}

	public removeRoots(rootsToRemove: URI[]): TPromise<void> {
		if (!this.isSupported()) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const roots = this.contextService.getWorkspace().roots;
		const rootsToRemoveRaw = rootsToRemove.map(root => root.toString());

		return this.doSetRoots(roots.filter(root => rootsToRemoveRaw.indexOf(root.toString()) === -1));
	}

	private isSupported(): boolean {
		// TODO@Ben multi root
		return (
			this.environmentService.appQuality !== 'stable'  // not yet enabled in stable
			&& this.contextService.hasMultiFolderWorkspace() // we need a multi folder workspace to begin with
		);
	}

	private doSetRoots(newRoots: URI[]): TPromise<void> {
		const workspace = this.contextService.getWorkspace();
		const currentWorkspaceRoots = this.contextService.getWorkspace().roots.map(root => root.fsPath);
		const newWorkspaceRoots = this.validateRoots(newRoots);

		// See if there are any changes
		if (equals(currentWorkspaceRoots, newWorkspaceRoots)) {
			return TPromise.as(void 0);
		}

		// Apply to config
		if (newWorkspaceRoots.length) {
			const workspaceConfigFolder = dirname(workspace.configuration.fsPath);
			const value: IStoredWorkspaceFolder[] = newWorkspaceRoots.map(newWorkspaceRoot => {
				if (isEqualOrParent(newWorkspaceRoot, workspaceConfigFolder, !isLinux)) {
					newWorkspaceRoot = relative(workspaceConfigFolder, newWorkspaceRoot) || '.'; // absolute paths get converted to relative ones to workspace location if possible
				}

				return { path: newWorkspaceRoot };
			});

			return this.jsonEditingService.write(workspace.configuration, { key: 'folders', value }, true);
		} else {
			// TODO: Sandeep - Removing all roots?
		}

		return TPromise.as(null);
	}

	private validateRoots(roots: URI[]): string[] {
		if (!roots) {
			return [];
		}

		// Prevent duplicates
		return distinct(roots.map(root => root.fsPath), root => isLinux ? root : root.toLowerCase());
	}
}
