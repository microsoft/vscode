/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findQuestionValidationFailure } from '../chatService/chatQuestionCarouselHelpers.js';
import { IChatQuestion, IChatQuestionAnswers } from '../chatService/chatService.js';

/**
 * One answer as resolved by the voice backend: concrete option values, never
 * the ordinal the user spoke. Snake_case because these cross the voice
 * websocket verbatim.
 */
export interface IBackendQuestionAnswer {
	readonly question_id: string;
	/** Exactly one option value, for a single-select question. */
	readonly value?: string;
	/** Option values, for a multi-select question. */
	readonly values?: string[];
	/** Text-question content, or a freeform fallback on a select. */
	readonly freeform?: string;
}

/**
 * Convert backend-resolved answers into carousel answers, or `undefined`.
 *
 * Matching is by exact option `value` only. The backend already resolved the
 * spoken ordinal against its mirror of this schema, so a failure to match means
 * the mirror was stale. A single unresolvable entry rejects the whole set: a
 * half-applied form is not something the user can see went wrong.
 */
export function resolveQuestionAnswers(
	questions: readonly IChatQuestion[],
	answers: readonly IBackendQuestionAnswer[],
): IChatQuestionAnswers | undefined {
	if (answers.length === 0) {
		return undefined;
	}
	const byId = new Map(questions.map(q => [q.id, q]));
	const resolved: IChatQuestionAnswers = {};
	for (const answer of answers) {
		const question = byId.get(answer.question_id);
		if (!question || Object.hasOwn(resolved, question.id)) {
			return undefined;
		}
		const values = new Set((question.options ?? []).map(o => o.value));
		const freeform = answer.freeform?.trim() || undefined;
		// A value the form would reject on submit must not become acceptable by
		// being spoken instead of typed.
		if (freeform !== undefined && question.validation && findQuestionValidationFailure(freeform, question.validation)) {
			return undefined;
		}

		if (question.type === 'text') {
			if (answer.value !== undefined || answer.values !== undefined || !freeform) {
				return undefined;
			}
			resolved[question.id] = freeform;
			continue;
		}

		// Omitted means allowed, matching the widget and the pending payload.
		if (freeform !== undefined && question.allowFreeformInput === false) {
			return undefined;
		}

		if (question.type === 'singleSelect') {
			if (answer.values !== undefined) {
				return undefined;
			}
			if (answer.value !== undefined) {
				if (!values.has(answer.value)) {
					return undefined;
				}
				resolved[question.id] = {
					selectedValue: answer.value,
					...(freeform ? { freeformValue: freeform } : {}),
				};
				continue;
			}
			if (!freeform) {
				return undefined;
			}
			resolved[question.id] = { freeformValue: freeform };
			continue;
		}

		if (answer.value !== undefined) {
			return undefined;
		}
		const selected = answer.values ?? [];
		if (selected.some(value => !values.has(value))) {
			return undefined;
		}
		if (selected.length === 0 && !freeform) {
			return undefined;
		}
		resolved[question.id] = {
			selectedValues: selected,
			...(freeform ? { freeformValue: freeform } : {}),
		};
	}
	return resolved;
}
