/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Schemas } from 'vs/base/common/network';
import { ITextFileService, ISaveOptions } from 'vs/workbench/services/textfile/common/textfiles';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';

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
		@IWindowService private readonly windowService: IWindowService,
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

		return this.windowService.openWindow([{ workspaceUri: newWorkspace.configPath }], { forceNewWindow: true });
	}
}

export class CloseWorkspaceAction extends Action {

	static readonly ID = 'workbench.action.closeFolder';
	static LABEL = nls.localize('closeWorkspace', "Close Workspace");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWindowService private readonly windowService: IWindowService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.notificationService.info(nls.localize('noWorkspaceOpened', "There is currently no workspace opened in this instance to close."));

			return Promise.resolve(undefined);
		}

		return this.windowService.closeWorkspace();
	}
}

export namespace OpenLocalFileCommand {
	export function handler(): ICommandHandler {
		return accessor => {
			const dialogService = accessor.get(IFileDialogService);
			return dialogService.pickFileAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
		};
	}
}

export namespace SaveLocalFileCommand {
	export function handler(): ICommandHandler {
		return accessor => {
			const textFileService = accessor.get(ITextFileService);
			const editorService = accessor.get(IEditorService);
			let resource: URI | undefined = toResource(editorService.activeEditor);
			const options: ISaveOptions = { force: true, availableFileSystems: [Schemas.file] };
			if (resource) {
				return textFileService.saveAs(resource, undefined, options);
			}
			return Promise.resolve(undefined);
		};
	}
}

export namespace OpenLocalFolderCommand {
	export function handler(): ICommandHandler {
		return accessor => {
			const dialogService = accessor.get(IFileDialogService);
			return dialogService.pickFolderAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
		};
	}
}

export namespace OpenLocalFileFolderCommand {
	export function handler(): ICommandHandler {
		return accessor => {
			const dialogService = accessor.get(IFileDialogService);
			return dialogService.pickFileFolderAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
		};
	}
}
