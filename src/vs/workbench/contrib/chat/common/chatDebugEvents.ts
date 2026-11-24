/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatDebugEvent } from './chatDebugService.js';

/**
 * Checks whether a debug event matches a single text search term.
 * Used by the debug panel filter.
 */
export function debugEventMatchesText(event: IChatDebugEvent, term: string): boolean {
	if (event.kind.toLowerCase().includes(term)) {
		return true;
	}
	switch (event.kind) {
		case 'toolCall':
			return event.toolName.toLowerCase().includes(term)
				|| (event.input?.toLowerCase().includes(term) ?? false)
				|| (event.output?.toLowerCase().includes(term) ?? false);
		case 'modelTurn':
			return (event.model?.toLowerCase().includes(term) ?? false)
				|| (event.requestName?.toLowerCase().includes(term) ?? false);
		case 'generic':
			return event.name.toLowerCase().includes(term)
				|| (event.details?.toLowerCase().includes(term) ?? false)
				|| (event.category?.toLowerCase().includes(term) ?? false);
		case 'subagentInvocation':
			return event.agentName.toLowerCase().includes(term)
				|| (event.description?.toLowerCase().includes(term) ?? false);
		case 'userMessage':
		case 'agentResponse':
			return event.message.toLowerCase().includes(term)
				|| event.sections.some(s => s.name.toLowerCase().includes(term) || s.content.toLowerCase().includes(term));
	}
}

/**
 * Regex used to match `before:` and `after:` timestamp tokens inside filter text.
 */
const timestampTokenPattern = /\b(?:before|after):\d{4}(?:-\d{2}(?:-\d{2}(?:t\d{1,2}(?::\d{2}(?::\d{2})?)?)?)?)?(\b|$)/g;

/**
 * Parse a `before:YYYY[-MM[-DD[THH[:MM[:SS]]]]]` or `after:…` token from
 * free-form filter text. Each component after the year is optional.
 *
 * For `before:`, the timestamp is rounded **up** to the end of the most
 * specific unit given (e.g. `before:2026-03` → end-of-March).
 * For `after:`, the timestamp is the **start** of the most specific unit.
 */
export function parseTimeToken(text: string, prefix: string): number | undefined {
	const regex = new RegExp(`${prefix}:(\\d{4})(?:-(\\d{2})(?:-(\\d{2})(?:t(\\d{1,2})(?::(\\d{2})(?::(\\d{2}))?)?)?)?)?(?!\\w)`);
	const m = regex.exec(text);
	if (!m) {
		return undefined;
	}

	const year = parseInt(m[1], 10);
	const month = m[2] !== undefined ? parseInt(m[2], 10) - 1 : undefined;
	const day = m[3] !== undefined ? parseInt(m[3], 10) : undefined;
	const hour = m[4] !== undefined ? parseInt(m[4], 10) : undefined;
	const minute = m[5] !== undefined ? parseInt(m[5], 10) : undefined;
	const second = m[6] !== undefined ? parseInt(m[6], 10) : undefined;

	if (prefix === 'before') {
		if (second !== undefined) {
			return new Date(year, month!, day!, hour!, minute!, second, 999).getTime();
		} else if (minute !== undefined) {
			return new Date(year, month!, day!, hour!, minute, 59, 999).getTime();
		} else if (hour !== undefined) {
			return new Date(year, month!, day!, hour, 59, 59, 999).getTime();
		} else if (day !== undefined) {
			return new Date(year, month!, day, 23, 59, 59, 999).getTime();
		} else if (month !== undefined) {
			return new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
		} else {
			return new Date(year, 11, 31, 23, 59, 59, 999).getTime();
		}
	} else {
		return new Date(
			year,
			month ?? 0,
			day ?? 1,
			hour ?? 0,
			minute ?? 0,
			second ?? 0,
			0,
		).getTime();
	}
}

/**
 * Strips `before:…` and `after:…` timestamp tokens from filter text,
 * returning only the plain text search portion.
 */
export function stripTimestampTokens(text: string): string {
	return text.replace(timestampTokenPattern, '').trim();
}
