/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { t } from '@vscode/l10n';
import { realpath } from 'fs/promises';
import { homedir } from 'os';
import type { LanguageModelChat, PreparedToolInvocation } from 'vscode';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICustomInstructionsService } from '../../../platform/customInstructions/common/customInstructionsService';
import { IDiffService } from '../../../platform/diff/common/diffService';
import { NotebookDocumentSnapshot } from '../../../platform/editing/common/notebookDocumentSnapshot';
import { OffsetLineColumnConverter } from '../../../platform/editing/common/offsetLineColumnConverter';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { IAlternativeNotebookContentService } from '../../../platform/notebook/common/alternativeContent';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { getLanguageId } from '../../../util/common/markdown';
import { findNotebook } from '../../../util/common/notebooks';
import * as glob from '../../../util/vs/base/common/glob';
import { ResourceMap, ResourceSet } from '../../../util/vs/base/common/map';
import { Schemas } from '../../../util/vs/base/common/network';
import { isMacintosh, isWindows } from '../../../util/vs/base/common/platform';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../util/vs/base/common/resources';
import { isFalsyOrWhitespace } from '../../../util/vs/base/common/strings';
import { isDefined } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { Position as EditorPosition } from '../../../util/vs/editor/common/core/position';
import { ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { EndOfLine, Position, Range, TextEdit } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { formatUriForFileWidget } from '../common/toolUtils';

// Simplified Hunk type for the patch
interface Hunk {
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: string[];
}

/**
 * Base class for edit errors
 */
export class EditError extends Error {
	constructor(message: string, public readonly kindForTelemetry: string) {
		super(message);
	}
}

/**
 * Error thrown when no match is found for a string replacement
 */
export class NoMatchError extends EditError {
	constructor(message: string, public readonly file: string) {
		super(message, 'noMatchFound');
	}
}

/**
 * Error thrown when multiple matches are found for a string replacement
 */
export class MultipleMatchesError extends EditError {
	constructor(message: string, public readonly file: string) {
		super(message, 'multipleMatchesFound');
	}
}

/**
 * Error thrown when the edit would result in no changes
 */
export class NoChangeError extends EditError {
	constructor(message: string, public readonly file: string) {
		super(message, 'noChange');
	}
}

/**
 * Error thrown when there are issues with the content format
 */
export class ContentFormatError extends EditError {
	constructor(message: string, public readonly file: string) {
		super(message, 'contentFormatError');
	}
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Formats a diff computed by IDiffService as a unified diff string.
 * Lines starting with '-' are removed, lines starting with '+' are added.
 * Context lines (unchanged) are prefixed with a space.
 * This outputs the entire file with all changes marked.
 */
export async function formatDiffAsUnified(accessor: ServicesAccessor, uri: URI, oldContent: string, newContent: string): Promise<string> {
	if (oldContent.trim() === newContent.trim()) {
		return '```\n<' + t('contents are identical') + '>\n```';
	}

	const diffService = accessor.get(IDiffService);
	const diff = await diffService.computeDiff(oldContent, newContent, {
		ignoreTrimWhitespace: false,
		maxComputationTimeMs: 20000,
		computeMoves: false,
	});

	const result: string[] = [
		'```diff:' + getLanguageId(uri),
		`<vscode_codeblock_uri>${uri.toString()}</vscode_codeblock_uri>`
	];
	const oldLines = oldContent.split('\n');
	const newLines = newContent.split('\n');

	let oldLineIdx = 0;
	let newLineIdx = 0;

	for (const change of diff.changes) {
		const originalStart = change.original.startLineNumber - 1; // Convert to 0-based
		const originalEnd = change.original.endLineNumberExclusive - 1;
		const modifiedStart = change.modified.startLineNumber - 1;
		const modifiedEnd = change.modified.endLineNumberExclusive - 1;

		// Add all unchanged lines before this change
		while (oldLineIdx < originalStart) {
			result.push(`  ${oldLines[oldLineIdx]}`);
			oldLineIdx++;
			newLineIdx++;
		}

		// Add removed lines
		for (let i = originalStart; i < originalEnd; i++) {
			result.push(`- ${oldLines[i]}`);
			oldLineIdx++;
		}

		// Add added lines
		for (let i = modifiedStart; i < modifiedEnd; i++) {
			result.push(`+ ${newLines[i]}`);
			newLineIdx++;
		}
	}

	// Add any remaining unchanged lines after all changes
	while (oldLineIdx < oldLines.length) {
		result.push(`  ${oldLines[oldLineIdx]}`);
		oldLineIdx++;
	}

	result.push('```');
	return result.join('\n');
}

/**
 * Calculates the similarity ratio between two strings using Levenshtein distance.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
function calculateSimilarity(str1: string, str2: string): number {
	if (str1 === str2) { return 1.0; }
	if (str1.length === 0) { return 0.0; }
	if (str2.length === 0) { return 0.0; }

	// Calculate Levenshtein distance
	const matrix: number[][] = [];
	for (let i = 0; i <= str1.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= str2.length; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= str1.length; i++) {
		for (let j = 1; j <= str2.length; j++) {
			const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1, // deletion
				matrix[i][j - 1] + 1, // insertion
				matrix[i - 1][j - 1] + cost // substitution
			);
		}
	}

	const distance = matrix[str1.length][str2.length];
	const maxLength = Math.max(str1.length, str2.length);
	// Return similarity ratio (1 - normalized distance)
	return 1 - distance / maxLength;
}

interface MatchResultCommon {
	type: string;
	/** Resulting document text */
	text: string;
	/** Array of [startIndex, endIndex] to replace in the file content */
	editPosition: { start: number; end: number; text: string }[];
	/** Model suggestion to correct a fialing match */
	suggestion?: string;
}

/**
 * Type-safe union type for match results with discriminated unions
 */
type MatchResult = MatchResultCommon & (
	| { text: string; type: 'none'; suggestion?: string }
	| { text: string; type: 'exact' }
	| { text: string; type: 'fuzzy' }
	| { text: string; type: 'whitespace' }
	| { text: string; type: 'similarity'; suggestion: string; similarity: number }
	| { text: string; type: 'multiple'; suggestion: string; matchPositions: number[]; strategy: 'exact' | 'fuzzy' | 'whitespace' }
);

/**
 * Enhanced version of findAndReplaceOne with more robust matching strategies
 * and better error information.
 *
 * @param text The source text to search in
 * @param oldStr The string to find and replace
 * @param newStr The replacement string
 * @returns An object with the new text, match type, and additional match information
 */
export function findAndReplaceOne(
	text: string,
	oldStr: string,
	newStr: string,
	eol: string,
): MatchResult {
	// Strategy 1: Try exact match first (fastest)
	const exactResult = tryExactMatch(text, oldStr, newStr);
	if (exactResult.type !== 'none') {
		return exactResult;
	}

	// Strategy 2: Try whitespace-flexible matching
	const whitespaceResult = tryWhitespaceFlexibleMatch(text, oldStr, newStr, eol);
	if (whitespaceResult.type !== 'none') {
		return whitespaceResult;
	}

	// Strategy 3: Try line-by-line fuzzy matching
	const fuzzyResult = tryFuzzyMatch(text, oldStr, newStr, eol);
	if (fuzzyResult.type !== 'none') {
		return fuzzyResult;
	}

	// Strategy 4: Try similarity-based matching as last resort
	const similarityResult = trySimilarityMatch(text, oldStr, newStr, eol);
	if (similarityResult.type !== 'none') {
		return similarityResult;
	}

	// No matches found with any strategy
	return {
		text,
		type: 'none',
		editPosition: [],
		suggestion: `Try making your search string more specific or checking for whitespace/formatting differences.`
	};
}

/**
 * Tries to find an exact match of oldStr in text.
 */
function tryExactMatch(text: string, oldStr: string, newStr: string): MatchResult {
	const matchPositions: number[] = [];
	for (let searchIdx = 0; ;) {
		const idx = text.indexOf(oldStr, searchIdx);
		if (idx === -1) { break; }
		matchPositions.push(idx);
		searchIdx = idx + oldStr.length;
	}
	if (matchPositions.length === 0) {
		return { text, editPosition: [], type: 'none' };
	}

	const identical = getIdenticalChars(oldStr, newStr);
	const editPosition = matchPositions.map(idx => ({
		start: idx + identical.leading,
		end: idx + oldStr.length - identical.trailing,
		text: newStr.slice(identical.leading, newStr.length - identical.trailing)
	}));

	// Check for multiple exact occurrences.
	if (matchPositions.length > 1) {
		return {
			text,
			type: 'multiple',
			editPosition,
			strategy: 'exact',
			matchPositions,
			suggestion: 'Multiple exact matches found. Make your search string more specific.'
		};
	}
	// Exactly one exact match found.
	const firstExactIdx = matchPositions[0];
	const replaced = text.slice(0, firstExactIdx) + newStr + text.slice(firstExactIdx + oldStr.length);
	return {
		text: replaced,
		type: 'exact',
		editPosition,
	};
}

/**
 * Tries to match using flexible whitespace handling.
 */
function tryWhitespaceFlexibleMatch(text: string, oldStr: string, newStr: string, eol: string): MatchResult {
	const haystack = text.split(eol).map(line => line.trim());
	const oldLines = oldStr.trim().split(eol);
	const needle = oldLines.map(line => line.trim());
	needle.push(''); // trailing newline to match until the end of a line

	const convert = new OffsetLineColumnConverter(text);
	const matchedLines: number[] = [];
	for (let i = 0; i <= haystack.length - needle.length; i++) {
		if (haystack.slice(i, i + needle.length).join('\n') === needle.join('\n')) {
			matchedLines.push(i);
			i += needle.length - 1;
		}
	}
	if (matchedLines.length === 0) {
		return {
			text,
			editPosition: [],
			type: 'none',
			suggestion: 'No whitespace-flexible match found.'
		};
	}


	const newLines = newStr.trim().split(eol);
	const identical = getIndenticalLines(oldLines, newLines);
	const positions = matchedLines.map(match => {
		const start = new EditorPosition(match + identical.leading + 1, 1);
		const end = start.delta(oldLines.length - identical.trailing);
		return { start, end };
	});

	if (matchedLines.length > 1) {
		return {
			text,
			type: 'multiple',
			editPosition: [],
			matchPositions: positions.map(p => convert.positionToOffset(p.start)),
			suggestion: 'Multiple matches found with flexible whitespace. Make your search string more unique.',
			strategy: 'whitespace',
		};
	}

	const { start, end } = positions[0];
	const startIdx = convert.positionToOffset(start);
	const endIdx = convert.positionToOffset(end) - 1; // -1 to include the last EOL

	const minimizedNewStr = newLines.slice(identical.leading, newLines.length - identical.trailing).join(eol);
	const replaced = text.slice(0, startIdx) + minimizedNewStr + text.slice(endIdx);
	return {
		text: replaced,
		editPosition: [{ start: startIdx, end: endIdx, text: minimizedNewStr }],
		type: 'whitespace',
	};
}

/**
 * Tries to match using the traditional fuzzy approach with line-by-line matching.
 */
function tryFuzzyMatch(text: string, oldStr: string, newStr: string, eol: string): MatchResult {
	// Handle trailing newlines
	const hasTrailingLF = oldStr.endsWith(eol);
	if (hasTrailingLF) {
		oldStr = oldStr.slice(0, -eol.length);
	}

	// Build a regex pattern where each line is matched exactly
	// but allows for trailing spaces/tabs and flexible newline formats
	const oldLines = oldStr.split(eol);
	const pattern = oldLines
		.map((line, i) => {
			const escaped = escapeRegex(line);
			return i < oldLines.length - 1 || hasTrailingLF
				? `${escaped}[ \\t]*\\r?\\n`
				: `${escaped}[ \\t]*`;
		})
		.join('');
	const regex = new RegExp(pattern, 'g');

	const matches = Array.from(text.matchAll(regex));
	if (matches.length === 0) {
		return {
			text,
			editPosition: [],
			type: 'none',
			suggestion: 'No fuzzy match found.'
		};
	}
	if (matches.length > 1) {
		return {
			text,
			type: 'multiple',
			editPosition: [],
			suggestion: 'Multiple fuzzy matches found. Try including more context in your search string.',
			strategy: 'fuzzy',
			matchPositions: matches.map(match => match.index || 0),
		};
	}

	// Exactly one fuzzy match found
	const match = matches[0];
	const startIdx = match.index || 0;
	const endIdx = startIdx + match[0].length;
	const replaced = text.slice(0, startIdx) + newStr + text.slice(endIdx);
	return {
		text: replaced,
		type: 'fuzzy',
		editPosition: [{ start: startIdx, end: endIdx, text: newStr }],
	};
}

let defaultSimilaryMatchThreshold = 0.95;

export function setSimilarityMatchThresholdForTests(threshold: number) {
	const old = defaultSimilaryMatchThreshold;
	defaultSimilaryMatchThreshold = threshold;
	return old;
}

/**
 * Tries to match based on overall string similarity as a last resort.
 * Only works for relatively small strings to avoid performance issues.
 */
function trySimilarityMatch(text: string, oldStr: string, newStr: string, eol: string, threshold: number = defaultSimilaryMatchThreshold): MatchResult {
	// Skip similarity matching for very large strings or too many lines
	if (oldStr.length > 1000 || oldStr.split(eol).length > 20) {
		return { text, editPosition: [], type: 'none' };
	}

	const lines = text.split(eol);
	const oldLines = oldStr.split(eol);

	// Don't try similarity matching for very large files
	if (lines.length > 1000) {
		return { text, editPosition: [], type: 'none' };
	}

	const newLines = newStr.split(eol);
	const identical = getIndenticalLines(oldLines, newLines);

	let bestMatch = { startLine: -1, startOffset: 0, oldLength: 0, similarity: 0 };
	let startOffset = 0;

	// Sliding window approach to find the best matching section
	for (let i = 0; i <= lines.length - oldLines.length; i++) {
		let totalSimilarity = 0;
		let oldLength = 0;

		// Calculate similarity for each line in the window
		let startOffsetIdenticalIncr = 0;
		let endOffsetIdenticalIncr = 0;
		for (let j = 0; j < oldLines.length; j++) {
			const similarity = calculateSimilarity(oldLines[j], lines[i + j]);
			totalSimilarity += similarity;
			oldLength += lines[i + j].length;

			if (j < identical.leading) {
				startOffsetIdenticalIncr += lines[i + j].length + eol.length;
			}
			if (j >= oldLines.length - identical.trailing) {
				endOffsetIdenticalIncr += lines[i + j].length + eol.length;
			}
		}

		const avgSimilarity = totalSimilarity / oldLines.length;
		if (avgSimilarity > threshold && avgSimilarity > bestMatch.similarity) {
			bestMatch = {
				startLine: i + identical.leading,
				startOffset: startOffset + startOffsetIdenticalIncr,
				similarity: avgSimilarity,
				oldLength: oldLength + (oldLines.length - 1) * eol.length - startOffsetIdenticalIncr - endOffsetIdenticalIncr,
			};
		}

		startOffset += lines[i].length + eol.length;
	}

	if (bestMatch.startLine === -1) {
		return { text, editPosition: [], type: 'none' };
	}

	// Replace the matched section
	const newStrMinimized = newLines.slice(identical.leading, newLines.length - identical.trailing).join(eol);
	const matchStart = bestMatch.startLine - identical.leading;
	const afterIdx = matchStart + oldLines.length - identical.trailing;

	const newText = [
		...lines.slice(0, bestMatch.startLine),
		...newLines.slice(identical.leading, newLines.length - identical.trailing),
		...lines.slice(afterIdx),
	].join(eol);

	return {
		text: newText,
		type: 'similarity',
		editPosition: [{
			start: bestMatch.startOffset,
			end: bestMatch.startOffset + bestMatch.oldLength,
			text: newStrMinimized,
		}],
		similarity: bestMatch.similarity,
		suggestion: `Used similarity matching (${(bestMatch.similarity * 100).toFixed(1)}% similar). Verify the replacement.`
	};
}

// Function to generate a simple patch
function getPatch({ fileContents, oldStr, newStr }: { fileContents: string; oldStr: string; newStr: string }): Hunk[] {
	// Simplified patch generation - in a real implementation this would generate proper diff hunks
	return [{
		oldStart: 1,
		oldLines: (oldStr.match(/\n/g) || []).length + 1,
		newStart: 1,
		newLines: (newStr.match(/\n/g) || []).length + 1,
		lines: []
	}];
}

/** Gets the number of identical leading and trailing lines between two arrays of strings */
function getIndenticalLines(a: string[], b: string[]) {
	let leading = 0;
	let trailing = 0;
	while (leading < a.length &&
		leading < b.length &&
		a[leading] === b[leading]) {
		leading++;
	}
	while (trailing + leading < a.length &&
		trailing + leading < b.length &&
		a[a.length - 1 - trailing] === b[b.length - 1 - trailing]) {
		trailing++;
	}

	return { leading, trailing };
}

/** Gets the number of identical leading and trailing characters between two strings */
function getIdenticalChars(oldString: string, newString: string) {
	let leading = 0;
	let trailing = 0;

	while (leading < oldString.length && leading < newString.length && oldString[leading] === newString[leading]) {
		leading++;
	}
	while (trailing + leading < oldString.length && trailing + leading < newString.length &&
		oldString[oldString.length - trailing - 1] === newString[newString.length - trailing - 1]) {
		trailing++;
	}
	return { leading, trailing };
}

// Apply string edit function
export async function applyEdit(
	uri: URI,
	old_string: string,
	new_string: string,
	workspaceService: IWorkspaceService,
	notebookService: INotebookService,
	alternativeNotebookContent: IAlternativeNotebookContentService,
	languageModel: LanguageModelChat | undefined,
	opts?: { replaceAll?: boolean },
): Promise<{ patch: Hunk[]; updatedFile: string; edits: TextEdit[] }> {
	let originalFile: string;
	let updatedFile: string;
	const edits: TextEdit[] = [];
	const filePath = uri.toString();

	try {
		// Use VS Code workspace API to get the document content
		const document = notebookService.hasSupportedNotebooks(uri) ?
			await workspaceService.openNotebookDocumentAndSnapshot(uri, alternativeNotebookContent.getFormat(languageModel)) :
			await workspaceService.openTextDocumentAndSnapshot(uri);
		originalFile = document.getText();

		const eol = document instanceof TextDocumentSnapshot && document.eol === EndOfLine.CRLF ? '\r\n' : '\n';
		old_string = old_string.replace(/\r?\n/g, eol);
		new_string = new_string.replace(/\r?\n/g, eol);

		if (isFalsyOrWhitespace(originalFile) && isFalsyOrWhitespace(old_string)) {
			updatedFile = new_string;
			edits.push(TextEdit.insert(new Position(0, 0), new_string));
		} else if (old_string === '') {
			if (originalFile !== '') {
				// If the file already exists and we're creating a new file with empty old_string
				throw new ContentFormatError('File already exists. Please provide a non-empty old_string for replacement.', filePath);
			}
			// Create new file case
			updatedFile = new_string;
			edits.push(TextEdit.insert(new Position(0, 0), new_string));
		} else {
			// Edit existing file case
			if (new_string === '') {
				// For empty new string, handle special deletion case
				const result = findAndReplaceOne(originalFile, old_string, new_string, eol);
				if (result.type === 'none') {
					// Try with newline appended if the original doesn't end with newline
					if (!old_string.endsWith(eol) && originalFile.includes(old_string + eol)) {
						updatedFile = originalFile.replace(old_string + eol, new_string);

						if (result.editPosition.length) {
							const { start, end } = result.editPosition[0];
							const range = new Range(document.positionAt(start), document.positionAt(end));
							edits.push(TextEdit.delete(range));
						}
					} else {
						const suggestion = result?.suggestion || 'The string to replace must match exactly.';
						throw new NoMatchError(
							`Could not find matching text to replace. ${suggestion}`,
							filePath
						);
					}
				} else if (result.type === 'multiple' && !opts?.replaceAll) {
					const suggestion = result?.suggestion || 'Please provide a more specific string.';
					throw new MultipleMatchesError(
						`Multiple matches found for the text to replace. ${suggestion}`,
						filePath
					);
				} else {
					updatedFile = result.text;

					for (const { start, end } of result.editPosition) {
						const range = new Range(document.positionAt(start), document.positionAt(end));
						edits.push(TextEdit.delete(range));
					}
				}
			} else {
				// Normal replacement case using the enhanced matcher
				const result = findAndReplaceOne(originalFile, old_string, new_string, eol);

				if (result.type === 'none') {
					const suggestion = result?.suggestion || 'The string to replace must match exactly or be a valid fuzzy match.';
					throw new NoMatchError(
						`Could not find matching text to replace. ${suggestion}`,
						filePath
					);
				} else if (result.type === 'multiple' && !opts?.replaceAll) {
					const suggestion = result?.suggestion || 'Please provide a more specific string.';
					throw new MultipleMatchesError(
						`Multiple matches found for the text to replace. ${suggestion}`,
						filePath
					);
				} else {
					updatedFile = result.text;

					for (const { start, end, text } of result.editPosition) {
						const range = new Range(document.positionAt(start), document.positionAt(end));
						edits.push(TextEdit.replace(range, text));
					}

					// If we used similarity matching, add a warning
					if (result.type === 'similarity' && result?.similarity) {
						console.warn(`Used similarity matching with ${(result.similarity * 100).toFixed(1)}% confidence. Verify the result is correct.`);
					}
				}
			}

			if (updatedFile === originalFile) {
				throw new NoChangeError(
					'Original and edited file match exactly. Failed to apply edit. Use the ${ToolName.ReadFile} tool to re-read the file and and determine the correct edit.',
					filePath
				);
			}
		}

		// Generate a simple patch
		const patch = getPatch({
			fileContents: originalFile,
			oldStr: originalFile,
			newStr: updatedFile,
		});

		return { patch, updatedFile, edits };
	} catch (error) {
		// If the file doesn't exist and we're creating a new file with empty oldString
		if (old_string === '' && error.code === 'ENOENT') {
			originalFile = '';
			updatedFile = new_string;

			const patch = getPatch({
				fileContents: originalFile,
				oldStr: originalFile,
				newStr: updatedFile,
			});

			edits.push(TextEdit.insert(new Position(0, 0), new_string));
			return { patch, updatedFile, edits };
		}

		if (error instanceof EditError) {
			throw error;
		} else {
			throw new EditError(`Failed to edit file: ${error.stack || error.message}`, 'unknownError');
		}
	}
}

const ALWAYS_CHECKED_EDIT_PATTERNS: Readonly<Record<string, boolean>> = {
	'**/.vscode/*.json': false,
};

const allPlatformPatterns: (glob.ParsedPattern | string)[] = [
	glob.parse(homedir() + '/.*'),
	glob.parse(homedir() + '/.*/**'),
];

const specializedPatterns: (glob.ParsedPattern | string | undefined)[] =
	isWindows
		? [process.env.APPDATA, process.env.LOCALAPPDATA]
		: isMacintosh
			? [homedir() + '/Library']
			: [];

// Path prefixes under which confirmation is unconditionally required
const platformConfirmationRequiredPaths = specializedPatterns.filter(isDefined).concat(allPlatformPatterns);

/**
 * Validates that a path doesn't contain suspicious characters that could be used
 * to bypass security checks on Windows (e.g., NTFS Alternate Data Streams, invalid chars).
 * Throws an error if the path is suspicious.
 */
export function assertPathIsSafe(fsPath: string, _isWindows = isWindows): void {
	if (fsPath.includes('\0')) {
		throw new Error(`Path contains null bytes: ${fsPath}`);
	}

	if (!_isWindows) {
		return;
	}

	// Check for NTFS Alternate Data Streams (ADS)
	const colonIndex = fsPath.indexOf(':', 2);
	if (colonIndex !== -1) {
		throw new Error(`Path contains invalid characters (alternate data stream): ${fsPath}`);
	}

	// Check for invalid Windows filename characters
	const invalidChars = /[<>"|?*]/;
	const pathAfterDrive = fsPath.length > 2 ? fsPath.substring(2) : fsPath;
	if (invalidChars.test(pathAfterDrive)) {
		throw new Error(`Path contains invalid characters: ${fsPath}`);
	}

	// Check for named pipes or device paths
	if (fsPath.startsWith('\\\\.') || fsPath.startsWith('\\\\?')) {
		throw new Error(`Path is a reserved device path: ${fsPath}`);
	}

	const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

	// Check for trailing dots and spaces on path components (Windows quirk)
	const parts = fsPath.split('\\');
	for (const part of parts) {
		if (part.length === 0) {
			continue;
		}

		// Reserved device names. Would error on edit, but fail explicitly
		if (reserved.test(part)) {
			throw new Error(`Reserved device name in path: ${fsPath}`);
		}

		// Check for trailing dots or spaces
		if (part.endsWith('.') || part.endsWith(' ')) {
			throw new Error(`Path contains invalid trailing characters: ${fsPath}`);
		}

		// Check for 8.3 short filename pattern
		const tildeIndex = part.indexOf('~');
		if (tildeIndex !== -1) {
			const afterTilde = part.substring(tildeIndex + 1);
			if (afterTilde.length > 0 && /^\d/.test(afterTilde)) {
				throw new Error(`Path appears to use short filename format (8.3 names): ${fsPath}. Please use the full path.`);
			}
		}
	}
}

export const enum ConfirmationCheckResult {
	NoConfirmation,
	NoPermissions,
	Sensitive,
	SystemFile,
	OutsideWorkspace,
}


/**
 * Returns a function that returns whether a URI is approved for editing without
 * further user confirmation.
 */
export function makeUriConfirmationChecker(configuration: IConfigurationService, getWorkspaceFolder: (resource: URI) => URI | undefined, customInstructionsService: ICustomInstructionsService) {
	const patterns = configuration.getNonExtensionConfig<Record<string, boolean>>('chat.tools.edits.autoApprove');
	const hookFilesLocations = configuration.getNonExtensionConfig<Record<string, boolean>>('chat.hookFilesLocations');

	// Convert hook files locations to require confirmation (isApproved: false)
	const hookFilesPatterns: Record<string, boolean> = {};
	if (hookFilesLocations) {
		for (const pattern of Object.keys(hookFilesLocations)) {
			// Skip home directory patterns as they are handled separately
			if (!pattern.startsWith('~/')) {
				// Ensure patterns have proper glob prefix to match within workspace
				const normalizedPattern = pattern.startsWith('**/') || pattern.startsWith('/') ? pattern : '**/' + pattern;
				hookFilesPatterns[normalizedPattern] = false;
				// If the pattern looks like a folder (no file extension), also match JSON files within it
				const lastSegment = normalizedPattern.split('/').pop() || '';
				if (!lastSegment.includes('.')) {
					const folderJsonPattern = normalizedPattern.endsWith('/') ? normalizedPattern + '*.json' : normalizedPattern + '/*.json';
					hookFilesPatterns[folderJsonPattern] = false;
				}
			}
		}
	}

	const checks = new ResourceMap<{ patterns: { pattern: glob.ParsedPattern; isApproved: boolean }[]; ignoreCasing: boolean }>();
	const getPatterns = (wf: URI) => {
		let arr = checks.get(wf);
		if (arr) {
			return arr;
		}

		const ignoreCasing = extUriBiasedIgnorePathCase.ignorePathCasing(wf);
		arr = { patterns: [], ignoreCasing };
		for (const obj of [patterns, ALWAYS_CHECKED_EDIT_PATTERNS, hookFilesPatterns]) {
			if (obj) {
				for (const [pattern, isApproved] of Object.entries(obj)) {
					arr.patterns.push({ pattern: glob.parse({ base: wf.fsPath, pattern: ignoreCasing ? pattern.toLowerCase() : pattern }), isApproved });
				}
			}
		}

		checks.set(wf, arr);
		return arr;
	};

	function checkUri(uri: URI) {
		const normalizedUri = normalizePath(uri);
		const workspaceFolder = getWorkspaceFolder(normalizedUri);
		if (!workspaceFolder && uri.scheme !== Schemas.untitled) { // don't allow to edit external instruction files
			return ConfirmationCheckResult.OutsideWorkspace;
		}

		let ok = true;
		let fsPath = uri.fsPath;

		assertPathIsSafe(fsPath);

		const platformCheckFailed = platformConfirmationRequiredPaths.some(p => {
			if (typeof p === 'function') {
				return p(fsPath);
			}

			const parentURI = URI.file(p);
			if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, parentURI)) {
				// If the workspace is opened in the restricted folder, still allow edits within that workspace
				return workspaceFolder && extUriBiasedIgnorePathCase.isEqualOrParent(workspaceFolder, parentURI) ? false : true;
			}

			return false;
		});

		if (platformCheckFailed) {
			return ConfirmationCheckResult.SystemFile;
		}

		const { patterns, ignoreCasing } = getPatterns(workspaceFolder || URI.file('/'));
		if (ignoreCasing) {
			fsPath = fsPath.toLowerCase();
		}

		for (const { pattern, isApproved } of patterns) {
			if (isApproved !== ok && pattern(fsPath)) {
				ok = isApproved;
			}
		}

		return ok ? ConfirmationCheckResult.NoConfirmation : ConfirmationCheckResult.Sensitive;
	}

	return async (uri: URI) => {
		const toCheck = [normalizePath(uri)];
		if (uri.scheme === Schemas.file) {
			try {
				const linked = await realpath(uri.fsPath);
				assertPathIsSafe(linked);

				if (linked !== uri.fsPath) {
					toCheck.push(URI.file(linked));
				}
			} catch (e) {
				if ((e as NodeJS.ErrnoException).code === 'EPERM') {
					return ConfirmationCheckResult.NoPermissions;
				}
				// Usually EPERM or ENOENT on the linkedFile
			}
		}

		return Math.max(...toCheck.map(checkUri));
	};
}

