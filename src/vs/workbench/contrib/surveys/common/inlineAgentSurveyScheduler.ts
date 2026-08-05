/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineAgentSurveySurface, InlineAgentSurveyTrigger } from './inlineAgentSurveyService.js';

/**
 * Names of the {@link IWorkbenchAssignmentService} treatments that control the inline agent
 * survey. These are read through `getTreatment()` and are dark by default.
 */
export const InlineAgentSurveyTreatmentName = {
	enabled: 'chat.inlineAgentSurvey.enabled',
	firstResponseProbability: 'chat.inlineAgentSurvey.firstResponseProbability',
	matureResponseProbability: 'chat.inlineAgentSurvey.matureResponseProbability',
	matureMinTimeMs: 'chat.inlineAgentSurvey.matureMinTimeMs',
	matureMinUserTurns: 'chat.inlineAgentSurvey.matureMinUserTurns',
	globalCooldownMs: 'chat.inlineAgentSurvey.globalCooldownMs',
} as const;

/**
 * Resolved and sanitized treatment values. Probabilities are fractions in the inclusive range
 * `[0, 1]`; thresholds are non-negative finite values.
 */
export interface IInlineAgentSurveyTreatments {
	readonly enabled: boolean;
	readonly firstResponseProbability: number;
	readonly matureResponseProbability: number;
	readonly matureMinTimeMs: number;
	readonly matureMinUserTurns: number;
	readonly globalCooldownMs: number;
}

/**
 * Suggested fallbacks applied when the experiment is enabled but a numeric treatment is absent.
 * The master `enabled` flag has no fallback: an unresolved assignment leaves it `false`.
 */
export const InlineAgentSurveyTreatmentFallback = {
	firstResponseProbability: 0.001,
	matureResponseProbability: 0.005,
	matureMinTimeMs: 600000,
	matureMinUserTurns: 5,
	globalCooldownMs: 100000000,
} as const;

/**
 * Raw treatment values as returned from `getTreatment()`. Any value may be `undefined` when the
 * experiment is disabled or the assignment has not resolved.
 */
export interface IInlineAgentSurveyRawTreatments {
	readonly enabled: boolean | undefined;
	readonly firstResponseProbability: number | undefined;
	readonly matureResponseProbability: number | undefined;
	readonly matureMinTimeMs: number | undefined;
	readonly matureMinUserTurns: number | undefined;
	readonly globalCooldownMs: number | undefined;
}

/**
 * Clamps a probability treatment. Non-finite or out-of-range values resolve to the safe disabled
 * value `0`. Absent values fall back to the suggested default before clamping.
 */
export function clampProbability(value: number | undefined, fallback: number): number {
	const resolved = value === undefined ? fallback : value;
	if (typeof resolved !== 'number' || !isFinite(resolved) || resolved < 0 || resolved > 1) {
		return 0;
	}
	return resolved;
}

/**
 * Clamps a threshold treatment to a non-negative finite value, falling back when absent or invalid.
 */
export function clampNonNegative(value: number | undefined, fallback: number): number {
	const safeFallback = (typeof fallback === 'number' && isFinite(fallback) && fallback >= 0) ? fallback : 0;
	if (value === undefined || typeof value !== 'number' || !isFinite(value) || value < 0) {
		return safeFallback;
	}
	return value;
}

/**
 * Resolves raw treatment values into sanitized, clamped values that are safe to compare against
 * `Math.random()`.
 */
export function resolveInlineAgentSurveyTreatments(raw: IInlineAgentSurveyRawTreatments): IInlineAgentSurveyTreatments {
	return {
		enabled: raw.enabled === true,
		firstResponseProbability: clampProbability(raw.firstResponseProbability, InlineAgentSurveyTreatmentFallback.firstResponseProbability),
		matureResponseProbability: clampProbability(raw.matureResponseProbability, InlineAgentSurveyTreatmentFallback.matureResponseProbability),
		matureMinTimeMs: clampNonNegative(raw.matureMinTimeMs, InlineAgentSurveyTreatmentFallback.matureMinTimeMs),
		matureMinUserTurns: clampNonNegative(raw.matureMinUserTurns, InlineAgentSurveyTreatmentFallback.matureMinUserTurns),
		globalCooldownMs: clampNonNegative(raw.globalCooldownMs, InlineAgentSurveyTreatmentFallback.globalCooldownMs),
	};
}

