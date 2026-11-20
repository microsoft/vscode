/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IActivityService, IconBadge } from '../../../services/activity/common/activity.js';
import { VIEWLET_ID } from '../../files/common/files.js';

/**
 * Badges the Explorer in the Activity Bar while a workspace folder is at an alternate location.
 */
export class FolderLocationExplorerBadgeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.folderLocationExplorerBadge';

	private readonly badge = this._register(new MutableDisposable());

	constructor(
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IActivityService private readonly activityService: IActivityService
	) {
		super();

		this._register(this.folderLocationService.onDidChangeLocation(() => this.update()));
		this._register(this.folderLocationService.onDidChangeCanSetLocation(() => this.update()));
		this.update();
	}

	private update(): void {
		const alternates = this.contextService.getWorkspace().folders.flatMap(folder => {
			const location = this.folderLocationService.getLocation(folder);
			return location ? [{ folder, location }] : [];
		});

		if (alternates.length === 0) {
			this.badge.clear();
			return;
		}

		const description = alternates.length === 1
			? localize('folderLocationBadge', "'{0}' is open at {1}", alternates[0].folder.name, alternates[0].location.label)
			: localize('folderLocationBadgeMultiple', "{0} folders are at another location", alternates.length);
		this.badge.value = this.activityService.showViewContainerActivity(VIEWLET_ID, {
			badge: new IconBadge(alternates[0].location.icon ?? Codicon.gitBranchCheckout, () => description)
		});
	}
}
