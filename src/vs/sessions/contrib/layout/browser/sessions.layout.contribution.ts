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
import { SESSIONS_LAYOUT_SCOPE_SETTING } from '../../../common/chatLayout.js';

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
		[SESSIONS_LAYOUT_SCOPE_SETTING]: {
			type: 'string',
			enum: ['session-shared', 'chat-shared', 'chat'],
			enumDescriptions: [
				localize('sessionsLayoutScope.sessionShared', "Keep editors and selected panel views separate for each session, with shared Editor, Details, and bottom-panel visibility across existing workspace sessions."),
				localize('sessionsLayoutScope.chatShared', "Keep editors and selected panel views separate for each chat, with shared Editor, Details, and bottom-panel visibility across existing workspace chats."),
				localize('sessionsLayoutScope.chat', "Keep editors, Editor and Details composition, bottom-panel visibility, and selected panel views separate for each chat."),
			],
			default: 'session-shared',
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			description: localize('sessionsLayoutScope.description', "Choose whether layout state belongs to each session or each chat in non-phone Agents windows. Pane sizes remain shared. Terminal behavior is unchanged in all modes. Changes take effect after manually reloading the window."),
		},
	},
});
