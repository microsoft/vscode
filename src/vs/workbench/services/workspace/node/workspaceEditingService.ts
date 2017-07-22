/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import URI from 'vs/base/common/uri';
import { equals, distinct } from 'vs/base/common/arrays';
import { TPromise } from "vs/base/common/winjs.base";
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWorkspacesService } from "vs/platform/workspaces/common/workspaces";

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
		if (!this.supported) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const roots = this.contextService.getWorkspace().roots;

		return this.doSetRoots([...roots, ...rootsToAdd]);
	}

	public removeRoots(rootsToRemove: URI[]): TPromise<void> {
		if (!this.supported) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const roots = this.contextService.getWorkspace().roots;
		const rootsToRemoveRaw = rootsToRemove.map(root => root.toString());

		return this.doSetRoots(roots.filter(root => rootsToRemoveRaw.indexOf(root.toString()) === -1));
	}

	private supported(): boolean {
		if (this.contextService.hasMultiFolderWorkspace()) {
			return false; // we need a multi folder workspace to begin with
		}

		// TODO@Ben multi root
		return this.environmentService.appQuality !== 'stable'; // not yet enabled in stable
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
			return this.jsonEditingService.write(workspace.configuration, { key: 'folders', value: newWorkspaceRoots }, true);
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
		const validatedRoots = distinct(roots.map(root => root.toString(true /* skip encoding */)));
		return validatedRoots;
	}
}