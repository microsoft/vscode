/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { RootedEdit } from '../../../platform/inlineEdits/common/dataTypes/edit';
import { DiffHistoryOptions, RejectedEditsMemoryMode } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { StatelessNextEditDocument } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { IXtabHistoryDiffHunk, IXtabHistoryEditEntry, IXtabHistoryEntry, IXtabHistoryRejectedEditEntry } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { groupAdjacentBy, pushMany } from '../../../util/vs/base/common/arrays';
import { toUniquePath } from './promptCraftingUtils';

export const REJECTED_EDIT_TAG = '<|rejected/|>';

/**
 * In {@link RejectedEditsMemoryMode.AppliedThenUndone} mode, a rejection is only put in the prompt when the
 * cursor is at most this many lines away from the rejected lines.
 */
export const APPLIED_THEN_UNDONE_MAX_CURSOR_DISTANCE = 1;

/** In {@link RejectedEditsMemoryMode.AppliedThenUndone} mode, each rejection is written as this many "applied, then undone" pairs. */
export const APPLIED_THEN_UNDONE_REPETITIONS = 1;

/**
 * In {@link RejectedEditsMemoryMode.AppliedThenUndone} mode, a rejection is dropped once the developer has made more than
 * this many edits after it (counted as edit-history entries in any document).
 */
export const APPLIED_THEN_UNDONE_MAX_EDITS_AFTER_REJECTION = 2;

/**
 * Picks the rejections that go into the prompt.
 *
 * {@link RejectedEditsMemoryMode.AppliedThenUndone} keeps only rejections that
 * - are in the active document,
 * - still apply: the current document still has each hunk's original lines at the recorded line number
 *   (so rejections whose lines have moved or been edited since are dropped),
 * - have lines within {@link APPLIED_THEN_UNDONE_MAX_CURSOR_DISTANCE} lines of the cursor, and
 * - are followed by at most {@link APPLIED_THEN_UNDONE_MAX_EDITS_AFTER_REJECTION} edits in `xtabHistory`,
 * so all other requests keep an unchanged prompt. Other modes keep all rejections.
 */
export function selectRejectedEditsForPrompt(
	mode: RejectedEditsMemoryMode | undefined,
	rejectedEditHistory: readonly IXtabHistoryRejectedEditEntry[],
	xtabHistory: readonly IXtabHistoryEntry[],
	activeDoc: StatelessNextEditDocument,
	cursorLineOffset: number,
): readonly IXtabHistoryRejectedEditEntry[] {
	if (mode === undefined) {
		return [];
	}
	if (mode !== RejectedEditsMemoryMode.AppliedThenUndone) {
		return rejectedEditHistory;
	}
	const currentLines = activeDoc.documentAfterEditsLines;
	return rejectedEditHistory.filter(entry =>
		entry.docId === activeDoc.id
		&& entry.hunks.every(hunk => hunkStillApplies(hunk, currentLines))
		&& entry.hunks.some(hunk => distanceToHunk(hunk, cursorLineOffset) <= APPLIED_THEN_UNDONE_MAX_CURSOR_DISTANCE)
		&& xtabHistory.filter(h => h.kind === 'edit' && h.ordinal > entry.ordinal).length <= APPLIED_THEN_UNDONE_MAX_EDITS_AFTER_REJECTION
	);
}

/** Whether the document still has the hunk's original lines at the hunk's (0-based) start line. */
function hunkStillApplies(hunk: IXtabHistoryDiffHunk, currentLines: readonly string[]): boolean {
	const start = hunk.startLineNumber;
	if (start < 0 || start + hunk.oldLines.length > currentLines.length) {
		return false;
	}
	return hunk.oldLines.every((line, i) => currentLines[start + i] === line);
}

/** Line distance from `lineOffset` (0-based) to the lines a hunk replaces; 0 when inside. */
function distanceToHunk(hunk: IXtabHistoryDiffHunk, lineOffset: number): number {
	const first = hunk.startLineNumber;
	const last = hunk.startLineNumber + Math.max(1, hunk.oldLines.length) - 1;
	if (lineOffset < first) {
		return first - lineOffset;
	}
	if (lineOffset > last) {
		return lineOffset - last;
	}
	return 0;
}

