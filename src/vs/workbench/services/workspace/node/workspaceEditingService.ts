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
import { IEnvironmentService } from "vs/platform/environment/common/environment";

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
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
	}

	private supported(): boolean {
		if (!this.contextService.hasWorkspace()) {
			return false; // we need a workspace to begin with
		}

		// TODO@Ben multi root
		return this.environmentService.appQuality !== 'stable'; // not yet enabled in stable
	}

	public addRoots(rootsToAdd: URI[]): TPromise<void> {
		if (!this.supported) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const roots = this.contextService.getWorkspace2().roots;

		return this.doSetRoots([...roots, ...rootsToAdd]);
	}

	public removeRoots(rootsToRemove: URI[]): TPromise<void> {
		if (!this.supported) {
			return TPromise.as(void 0); // we need a workspace to begin with
		}

		const roots = this.contextService.getWorkspace2().roots;
		const rootsToRemoveRaw = rootsToRemove.map(root => root.toString());

		return this.doSetRoots(roots.filter(root => rootsToRemoveRaw.indexOf(root.toString()) === -1));
	}

	private doSetRoots(newRoots: URI[]): TPromise<void> {
		const workspaceUserConfig = this.configurationService.lookup(workspaceConfigKey).user as IWorkspaceConfiguration || Object.create(null);
		const master = this.contextService.getWorkspace2().roots[0];

		const currentWorkspaceRoots = this.validateRoots(master, workspaceUserConfig[master.toString()] && workspaceUserConfig[master.toString()].folders);
		const newWorkspaceRoots = this.validateRoots(master, newRoots);

		// See if there are any changes
		if (equals(currentWorkspaceRoots, newWorkspaceRoots)) {
			return TPromise.as(void 0);
		}

		// Apply to config
		if (newWorkspaceRoots.length) {
			workspaceUserConfig[master.toString()] = {
				folders: newWorkspaceRoots
			};
		} else {
			delete workspaceUserConfig[master.toString()];
		}

		return this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: workspaceConfigKey, value: workspaceUserConfig }).then(() => void 0);
	}

	private validateRoots(master: URI, roots: URI[]): string[] {
		if (!roots) {
			return [];
		}

		// Prevent duplicates
		const validatedRoots = distinct(roots.map(root => root.toString()));

		// Make sure we do not set the master folder as root
		const masterIndex = validatedRoots.indexOf(master.toString());
		if (masterIndex >= 0) {
			validatedRoots.splice(masterIndex, 1);
		}

		return validatedRoots;
	}
}