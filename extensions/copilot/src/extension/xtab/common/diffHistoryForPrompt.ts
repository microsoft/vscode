/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { RootedEdit } from '../../../platform/inlineEdits/common/dataTypes/edit';
import { DiffHistoryOptions, PromptMemoryOptions, RejectedEditsMemoryMode } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { StatelessNextEditDocument } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { IXtabHistoryDiffHunk, IXtabHistoryEditEntry, IXtabHistoryEntry, IXtabHistoryRejectedEditEntry } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { groupAdjacentBy, pushMany } from '../../../util/vs/base/common/arrays';
import { toUniquePath } from './promptCraftingUtils';

export const REJECTED_EDIT_TAG = '<|rejected/|>';

/**
 * In {@link RejectedEditsMemoryMode.AppliedThenUndone} mode a rejection stops being shown once more than this many
 * edit-history entries follow it (consecutive edits to the same line count once). Offline, the rejection's effect on
 * repeated suggestions fades as later edits push it back (with the cursor on the rejected lines, repeats fall from
 * 87% to 79% at four later edits and to 83% at eight), so older rejections are dropped to save prompt tokens.
 */
export const REJECTED_EDITS_MAX_EDITS_AFTER = 4;

/**
 * Picks the rejections that go into the prompt.
 *
 * {@link RejectedEditsMemoryMode.AppliedThenUndone} keeps only rejections that
 * - are in the active document, and
 * - are followed by at most {@link REJECTED_EDITS_MAX_EDITS_AFTER} edit-history entries.
 *
 * Like every other history entry, a rejection keeps the line numbers it had when it happened. Other modes keep all
 * rejections.
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
	if (mode !== RejectedEditsMemoryMode.AppliedThenUndone) {
		return rejectedEditHistory;
	}
	return rejectedEditHistory.filter(entry =>
		entry.docId === activeDoc.id
		&& xtabHistory.filter(h => h.kind === 'edit' && h.ordinal > entry.ordinal).length <= REJECTED_EDITS_MAX_EDITS_AFTER
	);
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
 * - {@link RejectedEditsMemoryMode.AppliedThenUndone}: untagged "applied, then undone" entries at the rejection's
 *   position. The pair counts as a single entry towards `nEntries`.
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
		for (const entry of rejectedEditHistory) {
			items.push({ ordinal: entry.ordinal, docId: entry.docId, isRejection: true, render: () => renderAppliedThenUndone(entry, workspacePath) });
		}
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

/** Renders a rejection as two ordinary entries: the suggestion applied, then undone. */
function renderAppliedThenUndone(entry: IXtabHistoryRejectedEditEntry, workspacePath: string | undefined): string | null {
	const applied = renderDocDiff(entry.docId, entry.hunks, workspacePath, '');
	const undone = renderDocDiff(entry.docId, entry.hunks.map(invertHunk), workspacePath, '');
	if (applied === null || undone === null) {
		return null;
	}
	return `${applied}\n\n${undone}`;
}
