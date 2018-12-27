/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as PanelExtensions, PanelDescriptor, PanelRegistry } from 'vs/workbench/browser/panel';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { COMMENTS_PANEL_ID, COMMENTS_PANEL_TITLE, CommentsPanel } from './commentsPanel';
import 'vs/workbench/parts/comments/electron-browser/commentsEditorContribution';
import { ICommentService, CommentService } from 'vs/workbench/parts/comments/electron-browser/commentService';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';

export interface ICommentsConfiguration {
	openPanel: 'neverOpen' | 'openOnSessionStart' | 'openOnSessionStartWithComments';
}

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


Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'comments',
	order: 20,
	title: nls.localize('commentsConfigurationTitle', "Comments"),
	type: 'object',
	properties: {
		'comments.openPanel': {
			enum: ['neverOpen', 'openOnSessionStart', 'openOnSessionStartWithComments'],
			default: 'openOnSessionStartWithComments',
			description: nls.localize('openComments', "Controls when the comments panel should open.")
		}
	}
});

// Register view location updater
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(CommentPanelVisibilityUpdater, LifecyclePhase.Starting);

registerSingleton(ICommentService, CommentService);
