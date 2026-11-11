/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { MobileLayoutController } from './mobileSessionLayoutController.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { AgentWorkbenchLayout } from '../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { DesktopLayoutController } from './desktopLayoutController.js';
import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SESSIONS_LAYOUT_SCOPE_SETTING } from '../../../common/chatLayout.js';
import { LEGACY_SESSION_TOOLBAR_SETTING, SESSION_ACTIVITY_BAR_FIXED_COLUMN_SETTING, SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING, SESSIONS_FLOATING_DETAILS_SETTING, SESSIONS_DETAILS_POSITION_SETTING, DetailsPosition } from '../../../../workbench/contrib/sessions/common/sessionConfig.js';
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

export class SessionsSidePaneLayoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessionsSidePaneLayout';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
	) {
		super();
		if (layoutService.agentWorkbenchLayout !== AgentWorkbenchLayout.Desktop) {
			return;
		}

		const update = () => {
			const position = configurationService.getValue<DetailsPosition>(SESSIONS_DETAILS_POSITION_SETTING);
			layoutService.setDetailsPosition(position === 'left' || position === 'top' || position === 'bottom' ? position : 'right');
			layoutService.setAuxiliaryBarFloating(configurationService.getValue(SESSIONS_FLOATING_DETAILS_SETTING) === true);
		};
		update();
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(SESSIONS_DETAILS_POSITION_SETTING) || event.affectsConfiguration(SESSIONS_FLOATING_DETAILS_SETTING)) {
				update();
			}
		}));
	}
}

registerWorkbenchContribution2(SessionsSidePaneLayoutContribution.ID, SessionsSidePaneLayoutContribution, WorkbenchPhase.BlockRestore);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'sessions',
	title: localize('sessionsConfigurationTitle', "Sessions"),
	properties: {
		[SESSIONS_DETAILS_POSITION_SETTING]: {
			type: 'string',
			enum: ['right', 'left', 'top', 'bottom'],
			enumDescriptions: [
				localize('detailsPosition.right', "Show details to the right of the editor content inside the side panel."),
				localize('detailsPosition.left', "Show details to the left of the editor content inside the side panel."),
				localize('detailsPosition.top', "Show details above the editor content inside the side panel."),
				localize('detailsPosition.bottom', "Show details below the editor content inside the side panel."),
			],
			default: 'right',
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			description: localize('detailsPosition.description', "Controls where Files, Changes, and other details appear relative to editor content inside the desktop Agents side panel. Does not move the side panel relative to chat. Floating details ignore this position. Changes apply immediately."),
		},
		[SESSIONS_FLOATING_DETAILS_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			description: localize('floatingDetails.description', "Show file trees and other details as a compact floating widget instead of reserving editor space in the desktop Agents window. Hover or focus the widget to preview details, and activate its control to pin it open. Toggle Details shows or hides the widget."),
		},
		[SESSIONS_LAYOUT_SCOPE_SETTING]: {
			type: 'string',
			enum: ['session-shared', 'chat-shared', 'chat'],
			enumDescriptions: [
				localize('sessionsLayoutScope.sessionShared', "Keep editors and selected panel views separate for each session, with shared Editor, Details, and bottom-panel visibility across existing workspace sessions."),
				localize('sessionsLayoutScope.chatShared', "Keep editors and selected panel views separate for each chat, with shared Editor, Details, and bottom-panel visibility across existing workspace chats."),
				localize('sessionsLayoutScope.chat', "Keep editors, Editor and Details composition, bottom-panel visibility, and selected panel views separate for each chat."),
			],
			default: 'chat',
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			description: localize('sessionsLayoutScope.description', "Choose whether layout state belongs to each session or each chat in non-phone Agents windows. Pane sizes remain shared. Terminal behavior is unchanged in all modes. Changes take effect after manually reloading the window."),
		},
		[SESSION_ACTIVITY_BAR_SETTING]: {
			type: 'boolean',
			default: true,
			experiment: { mode: 'auto' },
			description: localize('sessions.showSessionActivityBar', "Controls whether the Session Activity Bar is shown at the right edge of the active chat in the Agents window. It opens the Changes, Files, Browser, and Canvas tabs."),
		},
		[SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize('sessions.sessionActivityBar.showLayoutActions', "Controls whether the Session Activity Bar shows the Toggle Side Panel and Toggle Panel actions in place of their title bar buttons. Only applies when {0} is enabled.", '`#sessions.showSessionActivityBar#`'),
		},
		[SESSION_ACTIVITY_BAR_FIXED_COLUMN_SETTING]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			markdownDescription: localize('sessions.sessionActivityBar.fixedColumn', "Controls whether the Session Activity Bar shows in a column of its own at the right edge of the Agents window, beside the side pane, rather than beside the active chat. Only applies when {0} is enabled.", '`#sessions.showSessionActivityBar#`'),
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
