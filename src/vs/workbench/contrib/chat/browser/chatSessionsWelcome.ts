/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Extensions as ViewExtensions, IViewsRegistry, IViewContentDescriptor } from '../../../common/views.js';
import { VIEWLET_ID } from './chatSessions.js';

/**
 * Contribution to register welcome content for chat sessions views when they are empty.
 */
class ChatSessionsWelcomeContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatSessionsWelcome';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		this.registerWelcomeContent();
	}

	private registerWelcomeContent(): void {
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);

		// Register welcome content for the local chat sessions view
		// This will show when there are no coding agent runs
		const localViewId = `${VIEWLET_ID}.local`;
		
		const welcomeContent: IViewContentDescriptor = {
			content: localize('chatSessions.welcome', "No coding agent runs yet.\n\n[Start a coding session](command:workbench.action.chat.open) to begin."),
			when: 'default', // Show when the view determines it should show welcome content
		};
		
		// Register the welcome content
		viewsRegistry.registerViewWelcomeContent(localViewId, welcomeContent);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(ChatSessionsWelcomeContribution, LifecyclePhase.Restored);