/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { IChatQuestion, IChatQuestionValidation } from './chatService.js';

/** An option paired with its position in the question's declared order. */
export interface IOrderedQuestionOption {
	readonly option: { id: string; label: string; value: string };
	readonly originalIndex: number;
}

/**
 * Order a question's options as they are displayed: defaults first, then the
 * rest, each group keeping declared order. Defaults are named by option *id*.
 *
 * The voice path numbers options from this list, so the widget must render from
 * the same function or the number the user hears stops matching the one they see.
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
 * The text that represents a question to a reader or a listener.
 *
 * The built-in `askQuestions` tool puts the question itself in `message` and a
 * short header in `title`, so anything that shows or speaks `title` alone shows
 * the header instead of the question.
 */
export function getDisplayedQuestionText(question: IChatQuestion): string | IMarkdownString {
	return question.message ?? question.title;
}

/** Why a value failed a question's validation rules. `limit` carries the bound it broke. */
export type QuestionValidationFailure =
	| { readonly kind: 'minLength' | 'maxLength' | 'minimum' | 'maximum'; readonly limit: number }
	| { readonly kind: 'email' | 'uri' | 'date' | 'dateTime' | 'number' | 'integer' };

/**
 * Check a freeform value against a question's validation rules.
 *
 * The widget words the failure for the screen and the voice path just refuses
 * the answer, so the rules themselves live here: an answer the form would
 * reject on submit must not become acceptable by saying it out loud.
 */
export function findQuestionValidationFailure(value: string, validation: IChatQuestionValidation): QuestionValidationFailure | undefined {
	if (validation.minLength !== undefined && value.length < validation.minLength) {
		return { kind: 'minLength', limit: validation.minLength };
	}
	if (validation.maxLength !== undefined && value.length > validation.maxLength) {
		return { kind: 'maxLength', limit: validation.maxLength };
	}
	switch (validation.format) {
		case 'email':
			if (!value.includes('@')) {
				return { kind: 'email' };
			}
			break;
		case 'uri':
			if (!URL.canParse(value)) {
				return { kind: 'uri' };
			}
			break;
		case 'date':
			if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(new Date(value).getTime())) {
				return { kind: 'date' };
			}
			break;
		case 'date-time':
			if (isNaN(new Date(value).getTime())) {
				return { kind: 'dateTime' };
			}
			break;
	}
	if (validation.isInteger !== undefined || validation.minimum !== undefined || validation.maximum !== undefined) {
		const num = Number(value);
		if (isNaN(num)) {
			return { kind: 'number' };
		}
		if (validation.isInteger && !Number.isInteger(num)) {
			return { kind: 'integer' };
		}
		if (validation.minimum !== undefined && num < validation.minimum) {
			return { kind: 'minimum', limit: validation.minimum };
		}
		if (validation.maximum !== undefined && num > validation.maximum) {
			return { kind: 'maximum', limit: validation.maximum };
		}
	}
	return undefined;
}
