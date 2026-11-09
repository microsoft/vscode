/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { RootedEdit } from '../../../platform/inlineEdits/common/dataTypes/edit';
import { DEFAULT_REJECTED_EDITS_MAX_EDITS_AFTER, DiffHistoryOptions, PromptMemoryOptions, RejectedEditsMemoryMode, RejectedEditsPlacement } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { StatelessNextEditDocument } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { IXtabHistoryDiffHunk, IXtabHistoryEditEntry, IXtabHistoryEntry, IXtabHistoryRejectedEditEntry } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { groupAdjacentBy, pushMany } from '../../../util/vs/base/common/arrays';
import { toUniquePath } from './promptCraftingUtils';

export const REJECTED_EDIT_TAG = '<|rejected/|>';

/**
 * Picks the rejections that go into the prompt: those followed by at most `memory.rejectedEditsMaxEditsAfter` edit-history
 * entries (every mode), and in {@link RejectedEditsMemoryMode.AppliedThenUndone} mode only those in the active document.
 * At most `memory.rejectedEditsMaxCount` of the most recent ones are kept.
 *
 * Like every other history entry, a rejection keeps the line numbers it had when it happened.
 */
export function selectRejectedEditsForPrompt(
	memory: PromptMemoryOptions | undefined,
	rejectedEditHistory: readonly IXtabHistoryRejectedEditEntry[],
	xtabHistory: readonly IXtabHistoryEntry[],
	activeDoc: StatelessNextEditDocument,
): readonly IXtabHistoryRejectedEditEntry[] {
	const mode = memory?.rejectedEdits;
	if (mode === undefined) {
		return [];
	}
	const maxEditsAfter = memory?.rejectedEditsMaxEditsAfter ?? DEFAULT_REJECTED_EDITS_MAX_EDITS_AFTER;
	const activeDocOnly = mode === RejectedEditsMemoryMode.AppliedThenUndone;
	const selected = rejectedEditHistory.filter(entry =>
		(!activeDocOnly || entry.docId === activeDoc.id)
		&& xtabHistory.filter(h => h.kind === 'edit' && h.ordinal > entry.ordinal).length <= maxEditsAfter
	);
	const maxCount = memory?.rejectedEditsMaxCount;
	return maxCount === undefined ? selected : selected.slice(Math.max(0, selected.length - Math.max(0, maxCount)));
}

export interface EditDiffHistoryResult {
	readonly promptPiece: string;
	readonly nDiffs: number;
	readonly totalTokens: number;
}

/**
 * @param memory How rejected edits are rendered:
 * - {@link RejectedEditsMemoryMode.DiffWithTags}: one tagged entry per rejection.
 * - {@link RejectedEditsMemoryMode.AppliedThenUndone}: untagged "applied, then undone" entries, written
 *   `rejectedEditsRepetitions` times. They count as a single entry towards `nEntries`.
 *
 * Rejections are placed at their own position, or as the newest entries when `rejectedEditsPlacement` is
 * {@link RejectedEditsPlacement.Newest}.
 */
export function getEditDiffHistory(
	activeDoc: StatelessNextEditDocument,
	xtabHistory: readonly IXtabHistoryEntry[],
	docsInPrompt: Set<DocumentId>,
	computeTokens: (s: string) => number,
	{ onlyForDocsInPrompt, maxTokens, nEntries, useRelativePaths }: DiffHistoryOptions,
	rejectedEditHistory: readonly IXtabHistoryRejectedEditEntry[],
	memory: PromptMemoryOptions | undefined,
): EditDiffHistoryResult {
	const workspacePath = useRelativePaths ? activeDoc.workspaceRoot?.path : undefined;

	const repetitions = Math.max(1, Math.floor(memory?.rejectedEditsRepetitions ?? 1));
	const renderRejection = memory?.rejectedEdits === RejectedEditsMemoryMode.AppliedThenUndone
		? (entry: IXtabHistoryRejectedEditEntry, path: string | undefined) => renderAppliedThenUndone(entry, path, repetitions)
		: generateDocDiff;
	const newestFirst = (left: { ordinal: number }, right: { ordinal: number }) => right.ordinal - left.ordinal;
	const editEntries = xtabHistory.filter((entry): entry is IXtabHistoryEditEntry => entry.kind !== 'visibleRanges');
	const reversedHistory = memory?.rejectedEditsPlacement === RejectedEditsPlacement.Newest
		? [...[...rejectedEditHistory].sort(newestFirst), ...editEntries.sort(newestFirst)]
		: [...editEntries, ...rejectedEditHistory].sort(newestFirst);

	let tokenBudget = maxTokens;
	let totalTokensConsumed = 0;

	const allDiffs: string[] = [];

	// we traverse in reverse (ie from most recent to least recent) because we may terminate early due to token-budget overflow
	for (const entry of reversedHistory) {
		if (allDiffs.length >= nEntries) { // we've reached the maximum number of entries
			break;
		}

		if (onlyForDocsInPrompt && !docsInPrompt.has(entry.docId)) {
			continue;
		}

		const isRejection = entry.kind === 'rejectedEdit';
		const docDiff = isRejection ? renderRejection(entry, workspacePath) : generateDocDiff(entry, workspacePath);
		if (docDiff === null) {
			continue;
		}

		const tokenCount = computeTokens(docDiff);

		// Skip large rejection diffs rather than starving the diff history.
		// TODO experiment: truncate the diff to fit within the token budget.
		if (tokenCount > tokenBudget && isRejection) {
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

/** Renders a rejection as `repetitions` pairs of ordinary entries: the suggestion applied, then undone. */
function renderAppliedThenUndone(entry: IXtabHistoryRejectedEditEntry, workspacePath: string | undefined, repetitions: number): string | null {
	const applied = renderDocDiff(entry.docId, entry.hunks, workspacePath, '');
	const undone = renderDocDiff(entry.docId, entry.hunks.map(invertHunk), workspacePath, '');
	if (applied === null || undone === null) {
		return null;
	}
	return Array.from({ length: repetitions }, () => `${applied}\n\n${undone}`).join('\n\n');
}
