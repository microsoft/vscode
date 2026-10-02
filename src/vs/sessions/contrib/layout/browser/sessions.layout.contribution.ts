/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MobileLayoutController } from './mobileSessionLayoutController.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { DesktopLayoutController } from './desktopLayoutController.js';
import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { CHAT_SPECIFIC_LAYOUT_SETTING } from '../../../common/chatLayout.js';

export class SessionsLayoutContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsLayoutContribution';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
	) {
		super();

		if (layoutService.agentWorkbenchLayout === AgentWorkbenchLayout.Desktop) {
			this._register(instantiationService.createInstance(DesktopLayoutController));
			return;
		}

		this._register(instantiationService.createInstance(MobileLayoutController));
	}
}

registerWorkbenchContribution2(SessionsLayoutContribution.ID, SessionsLayoutContribution, WorkbenchPhase.BlockRestore);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'sessions',
	title: localize('sessionsConfigurationTitle', "Sessions"),
	properties: {
		[CHAT_SPECIFIC_LAYOUT_SETTING]: {
			type: 'string',
			enum: ['disabled', 'shared', 'per-chat'],
			enumDescriptions: [
				localize('chatSpecificLayout.disabled', "Use the existing session layout and terminal behavior."),
				localize('chatSpecificLayout.shared', "Keep editors, selected panel views, and terminals separate for each chat, with shared Editor, Details, and bottom-panel visibility across existing workspace chats."),
				localize('chatSpecificLayout.perChat', "Keep editors, Editor and Details composition, bottom-panel visibility, selected panel views, and terminals separate for each chat."),
			],
			default: 'disabled',
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			description: localize('chatSpecificLayout.description', "Choose chat layout ownership in non-phone Agents windows. Pane sizes remain shared. Changes take effect after manually reloading the window."),
		},
	},
});
