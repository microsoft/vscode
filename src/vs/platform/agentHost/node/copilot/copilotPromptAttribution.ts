/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createAttributedResult, type ElicitationHandlerResult, type ExitPlanModeResult, type SessionConfig } from '@github/copilot-sdk';
import type { AgentChatInputResponseSource } from '../../common/meta/agentChatInputResponseMeta.js';

type UserInputResponse = Awaited<ReturnType<NonNullable<SessionConfig['onUserInputRequest']>>>;

/**
 * Labels a user-input, plan-review, or elicitation answer that a person gave through the request's UI, refusals
 * included. Any other answer is returned unlabeled: the runtime decides what a labeled answer authorizes, and must
 * never read an automatic one as a person's.
 */
export function attributePromptResult<T extends UserInputResponse | ExitPlanModeResult | ElicitationHandlerResult>(result: T, source: AgentChatInputResponseSource | undefined): T {
	if (source !== 'human_response') {
		return result;
	}
	return createAttributedResult(result, {
		source,
		responseCapability: 'interactive',
		surface: 'sdk',
		outcome: 'prompted_user',
	});
}
