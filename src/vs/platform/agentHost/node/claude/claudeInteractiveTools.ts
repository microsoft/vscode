/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ConfirmationOptionKind, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, ToolCallStatus, type SessionInputOption, type SessionInputQuestion, type ToolCallPendingConfirmationState } from '../../common/state/protocol/state.js';
import type { SessionInputAnswer } from '../../common/state/sessionState.js';
import { getClaudeToolDisplayName } from './claudeToolDisplay.js';

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
 * Build the {@link ToolCallPendingConfirmationState} card body for the
 * `ExitPlanMode` confirmation. Custom Approve / Deny buttons (no "Allow
 * in this Session") so the approval is never remembered — each plan
 * must be approved on its own merit. Mirrors the production extension's
 * `exitPlanModeHandler.ts`.
 */
export function buildExitPlanModeConfirmationState(input: Record<string, unknown>, toolUseID: string): ToolCallPendingConfirmationState {
	const plan = typeof input.plan === 'string' ? input.plan : '';
	return {
		status: ToolCallStatus.PendingConfirmation,
		toolCallId: toolUseID,
		toolName: 'ExitPlanMode',
		displayName: getClaudeToolDisplayName('ExitPlanMode'),
		invocationMessage: { markdown: plan },
		toolInput: JSON.stringify(input),
		confirmationTitle: localize('claude.exitPlanMode.title', "Ready to code?"),
		options: [
			{ id: 'approve', label: localize('claude.exitPlanMode.approve', "Approve"), kind: ConfirmationOptionKind.Approve },
			{ id: 'deny', label: localize('claude.exitPlanMode.deny', "Deny"), kind: ConfirmationOptionKind.Deny },
		],
	};
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
 * {@link SessionInputQuestion} shape. `multiSelect` flips the question
 * kind; the rest of the fields map 1:1.
 */
export function buildAskUserSessionInputQuestions(askInput: ParsedAskUserQuestionInput): SessionInputQuestion[] {
	return askInput.questions.map((q, idx) => {
		const opts: SessionInputOption[] = q.options.map(opt => ({
			id: opt.label,
			label: opt.label,
			...(opt.description !== undefined ? { description: opt.description } : {}),
		}));
		const id = askUserQuestionId(q.header, idx);
		return q.multiSelect
			? {
				id,
				kind: SessionInputQuestionKind.MultiSelect,
				title: q.header,
				message: q.question,
				options: opts,
				allowFreeformInput: q.allowFreeformInput ?? false,
			}
			: {
				id,
				kind: SessionInputQuestionKind.SingleSelect,
				title: q.header,
				message: q.question,
				options: opts,
				allowFreeformInput: q.allowFreeformInput ?? false,
			};
	});
}

/**
 * Re-key the workbench answers from `{questionHeader → SessionInputAnswer}`
 * into the production extension's `Record<questionText, valueString>`
 * contract. Skipped questions and empty answers are dropped; the result
 * is `{}` when nothing was answered. Single-select / multi-select /
 * text answer shapes flatten to a comma-joined string (matching the
 * production extension's wire format).
 */
export function flattenAskUserAnswers(askInput: ParsedAskUserQuestionInput, answers: Record<string, SessionInputAnswer>): Record<string, string> {
	const result: Record<string, string> = {};
	for (let idx = 0; idx < askInput.questions.length; idx++) {
		const q = askInput.questions[idx];
		const a = answers[askUserQuestionId(q.header, idx)];
		if (!a || a.state === SessionInputAnswerState.Skipped) {
			continue;
		}
		const parts: string[] = [];
		const value = a.value;
		if (value.kind === SessionInputAnswerValueKind.Selected) {
			if (value.value) { parts.push(value.value); }
			if (value.freeformValues) { parts.push(...value.freeformValues); }
		} else if (value.kind === SessionInputAnswerValueKind.SelectedMany) {
			parts.push(...value.value);
			if (value.freeformValues) { parts.push(...value.freeformValues); }
		} else if (value.kind === SessionInputAnswerValueKind.Text) {
			parts.push(value.value);
		}
		if (parts.length > 0) {
			result[q.question] = parts.join(', ');
		}
	}
	return result;
}

// #endregion
