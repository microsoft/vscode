/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ContextKeyExpr, ContextKeyExpression, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { RemoteNameContext } from '../../../../common/contextkeys.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';

/**
 * Where an editor window can show sessions, such as in the chat part or a sessions list: where AI features and agents are
 * enabled, as for the Agents window, in local windows. Known as the window starts, so that what shows sessions restores.
 */
export const AgentsViewAvailable: ContextKeyExpression = ContextKeyExpr.and(
	ChatEntitlementContextKeys.Setup.hidden.negate(),
	ChatEntitlementContextKeys.Setup.disabledInWorkspace.negate(),
	ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
	RemoteNameContext.isEqualTo(''),
)!;

/** Whether a menu shows for the chat part beside the editor area, such as the More Actions of its editor groups. */
export const InAgentsChatPartContext = new RawContextKey<boolean>('inAgentsChatPart', false, localize('inAgentsChatPart', "Whether the context is the chat part beside the editor area."));
