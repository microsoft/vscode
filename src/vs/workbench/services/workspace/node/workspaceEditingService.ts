/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkspaceEditingService } from "vs/workbench/services/workspace/common/workspaceEditing";
import URI from "vs/base/common/uri";
import { equals, distinct } from "vs/base/common/arrays";
import { TPromise } from "vs/base/common/winjs.base";
import { IWorkspaceContextService } from "vs/platform/workspace/common/workspace";
import { IConfigurationEditingService, ConfigurationTarget } from "vs/workbench/services/configuration/common/configurationEditing";
import { IConfigurationService } from "vs/platform/configuration/common/configuration";

interface IWorkspaceConfiguration {
	[master: string]: {
		folders: string[];
	};
}

const workspaceConfigKey = 'workspace';

export class WorkspaceEditingService implements IWorkspaceEditingService {

	public _serviceBrand: any;

	constructor(
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
	}

	public addRoots(rootsToAdd: URI[]): TPromise<void> {
		if (!this.contextService.hasWorkspace()) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const roots = this.contextService.getWorkspace2().roots;

		return this.doSetRoots([...roots, ...rootsToAdd]);
	}

	public removeRoots(rootsToRemove: URI[]): TPromise<void> {
		if (!this.contextService.hasWorkspace()) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const roots = this.contextService.getWorkspace2().roots;
		const rootsToRemoveRaw = rootsToRemove.map(root => root.toString());

		return this.doSetRoots(roots.filter(root => rootsToRemoveRaw.indexOf(root.toString()) === -1));
	}

	public clearRoots(): TPromise<void> {
		if (!this.contextService.hasWorkspace()) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		return this.doSetRoots([]);
	}

	private doSetRoots(roots: URI[]): TPromise<void> {
		const workspaceUserConfig = this.configurationService.lookup(workspaceConfigKey).user as IWorkspaceConfiguration || Object.create(null);
		const master = this.contextService.getWorkspace2().roots[0].toString();

		const currentWorkspaceRoots = (workspaceUserConfig[master.toString()] && workspaceUserConfig[master.toString()].folders) || [];
		const newWorkspaceRoots = distinct(roots.map(root => root.toString()));

		// Make sure we do not set the master folder as root
		const masterIndex = newWorkspaceRoots.indexOf(master);
		if (masterIndex >= 0) {
			newWorkspaceRoots.splice(masterIndex, 1);
		}

		// See if there are any changes
		if (equals(currentWorkspaceRoots, newWorkspaceRoots)) {
			return TPromise.as(void 0);
		}

		// Apply to config
		workspaceUserConfig[master.toString()] = {
			folders: newWorkspaceRoots
		};

		return this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: workspaceConfigKey, value: workspaceUserConfig }).then(() => void 0);
	}
}