export interface EditDiffHistoryResult {
	readonly promptPiece: string;
	readonly nDiffs: number;
	readonly totalTokens: number;
}

interface IDiffHistoryItem {
	readonly ordinal: number;
	readonly docId: DocumentId;
	readonly isRejection: boolean;
	render(): string | null;
}

/**
 * @param rejectedEditsMode How rejected edits are rendered:
 * - {@link RejectedEditsMemoryMode.DiffWithTags}: one tagged entry per rejection, at the rejection's position.
 * - {@link RejectedEditsMemoryMode.AppliedThenUndone}: untagged "applied, then undone" entries (repeated
 *   {@link APPLIED_THEN_UNDONE_REPETITIONS} times) at the rejection's position, plus one more "undone" entry as the
 *   newest history entry. The applied/undone pairs count as a single entry towards `nEntries`.
 */
export function getEditDiffHistory(
	activeDoc: StatelessNextEditDocument,
	xtabHistory: readonly IXtabHistoryEntry[],
	docsInPrompt: Set<DocumentId>,
	computeTokens: (s: string) => number,
	{ onlyForDocsInPrompt, maxTokens, nEntries, useRelativePaths }: DiffHistoryOptions,
	rejectedEditHistory: readonly IXtabHistoryRejectedEditEntry[],
	rejectedEditsMode: RejectedEditsMemoryMode | undefined,
): EditDiffHistoryResult {
	const workspacePath = useRelativePaths ? activeDoc.workspaceRoot?.path : undefined;

	const items: IDiffHistoryItem[] = [];
	for (const entry of xtabHistory) {
		if (entry.kind === 'visibleRanges') {
			continue;
		}
		items.push({ ordinal: entry.ordinal, docId: entry.docId, isRejection: false, render: () => generateDocDiff(entry, workspacePath) });
	}
	if (rejectedEditsMode === RejectedEditsMemoryMode.AppliedThenUndone) {
		const newestOrdinal = Math.max(-1, ...xtabHistory.map(entry => entry.ordinal), ...rejectedEditHistory.map(entry => entry.ordinal));
		rejectedEditHistory.forEach((entry, i) => {
			items.push({ ordinal: entry.ordinal, docId: entry.docId, isRejection: true, render: () => renderAppliedThenUndone(entry, workspacePath) });
			items.push({ ordinal: newestOrdinal + 1 + i, docId: entry.docId, isRejection: true, render: () => renderDocDiff(entry.docId, entry.hunks.map(invertHunk), workspacePath, '') });
		});
	} else {
		for (const entry of rejectedEditHistory) {
			items.push({ ordinal: entry.ordinal, docId: entry.docId, isRejection: true, render: () => generateDocDiff(entry, workspacePath) });
		}
	}

	const reversedHistory = items.sort((left, right) => right.ordinal - left.ordinal);

	let tokenBudget = maxTokens;
	let totalTokensConsumed = 0;

	const allDiffs: string[] = [];

	// we traverse in reverse (ie from most recent to least recent) because we may terminate early due to token-budget overflow
	for (const item of reversedHistory) {
		if (allDiffs.length >= nEntries) { // we've reached the maximum number of entries
			break;
		}

		if (onlyForDocsInPrompt && !docsInPrompt.has(item.docId)) {
			continue;
		}

		const docDiff = item.render();
		if (docDiff === null) {
			continue;
		}

		const tokenCount = computeTokens(docDiff);

		// Skip large rejection diffs rather than starving the diff history.
		// TODO experiment: truncate the diff to fit within the token budget.
		if (tokenCount > tokenBudget && item.isRejection) {
			continue;
		}

		tokenBudget -= tokenCount;

		if (tokenBudget < 0) {
			break;
		} else {
			totalTokensConsumed += tokenCount;
			allDiffs.push(docDiff);
		}
	}

	const diffsFromOldestToNewest = allDiffs.reverse();

	let promptPiece = diffsFromOldestToNewest.join('\n\n');

	// to preserve old behavior where we always had trailing whitespace
	if (diffsFromOldestToNewest.length > 0) {
		promptPiece += '\n';
	}

	return { promptPiece, nDiffs: allDiffs.length, totalTokens: totalTokensConsumed };
}

