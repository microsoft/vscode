/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspaces/common/workspaceEditing';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class SaveWorkspaceAsAction extends Action {

	static readonly ID = 'workbench.action.saveWorkspaceAs';
	static LABEL = nls.localize('saveWorkspaceAsAction', "Save Workspace As...");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService

	) {
		super(id, label);
	}

	async run(): Promise<any> {
		const configPathUri = await this.workspaceEditingService.pickNewWorkspacePath();
		if (configPathUri) {
			switch (this.contextService.getWorkbenchState()) {
				case WorkbenchState.EMPTY:
				case WorkbenchState.FOLDER:
					const folders = this.contextService.getWorkspace().folders.map(folder => ({ uri: folder.uri }));
					return this.workspaceEditingService.createAndEnterWorkspace(folders, configPathUri);
				case WorkbenchState.WORKSPACE:
					return this.workspaceEditingService.saveAndEnterWorkspace(configPathUri);
			}
		}
	}
}

export class DuplicateWorkspaceInNewWindowAction extends Action {

	static readonly ID = 'workbench.action.duplicateWorkspaceInNewWindow';
	static readonly LABEL = nls.localize('duplicateWorkspaceInNewWindow', "Duplicate Workspace in New Window");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		super(id, label);
	}

	async run(): Promise<any> {
		const folders = this.workspaceContextService.getWorkspace().folders;
		const remoteAuthority = this.environmentService.configuration.remoteAuthority;

		const newWorkspace = await this.workspacesService.createUntitledWorkspace(folders, remoteAuthority);
		await this.workspaceEditingService.copyWorkspaceSettings(newWorkspace);

		return this.hostService.openWindow([{ workspaceUri: newWorkspace.configPath }], { forceNewWindow: true });
	}
}
