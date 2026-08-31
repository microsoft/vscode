/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendEscapedMarkdownCodeBlockFence, escapeMarkdownSyntaxTokens } from '../../../base/common/htmlContent.js';
import { escape } from '../../../base/common/strings.js';

function escapeMarkdownText(value: string): string {
	return escapeMarkdownSyntaxTokens(escape(value));
}

export function markdownText(value: string): string {
	return escapeMarkdownText(value).replace(/\r?\n/g, ' ');
}

function markdownTableCell(value: string): string {
	return escapeMarkdownText(value)
		.replace(/\r?\n/g, '<br>')
		.replace(/\|/g, '\\|');
}

export function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
	for (const row of rows) {
		if (row.length !== headers.length) {
			throw new Error(`Markdown table row has ${row.length} cells; expected ${headers.length}.`);
		}
	}

	const lines = [
		`| ${headers.map(markdownTableCell).join(' | ')} |`,
		`| ${headers.map(() => '---').join(' | ')} |`,
		...rows.map(row => `| ${row.map(markdownTableCell).join(' | ')} |`)
	];
	return `${lines.join('\n')}\n\n`;
}

export function markdownJsonBlock(value: unknown): string {
	const serialized = JSON.stringify(value ?? {}, null, 2) ?? 'null';
	return `${appendEscapedMarkdownCodeBlockFence(serialized, 'json')}\n\n`;
}

export function markdownDetails(summary: string, content: string): string {
	const safeSummary = escape(summary).replace(/\r?\n/g, ' ');
	return `<details>\n<summary>${safeSummary}</summary>\n\n${content.trimEnd()}\n\n</details>\n\n`;
}
