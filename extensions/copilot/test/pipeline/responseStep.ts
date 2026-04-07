/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResponseFormat } from '../../src/platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { assertNever } from '../../src/util/vs/base/common/assert';
import { splitLines } from '../../src/util/vs/base/common/strings';
import { StringText } from '../../src/util/vs/editor/common/core/text/abstractText';

export interface IGeneratedResponse {
	readonly assistant: string;
}

/**
 * Apply offset-based edits to document content.
 * Edits are sorted by offset descending so earlier positions remain valid.
 */
export function applyEditsToContent(
	content: string,
	edits: readonly (readonly [start: number, endEx: number, text: string])[],
): string {
	const sorted = [...edits].sort((a, b) => b[0] - a[0]);
	let result = content;
	for (const [start, endEx, text] of sorted) {
		result = result.substring(0, start) + text + result.substring(endEx);
	}
	return result;
}

/**
 * Format edits as PatchBased02 custom diff patches.
 * Applies all edits to get the final document, then does a line-level diff
 * and groups consecutive changed lines into `filename:linenum\n-old\n+new` patches.
 */
export function formatAsCustomDiffPatch(
	oracleEdits: readonly (readonly [start: number, endEx: number, text: string])[],
	docContent: string,
	filePath: string,
): string {
	const modifiedContent = applyEditsToContent(docContent, oracleEdits);

	const oldLines = splitLines(docContent);
	const newLines = splitLines(modifiedContent);

	const patches: string[] = [];
	const maxLen = Math.max(oldLines.length, newLines.length);

	let i = 0;
	while (i < maxLen) {
		const oldLine = i < oldLines.length ? oldLines[i] : undefined;
		const newLine = i < newLines.length ? newLines[i] : undefined;

		if (oldLine === newLine) {
			i++;
			continue;
		}

		// Collect the full run of changed lines
		const startLine = i;
		const removedLines: string[] = [];
		const addedLines: string[] = [];

		while (i < maxLen) {
			const ol = i < oldLines.length ? oldLines[i] : undefined;
			const nl = i < newLines.length ? newLines[i] : undefined;

			if (ol === nl) {
				break;
			}

			if (ol !== undefined) {
				removedLines.push(ol);
			}
			if (nl !== undefined) {
				addedLines.push(nl);
			}
			i++;
		}

		// PatchBased02 handler requires both removed and added lines
		if (removedLines.length > 0 && addedLines.length > 0) {
			patches.push([
				`${filePath}:${startLine}`,
				...removedLines.map(l => `-${l}`),
				...addedLines.map(l => `+${l}`),
			].join('\n'));
		} else if (removedLines.length > 0) {
			patches.push([
				`${filePath}:${startLine}`,
				...removedLines.map(l => `-${l}`),
				`+`,
			].join('\n'));
		} else if (addedLines.length > 0) {
			// Pure insertion — use previous line as anchor
			const anchorLine = startLine > 0 ? oldLines[startLine - 1] : '';
			patches.push([
				`${filePath}:${Math.max(0, startLine - 1)}`,
				`-${anchorLine}`,
				`+${anchorLine}`,
				...addedLines.map(l => `+${l}`),
			].join('\n'));
		}
	}

	return patches.join('\n');
}

/**
 * Parse the edit window content from a generated user prompt.
 * Looks for content between `<|code_to_edit|>` and `<|/code_to_edit|>` tags.
 */
export function parseEditWindowFromPrompt(userPrompt: string): {
	/** The raw lines between the tags (may include line numbers) */
	lines: string[];
	/** Number of lines in the edit window */
	lineCount: number;
} | undefined {
	const startTag = '<|code_to_edit|>';
	const endTag = '<|/code_to_edit|>';

	const startIdx = userPrompt.indexOf(startTag);
	const endIdx = userPrompt.indexOf(endTag);

	if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
		return undefined;
	}

	const windowContent = userPrompt.substring(startIdx + startTag.length, endIdx);
	const lines = windowContent.split('\n');

	// Trim leading/trailing empty lines from tag placement
	while (lines.length > 0 && lines[0].trim() === '') {
		lines.shift();
	}
	while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
		lines.pop();
	}

	return { lines, lineCount: lines.length };
}

