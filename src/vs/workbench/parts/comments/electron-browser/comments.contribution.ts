/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as PanelExtensions, PanelDescriptor, PanelRegistry } from 'vs/workbench/browser/panel';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { COMMENTS_PANEL_ID, COMMENTS_PANEL_TITLE, CommentsPanel } from './commentsPanel';

export class CommentPanelVisibilityUpdater implements IWorkbenchContribution {

	constructor(
		@IPanelService panelService: IPanelService
	) {
		// commentsProviderRegistry.onChange
		const updateCommentPanelVisibility = () => {
			panelService.setPanelEnablement(COMMENTS_PANEL_ID, false);
		};

		updateCommentPanelVisibility();
	}
}

Registry.as<PanelRegistry>(PanelExtensions.Panels).registerPanel(new PanelDescriptor(
	CommentsPanel,
	COMMENTS_PANEL_ID,
	COMMENTS_PANEL_TITLE,
	'commentsPanel',
	10
));

// Register view location updater
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(CommentPanelVisibilityUpdater, LifecyclePhase.Running);
