/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
	IChatMultiSelectAnswer,
	IChatQuestion,
	IChatQuestionAnswers,
	IChatQuestionAnswerValue,
	IChatSingleSelectAnswer,
} from './chatService.js';

/** A question option paired with its position in the original (unordered) list. */
export type IOrderedQuestionOption = {
	option: { id: string; label: string; value: string };
	originalIndex: number;
};

/**
 * Order a question's options the way the carousel widget displays them: default
 * option(s) first (preserving their relative order), then the rest in original
 * order. Shared by the rendering widget and the voice serializer so the spoken
 * ordinal a user hears matches the on-screen order.
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

/** One answer as forwarded verbatim by the voice backend. */
export interface IBackendQuestionAnswer {
	question_id: string;
	/** Single-choice / text / freeform value (option value, ordinal, or label). */
	value?: string;
	/** Multi-select values (each an option value, ordinal, or label). */
	values?: string[];
}

/** Result of resolving backend answers against the live question parts. */
export interface IResolvedQuestionAnswers {
	answers: IChatQuestionAnswers;
	/** Question ids whose answer could not be resolved to an option or freeform. */
	invalid: string[];
}

/**
 * Match a raw user-supplied token (an option value, a 1-based ordinal in
 * displayed order, or a case-insensitive label) to one of a question's options.
 */
function matchOption(
	ordered: IOrderedQuestionOption[],
	raw: string,
): { id: string; label: string; value: string } | undefined {
	const trimmed = raw.trim();
	const byValue = ordered.find(o => o.option.value === trimmed);
	if (byValue) {
		return byValue.option;
	}
	if (/^\d+$/.test(trimmed)) {
		const ordinal = Number(trimmed);
		if (ordinal >= 1 && ordinal <= ordered.length) {
			return ordered[ordinal - 1].option;
		}
	}
	const lower = trimmed.toLowerCase();
	const byLabel = ordered.find(o => o.option.label.toLowerCase() === lower);
	return byLabel?.option;
}

/** Either a resolved typed answer or a signal that the token(s) didn't resolve. */
type AnswerResolution =
	| { ok: true; answer: IChatQuestionAnswerValue }
	| { ok: false };

/** Resolve a free-text question: the raw value is taken verbatim. */
function resolveTextAnswer(backend: IBackendQuestionAnswer): AnswerResolution {
	return { ok: true, answer: backend.value ?? '' };
}

/** Resolve a single-select question by option match, then freeform fallback. */
function resolveSingleSelectAnswer(
	ordered: IOrderedQuestionOption[],
	allowFreeform: boolean,
	backend: IBackendQuestionAnswer,
): AnswerResolution {
	const raw = backend.value ?? '';
	const opt = matchOption(ordered, raw);
	if (opt) {
		return { ok: true, answer: { selectedValue: opt.value } satisfies IChatSingleSelectAnswer };
	}
	if (allowFreeform && raw.trim() !== '') {
		return { ok: true, answer: { freeformValue: raw } satisfies IChatSingleSelectAnswer };
	}
	return { ok: false };
}

/** Resolve a multi-select question, collecting matched options plus one freeform. */
function resolveMultiSelectAnswer(
	ordered: IOrderedQuestionOption[],
	allowFreeform: boolean,
	backend: IBackendQuestionAnswer,
): AnswerResolution {
	const rawValues = backend.values ?? (backend.value ? [backend.value] : []);
	const selectedValues: string[] = [];
	let freeformValue: string | undefined;
	for (const raw of rawValues) {
		const opt = matchOption(ordered, raw);
		if (opt) {
			if (!selectedValues.includes(opt.value)) {
				selectedValues.push(opt.value);
			}
		} else if (allowFreeform && raw.trim() !== '') {
			freeformValue = raw;
		}
	}
	if (selectedValues.length === 0 && freeformValue === undefined) {
		return { ok: false };
	}
	return {
		ok: true,
		answer: {
			selectedValues,
			...(freeformValue !== undefined ? { freeformValue } : {}),
		} satisfies IChatMultiSelectAnswer,
	};
}

/**
 * Resolve the backend's verbatim answers into the typed `IChatQuestionAnswers`
 * shape the chat carousel expects, keyed by the live question id.
 *
 * Resolution is deterministic: each token is matched against the question's
 * options by value, then 1-based ordinal (in displayed order), then label. When
 * nothing matches and the question allows freeform input the token is kept as a
 * freeform answer; otherwise the question id is reported in `invalid` so the
 * backend can narrate a correction instead of silently submitting a bad value.
 */
export function resolveQuestionAnswers(
	questions: readonly IChatQuestion[],
	backendAnswers: readonly IBackendQuestionAnswer[],
): IResolvedQuestionAnswers {
	const answers: IChatQuestionAnswers = {};
	const invalid: string[] = [];
	const byId = new Map(questions.map(q => [q.id, q]));

	for (const backend of backendAnswers) {
		const question = byId.get(backend.question_id);
		if (!question) {
			invalid.push(backend.question_id);
			continue;
		}
		const ordered = getOptionsWithDefaultsFirst(question);
		const allowFreeform = question.allowFreeformInput ?? false;

		const resolved = question.type === 'text'
			? resolveTextAnswer(backend)
			: question.type === 'singleSelect'
				? resolveSingleSelectAnswer(ordered, allowFreeform, backend)
				: resolveMultiSelectAnswer(ordered, allowFreeform, backend);

		if (resolved.ok) {
			answers[question.id] = resolved.answer;
		} else {
			invalid.push(question.id);
		}
	}

	return { answers, invalid };
}

/**
 * Map a resolved answer record to the value a carousel is dismissed/completed
 * with. An empty record means the user answered nothing (a skip): agent-host
 * carousels treat `undefined` answers as a cancel/skip, whereas an empty object
 * would be submitted as an (empty) accept. Returning `undefined` keeps the two
 * intents distinct.
 */
export function toCarouselAnswers(answers: IChatQuestionAnswers): IChatQuestionAnswers | undefined {
	return Object.keys(answers).length > 0 ? answers : undefined;
}
