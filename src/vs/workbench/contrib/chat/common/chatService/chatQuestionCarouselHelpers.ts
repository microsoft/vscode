/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { IChatQuestion } from './chatService.js';

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