function getEditDiffHunks(entry: IXtabHistoryEditEntry): IXtabHistoryDiffHunk[] {
	const lineEdit = RootedEdit.toLineEdit(entry.edit);
	const baseLines = entry.edit.base.getLines();
	const hunks: IXtabHistoryDiffHunk[] = [];

	// group edits into hunks of adjacent edits (eg if line 3 and line 4 are both edited, they should be in the same hunk, but if line 3 and line 5 are edited, they should be in different hunks)
	for (const lineEditGroup of groupAdjacentBy(lineEdit.replacements, (left, right) => left.lineRange.endLineNumberExclusive >= right.lineRange.startLineNumber)) {
		const oldLines: string[] = [];
		const newLines: string[] = [];

		let previousEndLineNumberExclusive = lineEditGroup[0].lineRange.startLineNumber;

		for (const singleLineEdit of lineEditGroup) {
			if (previousEndLineNumberExclusive < singleLineEdit.lineRange.startLineNumber) {
				const unchangedLines = baseLines.slice(previousEndLineNumberExclusive - 1, singleLineEdit.lineRange.startLineNumber - 1);
				pushMany(oldLines, unchangedLines);
				pushMany(newLines, unchangedLines);
			}

			const replacedOldLines = baseLines.slice(singleLineEdit.lineRange.startLineNumber - 1, singleLineEdit.lineRange.endLineNumberExclusive - 1);
			pushMany(oldLines, replacedOldLines);
			pushMany(newLines, singleLineEdit.newLines);

			previousEndLineNumberExclusive = singleLineEdit.lineRange.endLineNumberExclusive;
		}

		if (oldLines.every(line => line.trim().length === 0) && newLines.every(line => line.trim().length === 0)) {
			// skip over a diff which would only contain -/+ without any content
			continue;
		}

		// skip no-op diffs where the old and new lines are identical
		if (oldLines.length === newLines.length && oldLines.every((line, i) => line === newLines[i])) {
			continue;
		}

		hunks.push({
			startLineNumber: lineEditGroup[0].lineRange.startLineNumber - 1,
			oldLines,
			newLines,
		});
	}

	return hunks;
}

function generateDocDiff(entry: IXtabHistoryEditEntry | IXtabHistoryRejectedEditEntry, workspacePath: string | undefined): string | null {
	const hunks = entry.kind === 'rejectedEdit' ? entry.hunks : getEditDiffHunks(entry);
	const hunkAnnotation = entry.kind === 'rejectedEdit' ? ` ${REJECTED_EDIT_TAG}` : '';
	return renderDocDiff(entry.docId, hunks, workspacePath, hunkAnnotation);
}

function renderDocDiff(docId: DocumentId, hunks: readonly IXtabHistoryDiffHunk[], workspacePath: string | undefined, hunkAnnotation: string): string | null {
	if (hunks.length === 0) {
		return null;
	}

	const uniquePath = toUniquePath(docId, workspacePath);
	const docDiffLines = [
		`--- ${uniquePath}`,
		`+++ ${uniquePath}`,
	];
	for (const hunk of hunks) {
		docDiffLines.push(`@@ -${hunk.startLineNumber},${hunk.oldLines.length} +${hunk.startLineNumber},${hunk.newLines.length} @@${hunkAnnotation}`);
		pushMany(docDiffLines, hunk.oldLines.map(line => `-${line}`));
		pushMany(docDiffLines, hunk.newLines.map(line => `+${line}`));
	}
	return docDiffLines.join('\n');
}

function invertHunk(hunk: IXtabHistoryDiffHunk): IXtabHistoryDiffHunk {
	return { startLineNumber: hunk.startLineNumber, oldLines: hunk.newLines, newLines: hunk.oldLines };
}

/** Renders a rejection as {@link APPLIED_THEN_UNDONE_REPETITIONS} pairs of ordinary entries: the suggestion applied, then undone. */
function renderAppliedThenUndone(entry: IXtabHistoryRejectedEditEntry, workspacePath: string | undefined): string | null {
	const applied = renderDocDiff(entry.docId, entry.hunks, workspacePath, '');
	const undone = renderDocDiff(entry.docId, entry.hunks.map(invertHunk), workspacePath, '');
	if (applied === null || undone === null) {
		return null;
	}
	return Array.from({ length: APPLIED_THEN_UNDONE_REPETITIONS }, () => `${applied}\n\n${undone}`).join('\n\n');
}
