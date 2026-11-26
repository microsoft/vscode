/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IActivityService, IViewTitleBadge } from '../../../services/activity/common/activity.js';
import { SESSIONS_FILES_VIEW_ID, VIEW_ID } from '../../files/common/files.js';

/** The views that show the files of the workspace folder, in the editor window and in the Agents window. */
const FOLDER_VIEW_IDS = [VIEW_ID, SESSIONS_FILES_VIEW_ID];

/**
 * Shows the location of the workspace folder after the title of the views of its files, while the folder of a
 * single-folder workspace is at an alternate location, such as a worktree.
 */
export class FolderLocationTitleBadgeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.folderLocationTitleBadge';

	private readonly badges = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IActivityService private readonly activityService: IActivityService
	) {
		super();

		this._register(this.folderLocationService.onDidChangeLocation(() => this.update()));
		this._register(this.folderLocationService.onDidChangeCanSetLocation(() => this.update()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.update()));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.update()));
		this._register(this.labelService.onDidChangeFormatters(() => this.update()));
		this.update();
	}

	private update(): void {
		const badge = this.getBadge();
		if (!badge) {
			this.badges.clear();
			return;
		}
		const store = new DisposableStore();
		for (const viewId of FOLDER_VIEW_IDS) {
			store.add(this.activityService.showViewTitleBadge(viewId, badge));
		}
		this.badges.value = store;
	}

	private getBadge(): IViewTitleBadge | undefined {
		const workspace = this.contextService.getWorkspace();
		const folder = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? workspace.folders[0] : undefined;
		const location = folder ? this.folderLocationService.getLocation(folder) : undefined;
		if (!folder || !location) {
			return undefined;
		}
		const locationLabel = this.labelService.getFolderLocationLabel(folder.uri) ?? location.label;
		const primaryName = workspace.uri ? basename(workspace.uri) : folder.name;
		return {
			icon: location.icon,
			label: location.label,
			tooltip: localize('folderLocationTitleBadgeTooltip', "{0} (alternate location of '{1}')", locationLabel, primaryName),
			ariaLabel: localize('folderLocationTitleBadgeAria', "Folder Location, {0}", locationLabel)
		};
	}
}
