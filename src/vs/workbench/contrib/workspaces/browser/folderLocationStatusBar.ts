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
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';

const FOLDER_LOCATION_INTRODUCED_STORAGE_KEY = 'workbench.folderLocation.noticeShown';
const FOLDER_LOCATION_STATUS_ENTRY_ID = 'status.workspace.folderLocation';

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
		@IHoverService private readonly hoverService: IHoverService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@ICommandService private readonly commandService: ICommandService,
		@IStorageService private readonly storageService: IStorageService
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
			command: RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID,
			kind: 'prominent' as const
		};

		if (this.entry.value) {
			this.entry.value.update(props);
		} else {
			this.entry.value = this.statusbarService.addEntry(props, FOLDER_LOCATION_STATUS_ENTRY_ID, StatusbarAlignment.LEFT, 1000);
			if (this.storageService.getBoolean(FOLDER_LOCATION_NOTICE_STORAGE_KEY, StorageScope.APPLICATION, false)) {
				return;
			}
			this.showIntroduction(location.label, primaryName);
		}
	}

	/**
	 * Introduces the status bar entry the first time the folder is at an alternate location:
	 * a sticky hover anchored on the entry, which is highlighted while the hover is open.
	 */
	private showIntroduction(label: string, primaryName: string): void {
		if (this.storageService.getBoolean(FOLDER_LOCATION_INTRODUCED_STORAGE_KEY, StorageScope.APPLICATION, false)) {
			return;
		}

		// eslint-disable-next-line eslint-js/no-restricted-syntax -- the status bar does not expose its item elements
		const element = this.layoutService.mainContainer.ownerDocument.getElementById(FOLDER_LOCATION_STATUS_ENTRY_ID);
		if (!element) {
			return;
		}

		this.storageService.store(FOLDER_LOCATION_INTRODUCED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const message = localize('folderLocationSwitched', "The folder is now at the location '{0}'. Files, search, terminals and extensions use this location, but open editors stay where they are.", label);
		element.classList.add('folder-location-highlight');
		this.hoverService.showInstantHover({
			content: message,
			target: element,
			persistence: { sticky: true },
			appearance: { showPointer: true },
			actions: [
				{
					label: localize('returnToPrimaryNamed', "Return to {0}", primaryName),
					commandId: RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID,
					run: () => this.commandService.executeCommand(RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID)
				},
				{
					label: localize('gotIt', "Got It"),
					commandId: 'workbench.action.folderLocation.dismissIntroduction',
					run: () => { /* the hover hides itself after any action */ }
				}
			],
			onDidHide: () => element.classList.remove('folder-location-highlight')
		});
		status(message);
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
