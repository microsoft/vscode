/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Markdown constructs used in a document, to learn which ones go along with people leaving the
 * Markdown editor. Only flags and a bucket, never content.
 */
export interface MarkdownDocumentFeatures {
	readonly hasMermaid: boolean;
	readonly hasMath: boolean;
	readonly hasHtmlBlock: boolean;
	readonly hasFrontMatter: boolean;
	readonly hasTable: boolean;
	readonly hasFootnote: boolean;
	readonly hasTaskList: boolean;
	readonly headingCountBucket: '0' | '1-5' | '6-20' | '>20';
}

/** Larger documents are not scanned, to bound the cost. */
export const MAX_SCANNED_DOCUMENT_LENGTH = 100_000;

const fenceRe = /^ {0,3}(`{3,}|~{3,})\s*([\w-]*)/;
const headingRe = /^ {0,3}#{1,6}(\s|$)/;
const htmlBlockRe = /^ {0,3}<(?:[a-zA-Z][\w-]*[\s>/]|!--)/;
const tableSeparatorRe = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
const footnoteDefinitionRe = /^ {0,3}\[\^[^\]\s]+\]:/;
const taskListRe = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s/;
const mathBlockRe = /^ {0,3}\$\$/;
/** Inline `$...$` math as Markdown math plugins parse it: no space inside the dollars and no digit after the closing one, so prices do not count. */
const inlineMathRe = /\\\(|\$[^\s$](?:[^$]*[^\s$])?\$(?!\d)/;

/**
 * Detects Markdown constructs with one pass over the lines. This is a heuristic, not a parse: it
 * skips fenced code but not, for example, indented code blocks.
 */
export function scanMarkdownFeatures(text: string): MarkdownDocumentFeatures {
	let hasMermaid = false, hasMath = false, hasHtmlBlock = false, hasTable = false, hasFootnote = false, hasTaskList = false;
	let headingCount = 0;
	let fence: string | undefined;

	const lines = text.split(/\r?\n/);
	const hasFrontMatter = lines[0] === '---' && lines.indexOf('---', 1) > 0;
	for (const line of lines) {
		const fenceMatch = fenceRe.exec(line);
		if (fence) {
			if (fenceMatch && fenceMatch[1].startsWith(fence[0]) && fenceMatch[1].length >= fence.length && !fenceMatch[2]) {
				fence = undefined;
			}
			continue;
		}
		if (fenceMatch) {
			fence = fenceMatch[1];
			const info = fenceMatch[2].toLowerCase();
			hasMermaid ||= info === 'mermaid';
			hasMath ||= info === 'math' || info === 'latex';
			continue;
		}
		if (headingRe.test(line)) {
			headingCount++;
		}
		hasHtmlBlock ||= htmlBlockRe.test(line);
		hasTable ||= line.includes('-') && tableSeparatorRe.test(line);
		hasFootnote ||= line.includes('[^') && footnoteDefinitionRe.test(line);
		hasTaskList ||= line.includes('[') && taskListRe.test(line);
		hasMath ||= (line.includes('$') || line.includes('\\(')) && (mathBlockRe.test(line) || inlineMathRe.test(line));
	}

	return {
		hasMermaid, hasMath, hasHtmlBlock, hasFrontMatter, hasTable, hasFootnote, hasTaskList,
		headingCountBucket: headingCount === 0 ? '0' : headingCount <= 5 ? '1-5' : headingCount <= 20 ? '6-20' : '>20',
	};
}
