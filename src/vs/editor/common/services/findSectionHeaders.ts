/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from '../core/range.js';
import { FoldingRules } from '../languages/languageConfiguration.js';
import { isMultilineRegexSource } from '../model/textModelSearch.js';
import { regExpLeadsToEndlessLoop } from '../../../base/common/strings.js';

export interface ISectionHeaderFinderTarget {
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
}

export interface FindSectionHeaderOptions {
	foldingRules?: FoldingRules;
	findRegionSectionHeaders: boolean;
	findMarkSectionHeaders: boolean;
	markSectionHeaderRegex: string;
	/**
	 * The tokens that open and close a block comment in the model's language (e.g. `<!--` and `-->`).
	 * When a mark section header is inside a block comment that closes at the end of the header,
	 * the closing token is comment syntax and not part of the label.
	 */
	blockCommentStartToken?: string;
	blockCommentEndToken?: string;
}

export interface SectionHeader {
	/**
	 * The location of the header text in the text model.
	 */
	range: IRange;
	/**
	 * The section header text.
	 */
	text: string;
	/**
	 * Whether the section header includes a separator line.
	 */
	hasSeparatorLine: boolean;
	/**
	 * This section should be omitted before rendering if it's not in a comment.
	 */
	shouldBeInComments: boolean;
}

const trimDashesRegex = /^-+|-+$/g;

const CHUNK_SIZE = 100;
const MAX_SECTION_LINES = 5;

/**
 * Find section headers in the model.
 *
 * @param model the text model to search in
 * @param options options to search with
 * @returns an array of section headers
 */
export function findSectionHeaders(model: ISectionHeaderFinderTarget, options: FindSectionHeaderOptions): SectionHeader[] {
	let headers: SectionHeader[] = [];
	if (options.findRegionSectionHeaders && options.foldingRules?.markers) {
		const regionHeaders = collectRegionHeaders(model, options);
		headers = headers.concat(regionHeaders);
	}
	if (options.findMarkSectionHeaders) {
		const markHeaders = collectMarkHeaders(model, options);
		headers = headers.concat(markHeaders);
	}
	return headers;
}

function collectRegionHeaders(model: ISectionHeaderFinderTarget, options: FindSectionHeaderOptions): SectionHeader[] {
	const regionHeaders: SectionHeader[] = [];
	const endLineNumber = model.getLineCount();
	const startMarker = options.foldingRules!.markers!.start;
	// 'd' for the indices of a `label` group, without 'g' or 'y' so that every line is matched from its start
	const regex = new RegExp(startMarker.source, startMarker.flags.replace(/[dgy]/g, '') + 'd');
	for (let lineNumber = 1; lineNumber <= endLineNumber; lineNumber++) {
		const lineContent = model.getLineContent(lineNumber);
		const match = regex.exec(lineContent);
		if (match) {
			// The label is the marker's `label` group if it has one, e.g. in `<!-- #region Label -->`,
			// otherwise the text after the marker, e.g. in `// #region Label`
			const labelIndices = match.indices?.groups?.['label'];
			const [labelStart, labelEnd] = labelIndices ?? [match.index + match[0].length, lineContent.length];
			const range = { startLineNumber: lineNumber, startColumn: labelStart + 1, endLineNumber: lineNumber, endColumn: labelEnd + 1 };
			if (range.endColumn > range.startColumn) {
				const sectionHeader = {
					range,
					...getHeaderText(lineContent.substring(labelStart, labelEnd)),
					shouldBeInComments: false
				};
				if (sectionHeader.text || sectionHeader.hasSeparatorLine) {
					regionHeaders.push(sectionHeader);
				}
			}
		}
	}
	return regionHeaders;
}

