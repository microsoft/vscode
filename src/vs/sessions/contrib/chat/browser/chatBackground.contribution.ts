/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import '../../../../workbench/contrib/sessions/browser/chatBackgroundActions.js';
import { ISessionsChatBackgroundService, SessionsChatBackgroundService } from '../../../../workbench/contrib/sessions/browser/chatBackgroundService.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING } from '../../../../workbench/contrib/sessions/common/chatConstants.js';
import { SessionsChatBackgroundTint } from '../../../../workbench/contrib/sessions/browser/chatBackgroundTint.js';
import { GetThemeColorsToolContribution } from './getThemeColorsTool.js';

// The Agents window tints its theme to the chat background image, always, while the setting is on
registerWorkbenchContribution2(SessionsChatBackgroundTint.ID, SessionsChatBackgroundTint, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(GetThemeColorsToolContribution.ID, GetThemeColorsToolContribution, WorkbenchPhase.Eventually);
registerSingleton(ISessionsChatBackgroundService, SessionsChatBackgroundService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['advanced'],
			experiment: { mode: 'auto' },
			markdownDescription: localize('chat.agentSessions.appearanceTools.enabled', "Enable the Get Theme Colors, Set Chat Background, and Screenshot Window tools and the built-in `generate-chat-background` skill in the Agents window. Disabling this does not remove existing backgrounds or affect the manual background controls."),
		},
	},
});
