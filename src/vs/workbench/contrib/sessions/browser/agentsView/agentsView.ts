/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr, ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { AgentsViewAvailable } from './agentsChatPartContext.js';

export { AgentsViewAvailable, InAgentsChatPartContext } from './agentsChatPartContext.js';

/** The view container of the Sessions view in editor windows. */
export const AGENTS_VIEW_CONTAINER_ID = 'workbench.view.agents';

/** Whether chat needs signing in or setting up before it shows sessions: then the Agents view shows how to, as the Chat view did. */
export const AgentsViewNeedsSetup: ContextKeyExpression = ContextKeyExpr.and(
	ChatEntitlementContextKeys.chatAnonymous.negate(),
	ContextKeyExpr.or(ChatEntitlementContextKeys.Entitlement.signedOut, ChatEntitlementContextKeys.Setup.installed.negate()),
)!;

/** When the Sessions view shows in an editor window: where it is available, unless chat needs signing in or setting up. */
export const AgentsViewWhen: ContextKeyExpression = ContextKeyExpr.and(AgentsViewAvailable, AgentsViewNeedsSetup.negate())!;

export const AGENTS_VIEW_SETUP_VIEW_ID = 'workbench.view.agents.setup';
