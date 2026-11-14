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

/** Whether chat needs signing in or setting up before it shows sessions: then the Agents view shows how to, as the Chat view did. */
export const AgentsViewNeedsSetup: ContextKeyExpression = ContextKeyExpr.and(
	ChatEntitlementContextKeys.chatAnonymous.negate(),
	ContextKeyExpr.or(ChatEntitlementContextKeys.Entitlement.signedOut, ChatEntitlementContextKeys.Setup.installed.negate()),
)!;

/** When the Sessions view shows in an editor window: where it is available, unless chat needs signing in or setting up. */
export const AgentsViewWhen: ContextKeyExpression = ContextKeyExpr.and(AgentsViewAvailable, AgentsViewNeedsSetup.negate())!;

export const AGENTS_VIEW_SETUP_VIEW_ID = 'workbench.view.agents.setup';

/** Whether a menu shows for the chat part beside the editor area, such as the More Actions of its editor groups. */
export const InAgentsChatPartContext = new RawContextKey<boolean>('inAgentsChatPart', false, localize('inAgentsChatPart', "Whether the context is the chat part beside the editor area."));