/**
 * Format edits as Xtab275 edit-window content.
 * Applies edits and re-extracts the edit window lines,
 * adjusting for line count changes within the window.
 */
export function formatAsEditWindowOnly(
	oracleEdits: readonly (readonly [start: number, endEx: number, text: string])[],
	docContent: string,
	editWindowStartLine: number,
	editWindowLineCount: number,
): string {
	const transformer = new StringText(docContent).getTransformer();
	let windowStart = editWindowStartLine;
	let windowEnd = editWindowStartLine + editWindowLineCount;

	// Ensure the window covers all oracle edits
	for (const [start, endEx] of oracleEdits) {
		const editStartLine = transformer.getPosition(start).lineNumber - 1;
		const editEndLine = transformer.getPosition(endEx).lineNumber - 1;
		if (editStartLine < windowStart) {
			windowStart = editStartLine;
		}
		if (editEndLine >= windowEnd) {
			windowEnd = editEndLine + 1;
		}
	}

	const modifiedContent = applyEditsToContent(docContent, oracleEdits);
	const modifiedLines = splitLines(modifiedContent);

	// Calculate net line change from edits overlapping the window
	let netLineChange = 0;
	for (const [start, endEx, text] of oracleEdits) {
		const editStartLine = transformer.getPosition(start).lineNumber - 1;
		const editEndLine = transformer.getPosition(endEx).lineNumber - 1;

		if (editStartLine < windowEnd && editEndLine >= windowStart) {
			const oldLineCount = splitLines(docContent.substring(start, endEx)).length;
			const newLineCount = text.length > 0 ? splitLines(text).length : 0;
			const effectiveOldCount = (endEx - start) === 0 ? 0 : oldLineCount;
			netLineChange += newLineCount - effectiveOldCount;
		}
	}

	const newEndLine = Math.min(windowEnd + netLineChange, modifiedLines.length);
	const windowLines = modifiedLines.slice(windowStart, newEndLine);

	return windowLines.join('\n');
}

/**
 * Find the edit window start line by matching the edit window content from the
 * prompt against the document content.
 */
export function findEditWindowStartLine(
	docContent: string,
	editWindowLines: string[],
): number {
	if (editWindowLines.length === 0) {
		return 0;
	}

	const docLines = splitLines(docContent);

	// Strip line numbers and <|cursor|> tags for matching against document content
	const cleanedWindowLines = editWindowLines.map(stripLineNumber);
	const cursorTag = '<|cursor|>';
	const matchLines = cleanedWindowLines.map(l => l.replace(cursorTag, ''));

	const firstWindowLine = matchLines[0];
	for (let i = 0; i <= docLines.length - matchLines.length; i++) {
		if (docLines[i] === firstWindowLine) {
			// Check if all subsequent lines match
			let allMatch = true;
			for (let j = 1; j < matchLines.length; j++) {
				if (docLines[i + j] !== matchLines[j]) {
					allMatch = false;
					break;
				}
			}
			if (allMatch) {
				return i;
			}
		}
	}

	// Fallback: try to extract line number from the first edit window line
	const lineNumMatch = editWindowLines[0].match(/^(\d+)\|\s?/);
	if (lineNumMatch) {
		return parseInt(lineNumMatch[1], 10) - 1; // Convert 1-based to 0-based
	}

	return 0;
}

function stripLineNumber(line: string): string {
	const match = line.match(/^\d+\|\s?/);
	if (match) {
		return line.substring(match[0].length);
	}
	return line;
}

/**
 * Format edits as the expected assistant response for the given response format.
 *
 * Only CustomDiffPatch and EditWindowOnly are supported.
 */
