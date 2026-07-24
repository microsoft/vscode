/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { RootedEdit } from '../../../platform/inlineEdits/common/dataTypes/edit';
import { DiffHistoryOptions } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { StatelessNextEditDocument } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { IXtabHistoryEditEntry, IXtabHistoryEntry, IXtabHistoryRejectedEditEntry } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { groupAdjacentBy, pushMany } from '../../../util/vs/base/common/arrays';
import { toUniquePath } from './promptCraftingUtils';

export const REJECTED_EDIT_TAG = '<|rejected/|>';

export interface EditDiffHistoryResult {
	readonly promptPiece: string;
	readonly nDiffs: number;
	readonly totalTokens: number;
}

export function getEditDiffHistory(
	activeDoc: StatelessNextEditDocument,
	xtabHistory: readonly IXtabHistoryEntry[],
	docsInPrompt: Set<DocumentId>,
	computeTokens: (s: string) => number,
	{ onlyForDocsInPrompt, maxTokens, nEntries, useRelativePaths }: DiffHistoryOptions,
	rejectedEditHistory: readonly IXtabHistoryRejectedEditEntry[] = [],
): EditDiffHistoryResult {
	const workspacePath = useRelativePaths ? activeDoc.workspaceRoot?.path : undefined;

	// Rejected edits are retained separately from normal workspace history, then
	// merged by capture sequence only while constructing a memory-enabled prompt.
	const reversedHistory = [...xtabHistory, ...rejectedEditHistory]
		.map((entry, index) => ({ entry, sequence: entry.sequence ?? index }))
		.sort((a, b) => a.sequence - b.sequence)
		.map(({ entry }) => entry)
		.reverse();

	let tokenBudget = maxTokens;
	let totalTokensConsumed = 0;

	const allDiffs: string[] = [];

	// we traverse in reverse (ie from most recent to least recent) because we may terminate early due to token-budget overflow
	for (const entry of reversedHistory) {
		if (allDiffs.length >= nEntries) { // we've reached the maximum number of entries
			break;
		}

		if (entry.kind === 'visibleRanges') {
			continue;
		}

		if (onlyForDocsInPrompt && !docsInPrompt.has(entry.docId)) {
			continue;
		}

		const docDiff = entry.kind === 'rejectedEdit'
			? generateRejectedDocDiff(entry, workspacePath)
			: generateDocDiff(entry, workspacePath);
		if (docDiff === null) {
			continue;
		}

		const tokenCount = computeTokens(docDiff);

		if (tokenCount > tokenBudget) {
			// A bounded rejected sample can still exceed a small experimental
			// budget. Skip it rather than starving normal edit history.
			if (entry.kind === 'rejectedEdit') {
				continue;
			}
			break;
		}

		tokenBudget -= tokenCount;
		totalTokensConsumed += tokenCount;
		allDiffs.push(docDiff);
	}

	const diffsFromOldestToNewest = allDiffs.reverse();

	let promptPiece = diffsFromOldestToNewest.join('\n\n');

	// to preserve old behavior where we always had trailing whitespace
	if (diffsFromOldestToNewest.length > 0) {
		promptPiece += '\n';
	}

	return { promptPiece, nDiffs: allDiffs.length, totalTokens: totalTokensConsumed };
}

function generateRejectedDocDiff(entry: IXtabHistoryRejectedEditEntry, workspacePath: string | undefined): string {
	const docDiffLines: string[] = [];
	for (const hunk of entry.hunks) {
		docDiffLines.push(`@@ -${hunk.startLineNumber},${hunk.oldLines.length} +${hunk.startLineNumber},${hunk.newLines.length} @@ ${REJECTED_EDIT_TAG}`);
		pushMany(docDiffLines, hunk.oldLines.map(x => `-${x}`));
		pushMany(docDiffLines, hunk.newLines.map(x => `+${x}`));
	}

	const uniquePath = toUniquePath(entry.docId, workspacePath);
	return [`--- ${uniquePath}`, `+++ ${uniquePath}`, ...docDiffLines].join('\n');
}

function generateDocDiff(entry: IXtabHistoryEditEntry, workspacePath: string | undefined): string | null {
	const docDiffLines: string[] = [];

	const lineEdit = RootedEdit.toLineEdit(entry.edit);
	const baseLines = entry.edit.base.getLines();

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

		const startLineNumber = lineEditGroup[0].lineRange.startLineNumber - 1;

		docDiffLines.push(`@@ -${startLineNumber},${oldLines.length} +${startLineNumber},${newLines.length} @@`);
		pushMany(docDiffLines, oldLines.map(x => `-${x}`));
		pushMany(docDiffLines, newLines.map(x => `+${x}`));
	}

	if (docDiffLines.length === 0) {
		return null;
	}

	const uniquePath = toUniquePath(entry.docId, workspacePath);

	const docDiffArr = [
		`--- ${uniquePath}`,
		`+++ ${uniquePath}`,
	];

	pushMany(docDiffArr, docDiffLines);

	const docDiff = docDiffArr.join('\n');

	return docDiff;
}
