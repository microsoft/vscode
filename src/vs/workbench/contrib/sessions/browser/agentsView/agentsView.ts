/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ContextKeyExpr, ContextKeyExpression, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { RemoteNameContext } from '../../../../common/contextkeys.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';

/** The view container of the Sessions view in editor windows. */
export const AGENTS_VIEW_CONTAINER_ID = 'workbench.view.agents';

/** Whether the state the Sessions view shares with the Agents window has loaded, so that its list can show it. */
export const AgentsViewStateReadyContext = new RawContextKey<boolean>('agentsViewStateReady', false, localize('agentsViewStateReady', "Whether the Sessions view of the editor window has loaded the state it shares with the Agents window."));

/**
 * Where the Sessions view can show in an editor window: where AI features and agents are enabled, as for the Agents
 * window, in local windows. Known as the window starts, as for the Chat view, so that its container restores.
 */
export const AgentsViewAvailable: ContextKeyExpression = ContextKeyExpr.and(
	ChatEntitlementContextKeys.Setup.hidden.negate(),
	ChatEntitlementContextKeys.Setup.disabledInWorkspace.negate(),
	ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
	RemoteNameContext.isEqualTo(''),
)!;

/** When the Sessions view shows in an editor window: where it is available, once its shared state has loaded. */
export const AgentsViewWhen: ContextKeyExpression = ContextKeyExpr.and(AgentsViewAvailable, AgentsViewStateReadyContext)!;

/** The view that shows in place of the Sessions view while its shared state loads, so that its container restores. */
export const AGENTS_VIEW_LOADING_VIEW_ID = 'workbench.view.agents.loading';

/** Whether a menu shows for the chat part beside the editor area, such as the More Actions of its editor groups. */
export const InAgentsChatPartContext = new RawContextKey<boolean>('inAgentsChatPart', false, localize('inAgentsChatPart', "Whether the context is the chat part beside the editor area."));
