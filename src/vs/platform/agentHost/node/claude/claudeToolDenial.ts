/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deny `message` returned to the SDK when the user declines a tool
 * permission. The SDK surfaces it as the `is_error` tool_result content.
 */
export const CLAUDE_USER_DECLINED_MESSAGE = 'User declined';
/** Deny `message` when the user declines an `ExitPlanMode` plan. */
export const CLAUDE_PLAN_DECLINED_MESSAGE = 'The user declined the plan, maybe ask why?';
/** Deny `message` when the user cancels an `AskUserQuestion` prompt. */
export const CLAUDE_QUESTION_CANCELLED_MESSAGE = 'The user cancelled the question';
/**
 * Prefix of the deny `message` that carries plan-review feedback back
 * to the model. The SDK cannot attach a note to an `allow` result, so
 * plan feedback rides on a deny and Claude revises the plan while
 * staying in plan mode.
 */
export const CLAUDE_PLAN_FEEDBACK_PREFIX = 'The user has feedback on the plan before proceeding:';

/** Build the deny `message` carrying the user's plan feedback. */
export function claudePlanFeedbackMessage(feedback: string): string {
	return `${CLAUDE_PLAN_FEEDBACK_PREFIX}\n\n${feedback}`;
}

/**
 * Classifies a failed tool's result message into a `languageModelToolInvoked`
 * cancellation code (`denied`/`cancelled`), or `undefined` for a genuine tool
 * error. The input is the `message` a denied `canUseTool` returns, which the
 * SDK echoes back as the `is_error` tool_result content — so matching the
 * known deny strings distinguishes a user cancellation from a tool failure.
 */
export function claudeToolDenialCode(message: string): 'denied' | 'cancelled' | undefined {
	if (message.startsWith(CLAUDE_PLAN_FEEDBACK_PREFIX)) {
		return 'denied';
	}
	switch (message) {
		case CLAUDE_USER_DECLINED_MESSAGE:
		case CLAUDE_PLAN_DECLINED_MESSAGE:
			return 'denied';
		case CLAUDE_QUESTION_CANCELLED_MESSAGE:
			return 'cancelled';
		default:
			return undefined;
	}
}