export function collectMarkHeaders(model: ISectionHeaderFinderTarget, options: FindSectionHeaderOptions): SectionHeader[] {
	const markHeaders: SectionHeader[] = [];
	const endLineNumber = model.getLineCount();

	// Validate regex to prevent infinite loops
	if (!options.markSectionHeaderRegex || options.markSectionHeaderRegex.trim() === '') {
		return markHeaders;
	}

	// Create regex with flags for:
	// - 'd' for indices to get proper match positions
	// - 'm' for multi-line mode so ^ and $ match line starts/ends
	// - 's' for dot-all mode so . matches newlines
	const multiline = isMultilineRegexSource(options.markSectionHeaderRegex);
	const regex = new RegExp(options.markSectionHeaderRegex, `gdm${multiline ? 's' : ''}`);

	// Check if the regex would lead to an endless loop
	if (regExpLeadsToEndlessLoop(regex)) {
		return markHeaders;
	}

	// Process text in overlapping chunks for better performance
	for (let startLine = 1; startLine <= endLineNumber; startLine += CHUNK_SIZE - MAX_SECTION_LINES) {
		const endLine = Math.min(startLine + CHUNK_SIZE - 1, endLineNumber);
		const lines: string[] = [];

		// Collect lines for the current chunk
		for (let i = startLine; i <= endLine; i++) {
			lines.push(model.getLineContent(i));
		}

		const text = lines.join('\n');
		regex.lastIndex = 0;

		let match: RegExpExecArray | null;
		while ((match = regex.exec(text)) !== null) {
			// Calculate which line this match starts on by counting newlines before it
			const precedingText = text.substring(0, match.index);
			const lineOffset = (precedingText.match(/\n/g) || []).length;
			const lineNumber = startLine + lineOffset;

			// Calculate match height to check overlap properly
			const matchLines = match[0].split('\n');
			const matchHeight = matchLines.length;
			const matchEndLine = lineNumber + matchHeight - 1;

			// Calculate start column - need to find the start of the line containing the match
			const lineStartIndex = precedingText.lastIndexOf('\n') + 1;
			const startColumn = match.index - lineStartIndex + 1;

			// Calculate end column - need to handle multi-line matches
			const lastMatchLine = matchLines[matchLines.length - 1];
			const endColumn = matchHeight === 1 ? startColumn + match[0].length : lastMatchLine.length + 1;

			const range = {
				startLineNumber: lineNumber,
				startColumn,
				endLineNumber: matchEndLine,
				endColumn
			};

			let label = (match.groups ?? {})['label'] ?? '';
			let separator = (match.groups ?? {})['separator'] ?? '';
			const { blockCommentStartToken, blockCommentEndToken } = options;
			if (blockCommentStartToken && blockCommentEndToken) {
				// The comment context is determined right before the captured text, because a custom
				// regex may consume the comment start token itself, e.g. `^<!--\s*MARK:\s*(?<label>.*)$`
				const separatorIndices = match.indices?.groups?.['separator'];
				const labelIndices = match.indices?.groups?.['label'];
				const capturesStart = Math.min(separatorIndices?.[0] ?? Number.MAX_SAFE_INTEGER, labelIndices?.[0] ?? Number.MAX_SAFE_INTEGER, match.index + match[0].length);
				const capturesLineStart = capturesStart === 0 ? 0 : text.lastIndexOf('\n', capturesStart - 1) + 1;
				if (isInsideBlockComment(text.substring(capturesLineStart, capturesStart), blockCommentStartToken, blockCommentEndToken)) {
					const capturesAreContiguous = !!separatorIndices && !!labelIndices && separatorIndices[1] === labelIndices[0];
					({ label, separator } = stripBlockCommentEnd(label, separator, blockCommentEndToken, capturesAreContiguous));
				}
			}
			const text2 = label;
			const hasSeparatorLine = separator !== '';

			const sectionHeader = {
				range,
				text: text2,
				hasSeparatorLine,
				shouldBeInComments: true
			};

			if (sectionHeader.text || sectionHeader.hasSeparatorLine) {
				// only push if the previous one doesn't have this same linbe
				if (markHeaders.length === 0 || markHeaders[markHeaders.length - 1].range.endLineNumber < sectionHeader.range.startLineNumber) {
					markHeaders.push(sectionHeader);
				}
			}

			// Move lastIndex past the current match to avoid infinite loop
			regex.lastIndex = match.index + match[0].length;
		}
	}

	return markHeaders;
}

/**
 * Whether the text that precedes the captured header on its line leaves a block comment open,
 * e.g. `<!-- ` in `<!-- MARK: Section -->`, but not `// ` in `// MARK: Regex /foo.*\/`.
 * The tokens are matched in order, so identical start and end tokens (e.g. `"""`) are supported.
 */
function isInsideBlockComment(linePrefix: string, blockCommentStartToken: string, blockCommentEndToken: string): boolean {
	let isOpen = false;
	for (let offset = 0; offset < linePrefix.length;) {
		const token = isOpen ? blockCommentEndToken : blockCommentStartToken;
		const index = linePrefix.indexOf(token, offset);
		if (index === -1) {
			break;
		}
		isOpen = !isOpen;
		offset = index + token.length;
	}
	return isOpen;
}

/**
 * Removes the token that closes the enclosing block comment (e.g. `-->` in `<!-- MARK: Section -->`)
 * from the end of a mark section header.
 */
function stripBlockCommentEnd(label: string, separator: string, blockCommentEndToken: string, capturesAreContiguous: boolean): { label: string; separator: string } {
	const trimmedLabel = label.trimEnd();
	if (trimmedLabel.endsWith(blockCommentEndToken)) {
		return { label: trimmedLabel.substring(0, trimmedLabel.length - blockCommentEndToken.length).trimEnd(), separator };
	}
	const combined = separator + trimmedLabel;
	if (capturesAreContiguous && trimmedLabel.length < blockCommentEndToken.length && combined.endsWith(blockCommentEndToken)) {
		// The token was split across the separator and the label, e.g. `<!-- MARK: -->`
		const remainingSeparator = combined.substring(0, combined.length - blockCommentEndToken.length);
		return { label: '', separator: remainingSeparator.trim() ? remainingSeparator : '' };
	}
	return { label, separator };
}

function getHeaderText(text: string): { text: string; hasSeparatorLine: boolean } {
	text = text.trim();
	const hasSeparatorLine = text.startsWith('-');
	text = text.replace(trimDashesRegex, '');
	return { text, hasSeparatorLine };
}
