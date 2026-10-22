/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IVoicePendingQuestion } from './voiceClientService.js';

/** Render the spoken question and choices, optionally preceded by form-level context. Choice ordinals follow the displayed order in the wire payload. */
export function formatQuestionPrompt(question: IVoicePendingQuestion, allowSkip: boolean, context?: string): string {
	const parts: string[] = [];
	if (context?.trim()) {
		parts.push(context.trim());
	}
	const title = question.title.trim();
	if (title && title !== context?.trim()) {
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
