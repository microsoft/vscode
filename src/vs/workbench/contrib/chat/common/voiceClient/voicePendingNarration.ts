/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IVoicePendingQuestion } from './voiceClientService.js';

/**
 * Render the canonical spoken form of a pending question.
 *
 * Mirrors `format_question_prompt` in the voice backend's `session_pending.py`,
 * against the same fixtures. The client speaks the first question of a form and
 * the backend speaks the rest as it replies to each answer, so a divergence
 * here is audible as the assistant changing register mid-form.
 *
 * It renders the wire shape rather than the carousel, because the numbers it
 * reads out are the ordinals the user says back and the wire shape is where
 * those ordinals were assigned (from the widget's own displayed order, in
 * `_buildPendingPayload`). Numbering the options a second time from a second
 * source is the one way this could tell the user a number that selects
 * something else.
 */
export function formatQuestionPrompt(question: IVoicePendingQuestion, allowSkip: boolean): string {
	const parts: string[] = [];
	const title = question.title.trim();
	if (title) {
		parts.push(title);
	}
	if (question.options.length > 0) {
		const choices = question.options.map(option => `${option.ordinal}, ${option.label}`).join('. ');
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
