/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RecentEditsConfig } from './recentEditsProvider';

/** The shape of one unified-diff hunk, independent of formatting. */
export interface DiffHunk {
	file: string;
	// the first line index (0-based) of the context window
	pre: number;
	// one past the last line index of the context window
	post: number;
	// context before the change
	before: string[];
	// lines removed
	removed: string[];
	// lines added
	added: string[];
	// context after the change
	after: string[];
}

export interface RecentEdit {
	file: string;
	startLine: number;
	endLine: number;
	diff: DiffHunk;
	timestamp: number;
}

export type RecentEditMap = Record<string, { originalContent: string; currentContent: string; edits: RecentEdit[] }>;

/**
 * Flatten all edits from a RecentEditMap into a single array,
 * sorted by timestamp (oldest first).
 */
export function getAllRecentEditsByTimestamp(map: RecentEditMap): RecentEdit[] {
	return Object.values(map)
		.flatMap(fileEntry => fileEntry.edits)
		.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Find the first/last differing line indices.
 * Returns null if the two are identical.
 */
export function findChangeSpan(
	prevLines: string[],
	newLines: string[]
): { start: number; endPrev: number; endNew: number } | null {
	let start = 0;
	while (start < prevLines.length && start < newLines.length && prevLines[start] === newLines[start]) {
		start++;
	}

	let endPrev = prevLines.length - 1;
	let endNew = newLines.length - 1;
	while (endPrev >= start && endNew >= start && prevLines[endPrev] === newLines[endNew]) {
		endPrev--;
		endNew--;
	}

	// truly identical
	if (start > endPrev && start > endNew) { return null; }

	return { start, endPrev, endNew };
}

/**
 * Collect everything needed to render a single diff in any format.
 */
export function getDiff(
	file: string,
	prevLines: string[],
	newLines: string[],
	start: number,
	endPrev: number,
	endNew: number,
	context: number
): DiffHunk {
	const pre = Math.max(0, start - context);
	const post = Math.min(newLines.length, endNew + context + 1);

	return {
		file,
		pre,
		post,
		before: prevLines.slice(pre, start),
		removed: prevLines.slice(start, endPrev + 1),
		added: newLines.slice(start, endNew + 1),
		after: newLines.slice(endNew + 1, post),
	};
}

/**
 * Calculates the number of characters in a DiffHunk. This includes context, removed, and added lines, but no formatting.
 * @param hunk A DiffHunk object containing the diff information.
 * @returns The total number of characters in the diff.
 */
function measureDiffSize(hunk: DiffHunk): number {
	// Calculate the size of the diff by summing the lengths of all lines
	// in the before, removed, added, and after sections.
	const allLines = [...hunk.before, ...hunk.removed, ...hunk.added, ...hunk.after];
	return allLines.reduce((acc, line) => acc + line.length + 1, 0);
}

/**
 * Turn a DiffHunk into a standard unified diff string.
 */
export function unifiedDiff(
	hunk: DiffHunk,
	removeDeletedLines: boolean = false,
	insertionsBeforeDeletions: boolean = false,
	appendNoReplyMarker: boolean = false
): string {
	const out: string[] = [];

	out.push(`--- a/${hunk.file}`);
	out.push(`+++ b/${hunk.file}`);
	const oldLen = hunk.before.length + hunk.removed.length + hunk.after.length;
	const newLen = hunk.before.length + hunk.added.length + hunk.after.length;
	out.push(`@@ -${hunk.pre + 1},${oldLen} +${hunk.pre + 1},${newLen} @@`);

	for (const line of hunk.before) { out.push(' ' + line); }
	if (insertionsBeforeDeletions) {
		for (const line of hunk.added) { out.push('+' + line); }
	}
	if (!removeDeletedLines) {
		const deletedLinesSpecialText = appendNoReplyMarker ? ' --- IGNORE ---' : '';
		for (const line of hunk.removed) { out.push('-' + line + deletedLinesSpecialText); }
	}
	if (!insertionsBeforeDeletions) {
		for (const line of hunk.added) { out.push('+' + line); }
	}
	for (const line of hunk.after) { out.push(' ' + line); }

	return out.join('\n') + '\n';
}

/**
 * Turn a DiffHunk into an Aider's Diff string. OpenAI recommends this for 4.1 models. https://aider.chat/docs/more/edit-formats.html#diff
 */
function aidersDiff(hunk: DiffHunk, removeDeletedLines = false): string {
	const { before, removed, added, after } = hunk;
	const res: string[] = [];

	res.push('>>>>>>> SEARCH');
	res.push(...before);
	if (removeDeletedLines) {
		res.push('...');
	} else {
		res.push(...removed);
	}
	res.push(...after);

	res.push('=======');

	res.push(...before);
	res.push(...added);
	res.push(...after);

	res.push('<<<<<<<<< REPLACE');
	return res.join('\n');
}

/**
 * Turn a DiffHunk into a plain english find/replace string
 */
export function findReplaceDiff(hunk: DiffHunk, removeDeletedLines = false): string {
	const { before, removed, added, after } = hunk;
	const removedWithWarning = removeDeletedLines
		? ['...']
		: removed.map(line => `${line} --- DO NOT REPLY WITH CODE FROM THIS LINE ---`);

	const beforeSection = [...before, ...removedWithWarning, ...after];
	const afterSection = [...before, ...added, ...after];

	const res: string[] = [];
	res.push('--- User edited code: ---');
	res.push(...beforeSection);

	if (removedWithWarning.length === 0) {
		res.push(`--- and added ${added.length} line${added.length === 1 ? '' : 's'} to make: ---`);
	} else if (added.length === 0) {
		res.push(
			`--- and deleted ${removedWithWarning.length} line${removedWithWarning.length === 1 ? '' : 's'} to make: ---`
		);
	} else {
		res.push('--- and replaced it with: ---');
	}

	res.push(...afterSection);
	res.push('--- End of edit ---');
	return res.join('\n');
}

/** Apply a sequence of edits to a lines-array, in order. */
function applyEditsToLines(lines: string[], edits: RecentEdit[]): string[] {
	for (const e of edits) {
		const before = lines.slice(0, e.startLine);
		const after = lines.slice(e.endLine + 1);
		const insert = e.diff.added ? e.diff.added : [];
		lines = [...before, ...insert, ...after];
	}
	return lines;
}

/**
 * Determines whether two edits overlap or are close enough to be considered adjacent.
 *
 * @param incoming - The new edit being evaluated, represented as a `RecentEdit` object.
 * @param last - The most recent edit already processed, represented as a `RecentEdit` object.
 * @param editMergeLineDistance - The maximum number of lines between edits to consider them adjacent.
 * @returns `true` if the edits overlap or are within the specified line distance; otherwise, `false`.
 */
export function editsOverlap(incoming: RecentEdit, last: RecentEdit, editMergeLineDistance: number): boolean {
	const { added } = last.diff;
	const lastStart = last.startLine;
	const lastEnd = last.startLine + added.length;
	const incStart = incoming.startLine;
	const incEnd = incoming.endLine + 1;

	// Two ranges overlap (or are within the merge distance) if
	// the start of one is no more than `editMergeLineDistance` after the end of the other, and vice versa.
	return incStart <= lastEnd + editMergeLineDistance && incEnd >= lastStart - editMergeLineDistance;
}

/**
 * Add an incoming hunk, coalesce overlaps, and immediately trim+rebase if needed.
 */
export function updateEdits(
	originalContent: string,
	existing: RecentEdit[],
	incoming: RecentEdit,
	currentFileLines: string[],
	config: RecentEditsConfig
): { originalContent: string; edits: RecentEdit[] } {
	let edits = [...existing];

	// Try to merge only if the ranges actually overlap
	if (edits.length > 0) {
		const last = edits[edits.length - 1];
		const overlaps = editsOverlap(incoming, last, config.editMergeLineDistance);

		if (overlaps) {
			// build the file state _just before_ the incoming edit
			const prevLines = applyEditsToLines(originalContent.split('\n'), edits.slice(0, -1));

			// compute the true minimal span
			const span = findChangeSpan(prevLines, currentFileLines);
			if (span) {
				// re-build a single merged hunk
				incoming = buildIncomingEdit(incoming.file, prevLines, currentFileLines, span, config);
				edits = [...edits.slice(0, -1), incoming];
			}
			// else a no-op or perfect revert, just drop the incoming
		} else {
			edits.push(incoming);
		}
	} else {
		edits.push(incoming);
	}

	// Trim & rebase _after_ appending/merging, so incoming is folded
	if (edits.length > config.maxEdits) {
		// Push out the stale edits
		const staleEdits = edits.slice(0, edits.length - config.maxEdits);
		edits = edits.slice(edits.length - config.maxEdits, edits.length);
		const allLines = applyEditsToLines(originalContent.split('\n'), staleEdits);
		originalContent = allLines.join('\n');
	}

	return { originalContent, edits };
}

/** Build the incoming edit object */
export function buildIncomingEdit(
	file: string,
	prevLines: string[],
	nextLines: string[],
	span: { start: number; endPrev: number; endNew: number },
	config: RecentEditsConfig
): RecentEdit {
	const { start, endPrev, endNew } = span;
	if (!config || typeof config.diffContextLines !== 'number') {
		throw new Error('Invalid configuration passed to buildIncomingEdit');
	}
	const diff = getDiff(file, prevLines, nextLines, start, endPrev, endNew, config.diffContextLines);

	return {
		file,
		startLine: start,
		endLine: endPrev,
		diff,
		timestamp: performance.now(),
	};
}

/**
 * Trim old files from the state.
 */
export function trimOldFilesFromState(state: RecentEditMap, maxFiles: number): RecentEditMap {
	const newState = { ...state };

	const modifiedFilesInOrder = Object.entries(state)
		// take only modified files
		.filter(([fileName]) => state[fileName].edits.length)
		// sort by timestamp of most recent edit
		.sort(
			([aFile, a], [bFile, b]) => a.edits[a.edits.length - 1].timestamp - b.edits[b.edits.length - 1].timestamp
		);

	const filesToTrim = Math.max(0, modifiedFilesInOrder.length - maxFiles);
	if (filesToTrim) {
		for (let i = 0; i < filesToTrim; i++) {
			const fileName = modifiedFilesInOrder[i][0];
			delete newState[fileName];
		}
	}

	return newState;
}

/**
 * Reducer that takes a file and its new contents,
 * merging them into a clean structure of recent edits.
 */
export function recentEditsReducer(
	state: RecentEditMap = {},
	file: string,
	newContents: string,
	config: RecentEditsConfig
): RecentEditMap {
	if (newContents.length > 2 * 1024 * 1024) {
		// don't try to track files larger than 2mb (around 100k lines)
		return state;
	}

	const prev = state[file];

	// first time we see this file
	if (!prev) {
		return {
			...state,
			[file]: {
				originalContent: newContents,
				currentContent: newContents,
				edits: [],
			},
		};
	}

	// nothing changed
	if (prev.currentContent === newContents) {
		return state;
	}

	const prevLines = prev.currentContent.split('\n');
	const newLines = newContents.split('\n');

	// detect the changed span
	const span = findChangeSpan(prevLines, newLines);
	if (!span) {
		// content drifted back to identical
		return {
			...state,
			[file]: { ...prev, currentContent: newContents },
		};
	}

	// build the single incoming edit
	const incoming = buildIncomingEdit(file, prevLines, newLines, span, config);
	if (measureDiffSize(incoming.diff) > config.maxCharsPerEdit) {
		// User is making a huge edit, so we just reset the state for this file.
		// This is a performance optimization to avoid keeping large diffs in memory.
		return {
			...state,
			[file]: {
				originalContent: newContents,
				currentContent: newContents,
				edits: [],
			},
		};
	}

	// merge/trim/rebase all at once
	const { originalContent: updatedOriginal, edits: updatedEdits } = updateEdits(
		prev.originalContent,
		prev.edits,
		incoming,
		newLines,
		config
	);

	// update the state for this file
	const stateWithLatestEdit = {
		...state,
		[file]: {
			originalContent: updatedOriginal,
			currentContent: newContents,
			edits: updatedEdits,
		},
	};

	// Trim old files if needed. Need to do this _after_ the new edit was added, since the
	// timestamp of this file will have changed.
	return trimOldFilesFromState(stateWithLatestEdit, config.maxFiles);
}

/**
 * Summarizes a single recent edit for the prompt.
 * @param edit
 * @param config RecentEditsPromptConfig
 * @returns a string summarizing the edit for the prompt, or null if the edit should be left out
 */
export function summarizeEdit(edit: RecentEdit, config: RecentEditsConfig): string | null {
	const oldNonEmptyLines: string[] = edit.diff.removed.filter(x => x.trim().length > 0);
	const newNonEmptyLines: string[] = edit.diff.added.filter(x => x.trim().length > 0);

	let result: string | null;
	if (config.removeDeletedLines && newNonEmptyLines.length === 0) {
		// skip over a diff that has only deleted lines
		result = null;
	} else if (oldNonEmptyLines.length === 0 && newNonEmptyLines.length === 0) {
		// skip over a diff which would only contain -/+ without any content
		result = null;
	} else if (oldNonEmptyLines.join('').trim() === newNonEmptyLines.join('').trim()) {
		// skip over a diff that has only whitespace changes
		result = null;
	} else if (edit.diff.added.length > config.maxLinesPerEdit || edit.diff.removed.length > config.maxLinesPerEdit) {
		// skip over a diff that is too large line-wise
		result = null;
	} else if (config.summarizationFormat === 'aiders-diff') {
		result = aidersDiff(edit.diff);
	} else if (config.summarizationFormat === 'diff') {
		result = unifiedDiff(
			edit.diff,
			config.removeDeletedLines,
			config.insertionsBeforeDeletions,
			config.appendNoReplyMarker
		);
	} else if (config.summarizationFormat === 'find-replace') {
		result = findReplaceDiff(edit.diff);
	} else {
		throw new Error(`Unknown summarization format: ${config.summarizationFormat}`);
	}

	return result;
}
