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
const closingFenceRe = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const headingRe = /^ {0,3}#{1,6}(\s|$)/;
const setextUnderlineRe = /^ {0,3}(?:=+|-+)[ \t]*$/;
/** Lines that end a paragraph, so an underline after them is not a Setext heading. */
const nonParagraphRe = /^\s*$|^ {0,3}(?:#|>|[-*+]\s|\d+[.)]\s)/;
const htmlBlockRe = /^ {0,3}<(?:[a-zA-Z][\w-]*[\s>/]|!--)/;
// Whitespace runs are separated by pipes or dashes, so they cannot overlap and backtrack.
const tableSeparatorRe = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+(?:\|[ \t]*)?$/;
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
	let afterParagraphText = false;

	const lines = text.split(/\r?\n/);
	const frontMatterEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
	const hasFrontMatter = frontMatterEnd > 0;
	for (let i = hasFrontMatter ? frontMatterEnd + 1 : 0; i < lines.length; i++) {
		const line = lines[i];
		if (fence) {
			const closingMatch = closingFenceRe.exec(line);
			if (closingMatch && closingMatch[1].startsWith(fence[0]) && closingMatch[1].length >= fence.length) {
				fence = undefined;
			}
			continue;
		}
		const fenceMatch = fenceRe.exec(line);
		if (fenceMatch) {
			fence = fenceMatch[1];
			const info = fenceMatch[2].toLowerCase();
			hasMermaid ||= info === 'mermaid';
			hasMath ||= info === 'math' || info === 'latex';
			afterParagraphText = false;
			continue;
		}
		const isTableSeparator = line.includes('-') && tableSeparatorRe.test(line);
		const isHtmlBlock = htmlBlockRe.test(line);
		if (headingRe.test(line) || (afterParagraphText && setextUnderlineRe.test(line))) {
			headingCount++;
			afterParagraphText = false;
		} else {
			afterParagraphText = !isTableSeparator && !isHtmlBlock && !nonParagraphRe.test(line);
		}
		hasHtmlBlock ||= isHtmlBlock;
		hasTable ||= isTableSeparator;
		hasFootnote ||= line.includes('[^') && footnoteDefinitionRe.test(line);
		hasTaskList ||= line.includes('[') && taskListRe.test(line);
		hasMath ||= (line.includes('$') || line.includes('\\(')) && (mathBlockRe.test(line) || inlineMathRe.test(line));
	}

	return {
		hasMermaid, hasMath, hasHtmlBlock, hasFrontMatter, hasTable, hasFootnote, hasTaskList,
		headingCountBucket: headingCount === 0 ? '0' : headingCount <= 5 ? '1-5' : headingCount <= 20 ? '6-20' : '>20',
	};
}
