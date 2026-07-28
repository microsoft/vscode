/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatQuestion, IChatQuestionAnswers } from './chatService.js';

/** An option paired with its position in the question's declared order. */
export interface IOrderedQuestionOption {
	readonly option: { id: string; label: string; value: string };
	readonly originalIndex: number;
}

/**
 * One answer as resolved by the voice backend: concrete option values, never
 * ordinals or labels.
 *
 * The user speaks an ordinal ("the second one"); the backend resolves it against
 * its mirror of this same schema and sends values. Snake_case because these
 * cross the voice websocket verbatim.
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
 * Order a question's options as they are displayed: defaults first, then the
 * rest, each group keeping declared order. Defaults are named by option *id*.
 *
 * This is the single definition of "displayed order" for a carousel. The voice
 * path numbers options for the user from this list, so the widget must render
 * from the same function or the number the user hears stops matching the one
 * they see.
 */
export function getOptionsWithDefaultsFirst(question: IChatQuestion): IOrderedQuestionOption[] {
	const options = question.options ?? [];
	const orderedOptions = options.map((option, index) => ({ option, originalIndex: index }));
	const defaultOptionIds = Array.isArray(question.defaultValue)
		? question.defaultValue
		: (typeof question.defaultValue === 'string' ? [question.defaultValue] : []);

	if (defaultOptionIds.length === 0) {
		return orderedOptions;
	}

	const defaultIds = new Set(defaultOptionIds);
	const defaults: IOrderedQuestionOption[] = [];
	const nonDefaults: IOrderedQuestionOption[] = [];
	for (const item of orderedOptions) {
		if (defaultIds.has(item.option.id)) {
			defaults.push(item);
		} else {
			nonDefaults.push(item);
		}
	}

	return [...defaults, ...nonDefaults];
}

/**
 * Render the canonical spoken form of a question.
 *
 * Mirrors `format_question_prompt` in the voice backend's `session_pending.py`
 * exactly, and is tested against the same fixtures: the client speaks the first
 * question of a form and the backend speaks the rest, so a divergence here is
 * audible as the assistant changing register mid-form. The option numbers are
 * also what the user says back, so they must come from the displayed order.
 */
export function formatQuestionPrompt(question: IChatQuestion, allowSkip: boolean): string {
	const parts: string[] = [];
	const title = (question.title ?? '').trim();
	if (title) {
		parts.push(title);
	}
	const options = getOptionsWithDefaultsFirst(question);
	if (options.length > 0) {
		const choices = options.map(({ option }, index) => `${index + 1}, ${option.label}`).join('. ');
		parts.push(`Options: ${choices}.`);
	}
	if (question.allowFreeformInput) {
		parts.push('You can also give your own answer.');
	}
	if (allowSkip) {
		parts.push('Or say skip.');
	}
	return parts.join(' ');
}

/**
 * Convert backend-resolved answers into carousel answers, or `undefined`.
 *
 * Matching is by exact option `value` only — no ordinals, no labels, no fuzzy
 * matching. The backend already resolved the user's spoken ordinal against its
 * mirror of this schema, so anything that fails to match here means the mirror
 * was stale, and answering a form with a guess is strictly worse than reporting
 * the failure and letting the user hear it. A single unresolvable entry rejects
 * the whole set for the same reason: a half-applied form is not something the
 * user can see went wrong.
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

		if (question.type === 'text') {
			if (answer.value !== undefined || answer.values !== undefined || !freeform) {
				return undefined;
			}
			resolved[question.id] = freeform;
			continue;
		}

		if (freeform !== undefined && !question.allowFreeformInput) {
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
