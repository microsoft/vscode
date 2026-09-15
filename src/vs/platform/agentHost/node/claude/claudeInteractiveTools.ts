/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import type { ChatInputRequestWithPlanReview } from '../../common/agentHostPlanReview.js';
import type { ClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { ChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, type ChatInputOption, type ChatInputQuestion } from '../../common/state/protocol/state.js';
import type { ChatInputAnswer } from '../../common/state/sessionState.js';

/**
 * Pure projections between the Claude SDK's interactive built-in tool
 * inputs/outputs and the agentHost workbench protocol.
 *
 * Phase 7 S3.5. The two interactive tools (`ExitPlanMode`,
 * `AskUserQuestion`) are exempt from the SDK's `permissionMode` auto-
 * approval and always reach `canUseTool`. The agent's job for each is
 * to render a workbench prompt and translate the user's answer back
 * into the SDK's `PermissionResult` shape — this module owns those
 * projections so they can be tested without standing up an agent.
 */

// #region ExitPlanMode

/**
 * Stable action ids offered by the `ExitPlanMode` plan review. Each
 * maps onto the {@link ClaudePermissionMode} the session continues in
 * once the plan is approved.
 */
export const enum ExitPlanModeAction {
	Approve = 'approve',
	ApproveAcceptEdits = 'approveAcceptEdits',
	ApproveBypass = 'approveBypass',
}

// A Map, not a plain object: the looked-up action id is client-provided,
// and object indexing would resolve inherited properties (`constructor`,
// `__proto__`, ...) instead of falling through to the default mode.
const EXIT_PLAN_MODE_ACTION_MODES = new Map<string, ClaudePermissionMode>([
	[ExitPlanModeAction.Approve, 'default'],
	[ExitPlanModeAction.ApproveAcceptEdits, 'acceptEdits'],
	[ExitPlanModeAction.ApproveBypass, 'bypassPermissions'],
]);

/**
 * Derive the plan-review question id from the request id — shared by
 * {@link buildExitPlanModeReviewRequest} and the answer decode in the
 * canUseTool bridge so the two stay in sync.
 */
export function exitPlanModeQuestionId(requestId: string): string {
	return requestId + '-action';
}

/**
 * Build the `ExitPlanMode` plan-review request. Carries the
 * {@link ChatInputRequestWithPlanReview.planReview} payload so the
 * workbench renders the docked plan-review widget (the same one the
 * Copilot agent drives) instead of a plain confirmation card.
 * `planUri`, when a plan-file write was observed, lets the widget
 * open the plan document for inline comments. When the enterprise
 * auto-approve policy is restricted, only the plain Approve action is
 * offered so the review cannot switch the session into an
 * auto-approving mode.
 */
export function buildExitPlanModeReviewRequest(planContent: string, planUri: URI | undefined, requestId: string, policyRestricted: boolean): ChatInputRequestWithPlanReview {
	const questionId = exitPlanModeQuestionId(requestId);
	const title = localize('claude.exitPlanMode.title', "Ready to code?");
	const options: ChatInputOption[] = [
		{
			id: ExitPlanModeAction.Approve,
			label: localize('claude.exitPlanMode.approve', "Approve"),
			description: localize('claude.exitPlanMode.approveDescription', "Approve the plan and continue, approving each action manually."),
		},
	];
	if (!policyRestricted) {
		options.push({
			id: ExitPlanModeAction.ApproveAcceptEdits,
			label: localize('claude.exitPlanMode.approveAcceptEdits', "Approve & Auto-Edit"),
			description: localize('claude.exitPlanMode.approveAcceptEditsDescription', "Auto-accept file edits for the rest of this session. Other tools still prompt for approval."),
		}, {
			id: ExitPlanModeAction.ApproveBypass,
			label: localize('claude.exitPlanMode.approveBypass', "Approve & Bypass Approvals"),
			description: localize('claude.exitPlanMode.approveBypassDescription', "Skip approval prompts for the rest of this session."),
		});
	}
	return withChatInputRequestPurpose<ChatInputRequestWithPlanReview>({
		id: requestId,
		planReview: {
			title,
			content: planContent,
			actions: options.map((option, idx) => ({
				id: option.id,
				label: option.label,
				...(option.description !== undefined ? { description: option.description } : {}),
				...(idx === 0 ? { default: true } : {}),
				// The bypass action enables auto-approval of every tool call;
				// the marker makes the plan widget run the shared Bypass
				// Approvals warning before submitting it.
				...(option.id === ExitPlanModeAction.ApproveBypass ? { permissionLevel: 'bypass' as const } : {}),
			})),
			canProvideFeedback: true,
			answerQuestionId: questionId,
			...(planUri !== undefined ? { planUri: planUri.toString() } : {}),
		},
		questions: [{
			kind: ChatInputQuestionKind.SingleSelect,
			id: questionId,
			title,
			message: localize('claude.exitPlanMode.question', "How would you like to proceed?"),
			required: true,
			options,
			allowFreeformInput: true,
		}],
	}, ChatInputRequestPurpose.PlanReview);
}

/** Decoded outcome of an `ExitPlanMode` plan-review answer. */
export type ExitPlanModeAnswer =
	| { readonly kind: 'approved'; readonly mode: ClaudePermissionMode }
	| { readonly kind: 'feedback'; readonly feedback: string }
	| { readonly kind: 'declined' };

/**
 * Decode the workbench answer for an `ExitPlanMode` review. Mirrors
 * the Copilot agent's `_resolveExitPlanMode`: any non-accept resolves
 * to `declined`; freeform feedback wins over a selected action (the
 * SDK cannot attach a note to an `allow` result, so feedback flows
 * back as a deny and Claude revises the plan); an approved action
 * maps to the permission mode the session continues in, with unknown
 * ids clamped to the default action's mode. An accepted answer with
 * neither a selection nor feedback resolves to `declined`.
 */
export function resolveExitPlanModeAnswer(
	response: ChatInputResponseKind,
	answers: Record<string, ChatInputAnswer> | undefined,
	questionId: string,
): ExitPlanModeAnswer {
	if (response !== ChatInputResponseKind.Accept) {
		return { kind: 'declined' };
	}
	const answer = answers?.[questionId];
	if (!answer || answer.state === ChatInputAnswerState.Skipped) {
		return { kind: 'declined' };
	}
	const value = answer.value;
	let selectedAction: string | undefined;
	let feedback: string | undefined;
	if (value.kind === ChatInputAnswerValueKind.Selected) {
		selectedAction = value.value;
		feedback = value.freeformValues?.find(v => v.trim().length > 0)?.trim();
	} else if (value.kind === ChatInputAnswerValueKind.Text) {
		feedback = value.value.trim() || undefined;
	} else {
		return { kind: 'declined' };
	}
	if (feedback) {
		return { kind: 'feedback', feedback };
	}
	// An accepted answer carrying neither a selection nor feedback (e.g.
	// a whitespace-only freeform submit) is not an approval.
	if (!selectedAction) {
		return { kind: 'declined' };
	}
	// Unknown or malformed ids clamp to the default action's mode.
	return { kind: 'approved', mode: EXIT_PLAN_MODE_ACTION_MODES.get(selectedAction) ?? 'default' };
}

// #endregion

// #region AskUserQuestion

/**
 * Narrowed view of the `AskUserQuestion` SDK input. The SDK delivers
 * questions as `Record<string, unknown>`; we cast (no schema validation
 * — the SDK is the upstream authority) and surface the subset we use.
 */
export interface ParsedAskUserQuestionInput {
	readonly questions: ReadonlyArray<{
		readonly question: string;
		readonly header: string;
		readonly options: ReadonlyArray<{ label: string; description?: string }>;
		readonly multiSelect?: boolean;
		readonly allowFreeformInput?: boolean;
	}>;
}

/**
 * Cast the `AskUserQuestion` SDK input into the typed shape. Returns
 * `undefined` when there are no questions — the agent translates that
 * to a `deny` `PermissionResult`.
 */
export function parseAskUserQuestionInput(input: Record<string, unknown>): ParsedAskUserQuestionInput | undefined {
	const askInput = input as Partial<ParsedAskUserQuestionInput>;
	if (!askInput.questions?.length) {
		return undefined;
	}
	return { questions: askInput.questions };
}

/**
 * Derive the workbench question id for the `idx`-th SDK question.
 * Both {@link buildAskUserSessionInputQuestions} and
 * {@link flattenAskUserAnswers} key into the answers map by this id, so
 * keep the two callers in sync via this helper. Empty-header questions
 * fall back to a positional id so they round-trip; they would
 * otherwise collide on `''`.
 */
function askUserQuestionId(header: string, idx: number): string {
	return header || `q-${idx}`;
}

/**
 * Project the parsed SDK questions into the workbench's
 * {@link ChatInputQuestion} shape. `multiSelect` flips the question
 * kind; the rest of the fields map 1:1.
 */
export function buildAskUserSessionInputQuestions(askInput: ParsedAskUserQuestionInput): ChatInputQuestion[] {
	return askInput.questions.map((q, idx) => {
		const opts: ChatInputOption[] = q.options.map(opt => ({
			id: opt.label,
			label: opt.label,
			...(opt.description !== undefined ? { description: opt.description } : {}),
		}));
		const id = askUserQuestionId(q.header, idx);
		return q.multiSelect
			? {
				id,
				kind: ChatInputQuestionKind.MultiSelect,
				title: q.header,
				message: q.question,
				options: opts,
				allowFreeformInput: q.allowFreeformInput ?? false,
			}
			: {
				id,
				kind: ChatInputQuestionKind.SingleSelect,
				title: q.header,
				message: q.question,
				options: opts,
				allowFreeformInput: q.allowFreeformInput ?? false,
			};
	});
}

/**
 * Re-key the workbench answers from `{questionHeader → ChatInputAnswer}`
 * into the production extension's `Record<questionText, valueString>`
 * contract. Skipped questions and empty answers are dropped; the result
 * is `{}` when nothing was answered. Single-select / multi-select /
 * text answer shapes flatten to a comma-joined string (matching the
 * production extension's wire format).
 */
export function flattenAskUserAnswers(askInput: ParsedAskUserQuestionInput, answers: Record<string, ChatInputAnswer>): Record<string, string> {
	const result: Record<string, string> = {};
	for (let idx = 0; idx < askInput.questions.length; idx++) {
		const q = askInput.questions[idx];
		const a = answers[askUserQuestionId(q.header, idx)];
		if (!a || a.state === ChatInputAnswerState.Skipped) {
			continue;
		}
		const parts: string[] = [];
		const value = a.value;
		if (value.kind === ChatInputAnswerValueKind.Selected) {
			if (value.value) { parts.push(value.value); }
			if (value.freeformValues) { parts.push(...value.freeformValues); }
		} else if (value.kind === ChatInputAnswerValueKind.SelectedMany) {
			parts.push(...value.value);
			if (value.freeformValues) { parts.push(...value.freeformValues); }
		} else if (value.kind === ChatInputAnswerValueKind.Text) {
			parts.push(value.value);
		}
		if (parts.length > 0) {
			result[q.question] = parts.join(', ');
		}
	}
	return result;
}

// #endregion
