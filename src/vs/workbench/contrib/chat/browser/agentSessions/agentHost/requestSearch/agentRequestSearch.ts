/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentHostRequestSearchEnabledSettingId } from '../../../../../../../platform/agentHost/common/agentService.js';
import { ContextKeyExpr } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';

/** Request search is available when AI features and the Agent Host are, and request search is on. */
export const agentRequestSearchWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	AGENT_HOST_ENABLED_CONTEXT_KEY,
	ContextKeyExpr.equals(`config.${AgentHostRequestSearchEnabledSettingId}`, true),
);
