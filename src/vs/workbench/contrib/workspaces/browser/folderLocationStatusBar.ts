/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';

export const RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID = 'workbench.action.returnToPrimaryFolderLocation';

/**
 * Shows the location of the workspace folder in the status bar while
 * the folder is at an alternate location.
 */
export class FolderLocationStatusBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.folderLocationStatusBar';

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this._register(this.folderLocationService.onDidChangeCurrentLocation(() => this.update()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.update()));
		this.update();
	}

	private update(): void {
		const location = this.folderLocationService.currentLocation;
		const folder = this.contextService.getWorkspace().folders[0];
		if (!location || !folder?.primaryUri) {
			this.entry.clear();
			return;
		}

		const primaryName = basename(folder.primaryUri);
		const props = {
			name: localize('folderLocation', "Folder Location"),
			text: `$(location) ${location.label}`,
			ariaLabel: localize('folderLocationAria', "Folder Location, {0}", location.label),
			tooltip: location.description
				? localize('folderLocationTooltipWithDescription', "Folder location: {0}. Select to return to {1}.", location.description, primaryName)
				: localize('folderLocationTooltip', "Folder location: {0}. Select to return to {1}.", location.label, primaryName),
			command: RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID
		};

		if (this.entry.value) {
			this.entry.value.update(props);
		} else {
			this.entry.value = this.statusbarService.addEntry(props, 'status.workspace.folderLocation', StatusbarAlignment.LEFT, 1000);
			this.notificationService.prompt(
				Severity.Info,
				localize('folderLocationSwitched', "The folder is now at the location '{0}'. Select the status bar entry to return to {1}.", location.label, primaryName),
				[{
					label: localize('returnToPrimaryLocation', "Return to Primary Location"),
					run: () => this.commandService.executeCommand(RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID)
				}],
				{ neverShowAgain: { id: 'workbench.folderLocation.switched', scope: NeverShowAgainScope.APPLICATION } }
			);
		}
	}
}

registerAction2(class ReturnToPrimaryFolderLocationAction extends Action2 {

	constructor() {
		super({
			id: RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID,
			title: localize2('returnToPrimaryFolderLocation', "Return to Primary Location"),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const folder = accessor.get(IWorkspaceContextService).getWorkspace().folders[0];
		if (folder?.primaryUri) {
			await accessor.get(IWorkspaceEditingService).setFolderLocation(folder.primaryUri, undefined);
		}
	}
});