/**
 * Response-scoped facts required to decide whether a survey is eligible, extracted from the actual
 * chat response/session state so the scheduler stays free of chat model dependencies.
 */
export interface IInlineAgentSurveyEligibilityContext {
	/** Which chat surface the response is rendered in. */
	readonly surface: InlineAgentSurveySurface;
	/** Whether the session is backed by a Copilot provider (CLI, Cloud, local/remote agent host, or local Agent mode). */
	readonly isCopilotProvider: boolean;
	/** Whether the request ran in Agent mode. Only enforced for local Editor chat. */
	readonly isAgentMode: boolean;
	/** Number of completed user turns in the session, including this one. */
	readonly completedUserTurns: number;
	/** Elapsed wall-clock time of the chat session in milliseconds. */
	readonly elapsedChatTimeMs: number;
	/** True when this is the latest response in the transcript. */
	readonly isLatestResponse: boolean;
	/** True when the response reached a terminal state without cancellation or error. */
	readonly isTerminalSuccess: boolean;
	/** True when the response produced substantive user-visible output. */
	readonly hasVisibleOutput: boolean;
	/** True while the session is waiting on user input or confirmation. */
	readonly isPendingInput: boolean;
}

/**
 * Returns whether the response passes the fixed eligibility gates that are independent of the
 * probability roll and pacing state.
 */
export function isResponseEligible(context: IInlineAgentSurveyEligibilityContext): boolean {
	if (!context.isCopilotProvider) {
		return false;
	}
	// Local Editor chat additionally requires Agent mode; Agents-window providers imply it.
	if (context.surface === InlineAgentSurveySurface.EditorChat && !context.isAgentMode) {
		return false;
	}
	if (!context.isTerminalSuccess) {
		return false;
	}
	if (!context.hasVisibleOutput) {
		return false;
	}
	if (!context.isLatestResponse) {
		return false;
	}
	if (context.isPendingInput) {
		return false;
	}
	return true;
}

/**
 * Determines which trigger's thresholds this response satisfies, ignoring probability. First-response
 * eligibility is evaluated before mature-session eligibility.
 */
export function selectInlineAgentSurveyTrigger(context: IInlineAgentSurveyEligibilityContext, treatments: IInlineAgentSurveyTreatments): InlineAgentSurveyTrigger | undefined {
	if (context.completedUserTurns <= 1) {
		return InlineAgentSurveyTrigger.FirstResponse;
	}
	if (context.completedUserTurns >= treatments.matureMinUserTurns && context.elapsedChatTimeMs >= treatments.matureMinTimeMs) {
		return InlineAgentSurveyTrigger.Mature;
	}
	return undefined;
}

/**
 * Input for the pure roll decision. `random` is a value in `[0, 1)` (typically `Math.random()`).
 */
export interface IInlineAgentSurveyRollInput {
	readonly treatments: IInlineAgentSurveyTreatments;
	readonly eligibility: IInlineAgentSurveyEligibilityContext;
	readonly now: number;
	readonly lastGlobalImpressionAt: number;
	readonly alreadyImpressedThisChat: boolean;
	readonly random: number;
}

/**
 * Decides whether a survey should be shown for a freshly completed response and, if so, which
 * trigger selected it. Returns `undefined` when the survey should not be shown.
 *
 * This is a pure function: it performs no persistence and no roll bookkeeping. Callers must ensure
 * a given response is only rolled once.
 */
export function rollInlineAgentSurvey(input: IInlineAgentSurveyRollInput): InlineAgentSurveyTrigger | undefined {
	const { treatments, eligibility } = input;
	if (!treatments.enabled) {
		return undefined;
	}
	if (!isResponseEligible(eligibility)) {
		return undefined;
	}
	if (input.alreadyImpressedThisChat) {
		return undefined;
	}
	if (input.now - input.lastGlobalImpressionAt < treatments.globalCooldownMs) {
		return undefined;
	}
	const trigger = selectInlineAgentSurveyTrigger(eligibility, treatments);
	if (trigger === undefined) {
		return undefined;
	}
	const probability = trigger === InlineAgentSurveyTrigger.FirstResponse
		? treatments.firstResponseProbability
		: treatments.matureResponseProbability;
	return input.random < probability ? trigger : undefined;
}
