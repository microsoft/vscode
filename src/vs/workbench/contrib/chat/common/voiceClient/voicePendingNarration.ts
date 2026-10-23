/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IVoicePendingQuestion } from './voiceClientService.js';

export function formatQuestionPromptTitle(question: IVoicePendingQuestion, context?: string, questionIndex = 0, questionCount = 1): string {
	const title = question.title.trim();
	if (questionCount > 1) {
		// A form-level message can ask for several fields, but each reply fills only the current field.
		const prompt = localize('voice.questionNumber', "Question {0} of {1}: {2}", questionIndex + 1, questionCount, title);
		return questionIndex === 0
			? localize('voice.oneQuestionAtATime', "Please answer one question at a time. {0}", prompt)
			: prompt;
	}
	const formContext = context?.trim();
	return formContext && formContext !== title
		? localize('voice.questionWithContext', "{0} {1}", formContext, title).trim()
		: title;
}

/** Render the spoken question and choices, optionally preceded by form-level context. Choice ordinals follow the displayed order in the wire payload. */
export function formatQuestionPrompt(question: IVoicePendingQuestion, allowSkip: boolean, context?: string, questionCount = 1): string {
	const parts: string[] = [];
	const title = formatQuestionPromptTitle(question, context, 0, questionCount);
	if (title) {
		parts.push(title);
	}
	if (question.options.length > 0) {
		const choices = question.options.map((option, index) => `${index + 1}, ${option.label}`).join('. ');
		parts.push(`Options: ${choices}.`);
		// Only worth saying when there is something to say it *instead of*. A
		// text question is freeform by definition, so the hint would be noise.
		if (question.allow_freeform) {
			parts.push('You can also give your own answer.');
		}
	}
	if (allowSkip) {
		parts.push('Or say skip.');
	}
	return parts.join(' ');
}