export async function createEditConfirmation(accessor: ServicesAccessor, uris: readonly URI[], allowedUris: ResourceSet | undefined, detailMessage?: (urisNeedingConfirmation: readonly URI[]) => Promise<string>, forceConfirmationReason?: string, getWorkspaceFolder?: (resource: URI) => URI | undefined): Promise<PreparedToolInvocation> {
	// If forceConfirmationReason is provided, require confirmation for all URIs
	if (forceConfirmationReason) {
		const details = detailMessage ? await detailMessage(uris) : undefined;

		return {
			confirmationMessages: {
				title: t('Allow edits?'),
				message: forceConfirmationReason + '\n\n' + t`Do you want to allow this?` + (details ? '\n\n' + details : ''),
			},
			presentation: 'hiddenAfterComplete'
		};
	}

	const workspaceService = accessor.get(IWorkspaceService);
	getWorkspaceFolder = getWorkspaceFolder ?? workspaceService.getWorkspaceFolder.bind(workspaceService);
	const checker = makeUriConfirmationChecker(accessor.get(IConfigurationService), getWorkspaceFolder, accessor.get(ICustomInstructionsService));
	const needsConfirmation = (await Promise.all(uris
		.map(async uri => ({ uri, reason: await checker(uri) }))
	)).filter(r => r.reason !== ConfirmationCheckResult.NoConfirmation && !allowedUris?.has(r.uri));

	if (!needsConfirmation.length) {
		return { presentation: 'hidden' };
	}

	const fileParts = needsConfirmation.map(({ uri }) => formatUriForFileWidget(uri)).join(', ');

	let message: string;
	if (needsConfirmation.some(r => r.reason === ConfirmationCheckResult.NoPermissions)) {
		message = t`The model wants to edit files you don't have permission to modify (${fileParts}).`;
	} else if (needsConfirmation.some(r => r.reason === ConfirmationCheckResult.Sensitive)) {
		message = t`The model wants to edit sensitive files (${fileParts}).`;
	} else if (needsConfirmation.some(r => r.reason === ConfirmationCheckResult.OutsideWorkspace)) {
		message = t`The model wants to edit files outside of your workspace (${fileParts}).`;
	} else {
		message = t`The model wants to edit system files (${fileParts}).`;
	}

	const urisNeedingConfirmation = needsConfirmation.map(c => c.uri);
	const details = detailMessage ? await detailMessage(urisNeedingConfirmation) : undefined;

	return {
		confirmationMessages: {
			title: t('Allow edits to sensitive files?'),
			message: message + ' ' + t`Do you want to allow this?` + (details ? '\n\n' + details : ''),
		},
		presentation: 'hiddenAfterComplete'
	};
}

