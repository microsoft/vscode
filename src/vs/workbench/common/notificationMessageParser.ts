/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILink, parseLinkedText } from '../../base/common/linkedText.js';

export interface ICodeSpan {
	readonly code: string;
}

export type NotificationMessageNode = string | ILink | ICodeSpan;

export function isCodeSpan(node: NotificationMessageNode): node is ICodeSpan {
	return typeof node !== 'string' && 'code' in node;
}

/**
 * Parses a notification message into nodes consisting of plain strings,
 * markdown-style links and inline code spans (single-backtick delimited).
 *
 * Code spans are tokenized before link parsing so that bracket/parenthesis
 * sequences inside backticks are not interpreted as links.
 *
 * Rules:
 * - `code` renders as a code span containing the inner text.
 * - Empty backticks (``) are kept literal.
 * - An unmatched single backtick stays literal.
 * - A backslash-escaped backtick (\`) stays literal (the backslash is dropped).
 */
export function parseNotificationMessage(text: string): NotificationMessageNode[] {
	const result: NotificationMessageNode[] = [];

	let buffer = '';
	let i = 0;

	const flushBuffer = () => {
		if (buffer.length === 0) {
			return;
		}
		// Run link parsing on the accumulated plain text so that links are
		// recognized only outside of code spans.
		for (const node of parseLinkedText(buffer).nodes) {
			result.push(node);
		}
		buffer = '';
	};

	while (i < text.length) {
		const ch = text[i];

		// Backslash-escaped backtick: drop the backslash, keep the backtick literal.
		if (ch === '\\' && text[i + 1] === '`') {
			buffer += '`';
			i += 2;
			continue;
		}

		if (ch === '`') {
			// Look for the next unescaped backtick to close the span.
			let j = i + 1;
			let inner = '';
			let closed = false;
			while (j < text.length) {
				if (text[j] === '\\' && text[j + 1] === '`') {
					inner += '`';
					j += 2;
					continue;
				}
				if (text[j] === '`') {
					closed = true;
					break;
				}
				inner += text[j];
				j++;
			}

			if (!closed) {
				// Unmatched: keep the opening backtick literal.
				buffer += '`';
				i++;
				continue;
			}

			if (inner.length === 0) {
				// Empty backticks: keep them literal.
				buffer += '``';
				i = j + 1;
				continue;
			}

			// Valid code span.
			flushBuffer();
			result.push({ code: inner });
			i = j + 1;
			continue;
		}

		buffer += ch;
		i++;
	}

	flushBuffer();

	return result;
}
