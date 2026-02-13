/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AgentSessionInputNeededNotificationRendering } from './agentSessionInputNeededNotification.js';
import './agentSessionInputNeededNotificationActions.js'; // Register actions

// Register the input needed notification rendering contribution
registerWorkbenchContribution2(
	AgentSessionInputNeededNotificationRendering.ID,
	AgentSessionInputNeededNotificationRendering,
	WorkbenchPhase.AfterRestored
);

// Register a placeholder menu item for the input needed notification
// This creates a menu entry point that the widget can attach to
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	command: {
		id: 'workbench.action.chat.openInputNeededSession',
		title: localize('openInputNeededSession', "Open Session Needing Input"),
		icon: Codicon.report,
	},
	when: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ChatContextKeys.hasAgentSessionsNeedingInput,
		ContextKeyExpr.has(`config.${ChatConfiguration.AgentSessionInputNeededNotification}`)
	),
	order: 10003 // to the right of agents control
});