/** Returns whether the file can be edited. This is true if the file exists or it's opened (e.g. untitled files) */
export function canExistingFileBeEdited(accessor: ServicesAccessor, uri: URI): Promise<boolean> {
	const workspace = accessor.get(IWorkspaceService);
	if (workspace.textDocuments.some(d => extUriBiasedIgnorePathCase.isEqual(d.uri, uri))) {
		return Promise.resolve(true);
	}
	if (workspace.notebookDocuments.some(d => extUriBiasedIgnorePathCase.isEqual(d.uri, uri))) {
		return Promise.resolve(true);
	}

	const fileSystemService = accessor.get(IFileSystemService);
	return fileSystemService.stat(uri).then(() => true, () => false);
}


export function logEditToolResult(logService: ILogService, requestId: string | undefined, ...opts: {
	input: unknown;
	success: boolean;
	healed?: unknown | undefined;
}[]) {
	logService.debug(`[edit-tool:${requestId}] ${JSON.stringify(opts)}`);
}

export function getDisallowedEditUriError(uri: URI, allowedUris: ResourceSet | undefined, promptPathRepresentationService: IPromptPathRepresentationService): string | undefined {
	if (!allowedUris || allowedUris.has(uri)) {
		return undefined;
	}

	return `File ${promptPathRepresentationService.getFilePath(uri)} is not in the set of allowed files for this edit request.`;
}

export async function openDocumentAndSnapshot(accessor: ServicesAccessor, promptContext: IBuildPromptContext | undefined, uri: URI): Promise<NotebookDocumentSnapshot | TextDocumentSnapshot> {
	const notebookService = accessor.get(INotebookService);
	const workspaceService = accessor.get(IWorkspaceService);
	const alternativeNotebookContent = accessor.get(IAlternativeNotebookContentService);

	const previouslyEdited = promptContext?.turnEditedDocuments?.get(uri);
	if (previouslyEdited) {
		return previouslyEdited;
	}

	const isNotebook = notebookService.hasSupportedNotebooks(uri);
	if (isNotebook) {
		uri = findNotebook(uri, workspaceService.notebookDocuments)?.uri || uri;
	}
	return isNotebook ?
		await workspaceService.openNotebookDocumentAndSnapshot(uri, alternativeNotebookContent.getFormat(promptContext?.request?.model)) :
		await workspaceService.openTextDocumentAndSnapshot(uri);
}
