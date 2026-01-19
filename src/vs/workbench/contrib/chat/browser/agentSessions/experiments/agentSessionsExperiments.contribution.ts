/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../../../platform/instantiation/common/extensions.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IAgentSessionProjectionService, AgentSessionProjectionService } from './agentSessionProjectionService.js';
import { EnterAgentSessionProjectionAction, ExitAgentSessionProjectionAction, ToggleAgentStatusAction, ToggleAgentSessionProjectionAction } from './agentSessionProjectionActions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { AgentTitleBarStatusRendering } from './agentTitleBarStatusWidget.js';
import { AgentTitleBarStatusService, IAgentTitleBarStatusService } from './agentTitleBarStatusService.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ChatConfiguration } from '../../../common/constants.js';

// #region Agent Session Projection & Status

registerAction2(EnterAgentSessionProjectionAction);
registerAction2(ExitAgentSessionProjectionAction);
registerAction2(ToggleAgentStatusAction);
registerAction2(ToggleAgentSessionProjectionAction);

registerSingleton(IAgentSessionProjectionService, AgentSessionProjectionService, InstantiationType.Delayed);
registerSingleton(IAgentTitleBarStatusService, AgentTitleBarStatusService, InstantiationType.Delayed);

registerWorkbenchContribution2(AgentTitleBarStatusRendering.ID, AgentTitleBarStatusRendering, WorkbenchPhase.AfterRestored);

// Register Agent Status as a menu item in the command center (alongside the search box, not replacing it)
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.AgentsTitleBarControlMenu,
	title: localize('agentsControl', "Agents"),
	icon: Codicon.chatSparkle,
	when: ContextKeyExpr.has(`config.${ChatConfiguration.AgentStatusEnabled}`),
	order: 10002 // to the right of the chat button
});

// Register a placeholder action to the submenu so it appears (required for submenus)
MenuRegistry.appendMenuItem(MenuId.AgentsTitleBarControlMenu, {
	command: {
		id: 'workbench.action.chat.toggle',
		title: localize('openChat', "Open Chat"),
	},
	when: ContextKeyExpr.has(`config.${ChatConfiguration.AgentStatusEnabled}`),
});

//#endregion
