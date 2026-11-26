/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatInputAnswerState, ChatInputAnswerValueKind, type ChatInputAnswer, type ChatInputRequest } from '../../state/protocol/channels-chat/state.js';

const ORCHESTRATION_LIMIT_META_KEY = 'vscode.orchestrationLimit';

export const orchestrationLimitQuestionId = 'orchestrationLimit';

export const enum OrchestrationLimitChoice {
	AllowMore = 'allowMore',
	AllowUnlimited = 'allowUnlimited',
	TurnOff = 'turnOff',
	Deny = 'deny',
}

type ChatInputRequestWithMeta = ChatInputRequest & { _meta?: Record<string, unknown> };

/** Marks the question the agent host asks when a session reaches an agent orchestration limit. */
export function withOrchestrationLimitQuestion<T extends ChatInputRequest>(request: T): T {
	return { ...request, _meta: { ...(request as ChatInputRequestWithMeta)._meta, [ORCHESTRATION_LIMIT_META_KEY]: true } };
}

/** Reads the submitted choice of an orchestration limit question; `undefined` for any other request or answer. */
export function readOrchestrationLimitChoice(request: ChatInputRequest, answers: Record<string, ChatInputAnswer> | undefined): OrchestrationLimitChoice | undefined {
	if ((request as ChatInputRequestWithMeta)._meta?.[ORCHESTRATION_LIMIT_META_KEY] !== true) {
		return undefined;
	}
	const answer = answers?.[orchestrationLimitQuestionId];
	if (answer?.state !== ChatInputAnswerState.Submitted || answer.value.kind !== ChatInputAnswerValueKind.Selected) {
		return undefined;
	}
	switch (answer.value.value) {
		case OrchestrationLimitChoice.AllowMore:
		case OrchestrationLimitChoice.AllowUnlimited:
		case OrchestrationLimitChoice.TurnOff:
		case OrchestrationLimitChoice.Deny:
			return answer.value.value;
		default:
			return undefined;
	}
}
