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
	/**
	 * Number of oracle edits dropped because they fell outside the edit window.
	 * Only meaningful for the `EditWindowOnly` format; `0` (or absent) otherwise.
	 */
	readonly droppedEditCount?: number;
}

/**
 * Logger used by response generation to report non-fatal data-quality issues
 * (e.g. oracle edits dropped because they fell outside the edit window).
 */
export type ResponseLogger = (message: string) => void;

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
 * Return the 0-based start/end line numbers (inclusive) for an edit's
 * `[start, endEx)` offset range in the document represented by `transformer`.
 */
function getEditLineRange(
	transformer: ReturnType<StringText['getTransformer']>,
	edit: readonly [start: number, endEx: number, text: string],
): [startLine: number, endLine: number] {
	const [start, endEx] = edit;
	return [
		transformer.getPosition(start).lineNumber - 1,
		transformer.getPosition(endEx).lineNumber - 1,
	];
}

/** Count `\n` characters in `s` over the half-open range `[start, endEx)`. */
function countNewlines(s: string, start: number, endEx: number): number {
	let n = 0;
	for (let i = start; i < endEx; i++) {
		if (s.charCodeAt(i) === 10 /* \n */) {
			n++;
		}
	}
	return n;
}

/**
 * Filter `oracleEdits` to those fully contained in the line range `[windowStart, windowEnd)`.
 *
 * Oracle edits come from `StringEdit.compose().replacements` upstream
 * ({@link applyEditsToContent} sorts by offset descending and applies to the
 * original doc), so each edit's offsets are independent of every other edit.
 * Each edit is therefore filtered independently — out-of-window edits are
 * dropped without affecting the in-window ones around them.
 */
export function filterEditsInsideEditWindow(
	oracleEdits: readonly (readonly [start: number, endEx: number, text: string])[],
	docContent: string,
	windowStart: number,
	windowEnd: number,
): {
	kept: readonly (readonly [start: number, endEx: number, text: string])[];
	droppedCount: number;
} {
	const transformer = new StringText(docContent).getTransformer();
	const kept: (readonly [start: number, endEx: number, text: string])[] = [];
	let droppedCount = 0;
	for (const edit of oracleEdits) {
		const [editStartLine, editEndLine] = getEditLineRange(transformer, edit);
		const fullyInside = editStartLine >= windowStart && editEndLine < windowEnd;
		if (fullyInside) {
			kept.push(edit);
		} else {
			droppedCount++;
		}
	}
	return { kept, droppedCount };
}

/**
 * Format edits as Xtab275 edit-window content.
 *
 * The NES model can only edit lines inside the prompt's `<|code_to_edit|>`
 * window `[K, N)`. Oracle edits outside that range are unrepresentable in this
 * response format — including them would cause the assistant text to "spill
 * out" of the window and duplicate surrounding context when applied. Such
 * edits are discarded via {@link filterEditsInsideEditWindow}.
 *
 * @returns
 *   - `assistant`: the edit-window slice of the document with all kept edits
 *     applied, joined by `\n`. Empty string if every oracle edit was dropped.
 *   - `droppedCount`: number of oracle edits discarded because they fell
 *     outside the window (or followed an edit that did). `0` when all edits
 *     were kept. Callers should surface non-zero values so dataset curators
 *     can spot silent data loss.
 */
export function formatAsEditWindowOnly(
	oracleEdits: readonly (readonly [start: number, endEx: number, text: string])[],
	docContent: string,
	editWindowStartLine: number,
	editWindowLineCount: number,
): { assistant: string; droppedCount: number } {
	const windowStart = editWindowStartLine;
	const windowEnd = editWindowStartLine + editWindowLineCount;

	const { kept, droppedCount } = filterEditsInsideEditWindow(
		oracleEdits, docContent, windowStart, windowEnd,
	);

	const modifiedContent = applyEditsToContent(docContent, kept);
	const modifiedLines = splitLines(modifiedContent);

	// All kept edits are fully inside the window, so each edit's net line
	// delta applies directly to the window's line count. We compute the delta
	// by counting newlines: replacing text containing N newlines with text
	// containing M newlines changes the document's line count by `M - N`.
	let netLineChange = 0;
	for (const [start, endEx, text] of kept) {
		const oldNewlines = countNewlines(docContent, start, endEx);
		const newNewlines = countNewlines(text, 0, text.length);
		netLineChange += newNewlines - oldNewlines;
	}

	const newEndLine = Math.min(windowEnd + netLineChange, modifiedLines.length);
	const windowLines = modifiedLines.slice(windowStart, newEndLine);

	return { assistant: windowLines.join('\n'), droppedCount };
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
	log?: ResponseLogger,
): IGeneratedResponse | { error: string } {
	if (!edits || edits.length === 0) {
		return { error: `No edits available (file: ${filePath})` };
	}

	switch (responseFormat) {
		case ResponseFormat.CustomDiffPatch:
			return generateCustomDiffPatchResponse(edits, docContent, filePath);
		case ResponseFormat.EditWindowOnly:
			return generateEditWindowOnlyResponse(edits, docContent, filePath, userPrompt, log);
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
	log?: ResponseLogger,
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

	const { assistant, droppedCount } = formatAsEditWindowOnly(edits, docContent, startLine, lineCount);

	if (droppedCount > 0) {
		log?.(`[${filePath}] dropped ${droppedCount}/${edits.length} oracle edit(s) outside edit window [${startLine}, ${startLine + lineCount})`);
	}

	if (!assistant || !assistant.trim()) {
		return { error: `formatAsEditWindowOnly produced empty result (file: ${filePath}, ${edits.length} edits, ${droppedCount} dropped, window: ${startLine}+${lineCount})` };
	}
	return { assistant, droppedEditCount: droppedCount };
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
	log?: ResponseLogger,
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
			log,
		);
		if ('error' in result) {
			errors.push({ index: input.index, error: result.error });
		} else {
			responses.push({ index: input.index, response: result });
		}
	}

	return { responses, errors };
}