export function generateResponse(
	responseFormat: ResponseFormat,
	edits: readonly (readonly [start: number, endEx: number, text: string])[] | undefined,
	docContent: string,
	filePath: string,
	userPrompt: string,
): IGeneratedResponse | { error: string } {
	if (!edits || edits.length === 0) {
		return { error: `No edits available (file: ${filePath})` };
	}

	switch (responseFormat) {
		case ResponseFormat.CustomDiffPatch:
			return generateCustomDiffPatchResponse(edits, docContent, filePath);
		case ResponseFormat.EditWindowOnly:
			return generateEditWindowOnlyResponse(edits, docContent, filePath, userPrompt);
		case ResponseFormat.UnifiedWithXml:
		case ResponseFormat.CodeBlock:
		case ResponseFormat.EditWindowWithEditIntent:
		case ResponseFormat.EditWindowWithEditIntentShort:
			return { error: `Unsupported response format: ${responseFormat}` };
		default:
			assertNever(responseFormat);
	}
}

function generateCustomDiffPatchResponse(
	edits: readonly (readonly [start: number, endEx: number, text: string])[],
	docContent: string,
	filePath: string,
): IGeneratedResponse | { error: string } {
	const assistant = formatAsCustomDiffPatch(edits, docContent, filePath);
	if (!assistant) {
		return { error: `formatAsCustomDiffPatch produced empty result (file: ${filePath}, ${edits.length} edits)` };
	}
	return { assistant };
}

function generateEditWindowOnlyResponse(
	edits: readonly (readonly [start: number, endEx: number, text: string])[],
	docContent: string,
	filePath: string,
	userPrompt: string,
): IGeneratedResponse | { error: string } {
	const editWindow = parseEditWindowFromPrompt(userPrompt);

	let startLine: number;
	let lineCount: number;

	if (editWindow) {
		startLine = findEditWindowStartLine(docContent, editWindow.lines);
		lineCount = editWindow.lineCount;
	} else {
		const transformer = new StringText(docContent).getTransformer();
		const editStartLine = transformer.getPosition(edits[0][0]).lineNumber - 1;
		const lastEdit = edits[edits.length - 1];
		const editEndLine = transformer.getPosition(lastEdit[1]).lineNumber - 1;
		const editSpan = editEndLine - editStartLine + 1;
		const padding = Math.max(10, Math.floor(editSpan * 0.5));
		const docLines = splitLines(docContent);
		startLine = Math.max(0, editStartLine - padding);
		lineCount = Math.min(editSpan + padding * 2, docLines.length - startLine);
	}

	const assistant = formatAsEditWindowOnly(edits, docContent, startLine, lineCount);
	if (!assistant || !assistant.trim()) {
		return { error: `formatAsEditWindowOnly produced empty result (file: ${filePath}, ${edits.length} edits, window: ${startLine}+${lineCount})` };
	}
	return { assistant };
}

export interface IResponseGenerationInput {
	readonly index: number;
	readonly oracleEdits: readonly (readonly [start: number, endEx: number, text: string])[] | undefined;
	readonly docContent: string;
	readonly filePath: string;
	readonly userPrompt: string;
}

export function generateAllResponses(
	responseFormat: ResponseFormat,
	inputs: readonly IResponseGenerationInput[],
): {
	responses: { index: number; response: IGeneratedResponse }[];
	errors: { index: number; error: string }[];
} {
	const responses: { index: number; response: IGeneratedResponse }[] = [];
	const errors: { index: number; error: string }[] = [];

	for (const input of inputs) {
		const result = generateResponse(
			responseFormat,
			input.oracleEdits, input.docContent, input.filePath,
			input.userPrompt,
		);
		if ('error' in result) {
			errors.push({ index: input.index, error: result.error });
		} else {
			responses.push({ index: input.index, response: result });
		}
	}

	return { responses, errors };
}
