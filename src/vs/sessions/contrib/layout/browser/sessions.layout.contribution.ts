/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { MobileLayoutController } from './mobileSessionLayoutController.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { DesktopLayoutController } from './desktopLayoutController.js';
import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SESSIONS_LAYOUT_SCOPE_SETTING } from '../../../common/chatLayout.js';
import { LEGACY_SESSION_TOOLBAR_SETTING, SESSION_ACTIVITY_BAR_GITHUB_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../../common/sessionConfig.js';
import { ConfigurationKeyValuePairs, Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../../workbench/common/configuration.js';
import { ISessionEditorWorkingSetService, SessionEditorWorkingSetService } from '../common/sessionEditorWorkingSet.js';

registerSingleton(ISessionEditorWorkingSetService, SessionEditorWorkingSetService, InstantiationType.Delayed);

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
			experiment: { mode: 'startup' },
			description: localize('sessionsLayoutScope.description', "Choose whether layout state belongs to each session or each chat in non-phone Agents windows. Pane sizes remain shared. Terminal behavior is unchanged in all modes. Changes take effect after manually reloading the window."),
		},
		[SESSION_ACTIVITY_BAR_SETTING]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			experiment: { mode: 'auto' },
			description: localize('sessions.showSessionActivityBar', "Controls whether the Session Activity Bar is shown at the right edge of the active chat in the Agents window. It opens the Changes, Files, Browser, and Canvas tabs."),
		},
		[SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize('sessions.sessionActivityBar.showLayoutActions', "Controls whether the Session Activity Bar shows the Toggle Side Panel and Toggle Panel actions in place of their title bar buttons. Only applies when {0} is enabled.", '`#sessions.showSessionActivityBar#`'),
		},
		[SESSION_ACTIVITY_BAR_GITHUB_ACTIONS_SETTING]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize('sessions.sessionActivityBar.showGitHubActions', "Controls whether the Session Activity Bar shows pull request and issue actions for the active chat when a contributed opener is available for their links. Does not affect pills above the chat input. Only applies when {0} is enabled.", '`#sessions.showSessionActivityBar#`'),
		},
	},
});

Registry.as<IConfigurationMigrationRegistry>(WorkbenchConfigurationExtensions.ConfigurationMigration).registerConfigurationMigrations([{
	key: LEGACY_SESSION_TOOLBAR_SETTING,
	migrateFn: (value, accessor) => {
		const pairs: ConfigurationKeyValuePairs = [[LEGACY_SESSION_TOOLBAR_SETTING, { value: undefined }]];
		if (accessor(SESSION_ACTIVITY_BAR_SETTING) === undefined) {
			pairs.push([SESSION_ACTIVITY_BAR_SETTING, { value }]);
		}
		return pairs;
	},
}]);
