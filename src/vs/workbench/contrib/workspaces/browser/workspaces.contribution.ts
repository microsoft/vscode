/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { hasWorkspaceFileExtension, IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { INeverShowAgainOptions, INotificationService, NeverShowAgainScope, Severity } from 'vs/platform/notification/common/notification';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { isVirtualWorkspace } from 'vs/platform/workspace/common/virtualWorkspace';

/**
 * A workbench contribution that will look for `.code-workspace` files in the root of the
 * workspace folder and open a notification to suggest to open one of the workspaces.
 */
export class WorkspacesFinderContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IFileService private readonly fileService: IFileService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IHostService private readonly hostService: IHostService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		this.findWorkspaces();
	}

	private async findWorkspaces(): Promise<void> {
		const folder = this.contextService.getWorkspace().folders[0];
		if (!folder || this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER || isVirtualWorkspace(this.contextService.getWorkspace())) {
			return; // require a single (non virtual) root folder
		}

		const rootFileNames = (await this.fileService.resolve(folder.uri)).children?.map(child => child.name);
		if (Array.isArray(rootFileNames)) {
			const workspaceFiles = rootFileNames.filter(hasWorkspaceFileExtension);
			if (workspaceFiles.length > 0) {
				this.doHandleWorkspaceFiles(folder.uri, workspaceFiles);
			}
		}
	}

	private doHandleWorkspaceFiles(folder: URI, workspaces: string[]): void {
		const neverShowAgain: INeverShowAgainOptions = { id: 'workspaces.dontPromptToOpen', scope: NeverShowAgainScope.WORKSPACE, isSecondary: true };

		// Prompt to open one workspace
		if (workspaces.length === 1) {
			const workspaceFile = workspaces[0];

			this.notificationService.prompt(Severity.Info, localize('workspaceFound', "This folder contains a workspace file '{0}'. Do you want to open it? [Learn more]({1}) about workspace files.", workspaceFile, 'https://go.microsoft.com/fwlink/?linkid=2025315'), [{
				label: localize('openWorkspace', "Open Workspace"),
				run: () => this.hostService.openWindow([{ workspaceUri: joinPath(folder, workspaceFile) }])
			}], {
				neverShowAgain,
				silent: !this.storageService.isNew(StorageScope.WORKSPACE) // https://github.com/microsoft/vscode/issues/125315
			});
		}

		// Prompt to select a workspace from many
		else if (workspaces.length > 1) {
			this.notificationService.prompt(Severity.Info, localize('workspacesFound', "This folder contains multiple workspace files. Do you want to open one? [Learn more]({0}) about workspace files.", 'https://go.microsoft.com/fwlink/?linkid=2025315'), [{
				label: localize('selectWorkspace', "Select Workspace"),
				run: () => {
					this.quickInputService.pick(
						workspaces.map(workspace => ({ label: workspace } as IQuickPickItem)),
						{ placeHolder: localize('selectToOpen', "Select a workspace to open") }).then(pick => {
							if (pick) {
								this.hostService.openWindow([{ workspaceUri: joinPath(folder, pick.label) }]);
							}
						});
				}
			}], {
				neverShowAgain,
				silent: !this.storageService.isNew(StorageScope.WORKSPACE) // https://github.com/microsoft/vscode/issues/125315
			});
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspacesFinderContribution, 'WorkspacesFinderContribution', LifecyclePhase.Eventually);
