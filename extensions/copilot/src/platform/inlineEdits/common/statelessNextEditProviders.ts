/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineEdit, LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { StatelessNextEditDocument } from './statelessNextEditProvider';

export class IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges {
	public static filterEdit(resultDocument: StatelessNextEditDocument, singleEdits: readonly LineReplacement[]): readonly LineReplacement[] {
		const filteredEdits = singleEdits.filter(e => !IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges._isWhitespaceOnlyChange(e, resultDocument.documentAfterEditsLines));
		return filteredEdits;
	}

	private static _isWhitespaceOnlyChange(edit: LineReplacement, baseLines: string[]): boolean {
		const originalLines = edit.lineRange.toOffsetRange().slice(baseLines);
		const newLines = edit.newLines;

		const isRemoval = newLines.length === 0;

		// is removing empty lines
		if (isRemoval && originalLines.every(line => line.trim() === '')) {
			return true;
		}

		// is adding empty lines
		if (!isRemoval && newLines.every(line => line.trim() === '')) {
			return true;
		}

		if (originalLines.length !== newLines.length) {
			return false;
		}

		for (let i = 0; i < originalLines.length; i++) {
			const originalLine = originalLines[i];
			const newLine = newLines[i];
			if (originalLine.trim() !== newLine.trim()) {
				return false;
			}
		}
		return true;
	}
}

export class IgnoreWhitespaceOnlyChanges {
	public static filterEdit(resultDocument: StatelessNextEditDocument, singleEdits: readonly LineReplacement[]): readonly LineReplacement[] {
		return singleEdits.filter(e => !IgnoreWhitespaceOnlyChanges._isFormattingOnlyChange(resultDocument.documentAfterEditsLines, e));
	}

	/**
	 * @remarks public only for testing
	 */
	public static _isFormattingOnlyChange(baseLines: string[], singleEdit: LineReplacement): boolean {
		const originalLines = singleEdit.lineRange.toOffsetRange().slice(baseLines).join('').replace(/\s/g, '');
		const newLines = singleEdit.newLines.join('').replace(/\s/g, '');
		return originalLines === newLines;
	}
}

export function editWouldDeleteWhatWasJustInserted(activeDocument: StatelessNextEditDocument, lineEdit: LineEdit) {
	let edit = lineEdit.toEdit(activeDocument.documentAfterEdits);
	// ! important: reduce it to the minimal set of changes
	edit = edit.normalizeOnSource(activeDocument.documentAfterEdits.value);
	if (!editIsDeletion(edit)) {
		return false;
	}
	// We are deleting something. Is it what was just inserted?
	for (let i = activeDocument.recentEdits.edits.length - 1; i >= 0; i--) {
		const recentEdit = activeDocument.recentEdits.edits[i];
		const rebaseResult = edit.tryRebase(recentEdit);
		if (!rebaseResult) {
			// the edit we want to do cannot be rebased, which indicates that it would interfere with a recent edit
			return true;
		}
		edit = rebaseResult;
	}
	return false;
}
export function editIsDeletion(edit: StringEdit): boolean {
	const deletedChars = edit.replacements.reduce((acc, singleEdit) => acc + singleEdit.replaceRange.length, 0);
	const insertedChars = edit.replacements.reduce((acc, singleEdit) => acc + singleEdit.newText.length, 0);
	return insertedChars === 0 && deletedChars > 0;
}

export function editWouldDeleteWhatWasJustInserted2(activeDocument: StatelessNextEditDocument, lineEdit: LineEdit) {
	let edit = lineEdit.toEdit(activeDocument.documentAfterEdits);
	// ! important: reduce it to the minimal set of changes
	edit = edit.normalizeOnSource(activeDocument.documentAfterEdits.value);
	if (!editIsDeletion(edit)) {
		return false;
	}

	let documentContents = activeDocument.documentAfterEdits.value;

	for (let i = activeDocument.recentEdits.edits.length - 1; i >= 0; i--) {
		const recentEdit = activeDocument.recentEdits.edits[i];
		const recentEditInverse = recentEdit.inverse(documentContents);

		if (recentEditInverse.equals(edit)) {
			return true;
		}

		documentContents = recentEditInverse.apply(documentContents);
	}

	return false;
}
