/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const LATEST_REQUEST_LIMIT = 2000;
const FINAL_RESPONSE_LIMIT = 10000;
const MAX_SUGGESTION_CHARS = 160;

const REFUSAL_PREFIX = /^(?:sorry\b|unfortunately\b|my apologies\b|as an ai\b|i\s+apologi[sz]e\b|i\s*(?:am|'m|’m)\s+(?:sorry|unable)\b|i\s*(?:cannot|can't|can’t|won't|won’t)\b)/i;
const GRATITUDE_PREFIX = /^(?:thanks|thank you|thx)\b/i;
const LABEL_PREFIX = /^(?:suggestion|next (?:message|step)|user)\s*[:\-—]\s*/i;
const MARKDOWN_PREFIX = /^(?:[-*+]\s|#{1,6}\s|>\s|```|\d+[.)]\s)/;
const MARKDOWN_WRAPPER = /(?:\*\*|__|~~|`)/;
const ABSTENTION = /^(?:no|none|nothing)\b.*\b(?:suggestion|message|next step)\b/i;
const NO_WHITESPACE_WORD_BOUNDARIES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

export function truncateSuggestionContext(value: string, limit: number): string {
	if (value.length <= limit) {
		return value;
	}

	const marker = '\n...[truncated]...\n';
	if (limit <= marker.length) {
		return value.slice(0, limit);
	}
	const available = limit - marker.length;
	const headLength = Math.ceil(available / 2);
	return value.slice(0, headLength) + marker + value.slice(value.length - (available - headLength));
}

export function createNextUserMessagePrompt(): string {
	return [
		'Predict the single message the user would naturally type next, using the latest user request for intent and the final assistant response for the likely continuation.',
		'Predict what they would actually type, not what they should do.',
		'Do not propose a new task, evaluate the response, thank the assistant, or speak as the assistant.',
		'Prefer a concise request or action over a question. Use a question only when clarification is the natural continuation.',
		'Return one line, 2-12 words, matching the user\'s language. If nothing is strongly implied, return exactly NONE.',
	].join('\n\n');
}

export function createNextUserMessageContext(latestRequest: string, finalResponse: string): { latestRequest: string; finalResponse: string } {
	return {
		latestRequest: truncateSuggestionContext(latestRequest, LATEST_REQUEST_LIMIT),
		finalResponse: truncateSuggestionContext(finalResponse, FINAL_RESPONSE_LIMIT),
	};
}

export function cleanNextUserMessageSuggestion(raw: string): string | undefined {
	let suggestion = raw.trim();
	if (!suggestion || suggestion.toUpperCase() === 'NONE' || suggestion.length > MAX_SUGGESTION_CHARS) {
		return undefined;
	}
	if (/[\r\n]/.test(suggestion) || /[\u0000-\u001F\u007F]/.test(suggestion)) {
		return undefined;
	}

	const first = suggestion.at(0);
	const last = suggestion.at(-1);
	if ((first === last && !!first && /["'`]/.test(first))
		|| (first === '“' && last === '”')
		|| (first === '‘' && last === '’')) {
		suggestion = suggestion.slice(1, -1).trim();
	}
	if (!suggestion || LABEL_PREFIX.test(suggestion) || MARKDOWN_PREFIX.test(suggestion) || MARKDOWN_WRAPPER.test(suggestion) || ABSTENTION.test(suggestion) || REFUSAL_PREFIX.test(suggestion) || GRATITUDE_PREFIX.test(suggestion)) {
		return undefined;
	}
	if (/^(?:\/|@)|```|!\[[^\]]*\]\(|\[[^\]]+\]\([^)]+\)/.test(suggestion)) {
		return undefined;
	}

	const words = Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(suggestion))
		.filter(segment => segment.isWordLike).length;
	if (words >= 2 && words <= 12) {
		return suggestion;
	}
	if (words === 1 && NO_WHITESPACE_WORD_BOUNDARIES.test(suggestion)) {
		const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(suggestion)).length;
		return graphemes >= 2 && graphemes <= 24 ? suggestion : undefined;
	}
	return undefined;
}
