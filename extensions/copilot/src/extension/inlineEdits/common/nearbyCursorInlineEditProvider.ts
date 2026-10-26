/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StatelessNextEditDocument } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { Range } from '../../../util/vs/editor/common/core/range';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';

/**
 * Read the selection from the document, otherwise deduce it from the last edit.
 */
export function getOrDeduceSelectionFromLastEdit(activeDoc: StatelessNextEditDocument): Range | null {
	const origin = new OffsetRange(0, 0);
	if (activeDoc.lastSelectionInAfterEdit && !activeDoc.lastSelectionInAfterEdit.equals(origin)) {
		return activeDoc.documentAfterEdits.getTransformer().getRange(activeDoc.lastSelectionInAfterEdit);
	}

	const selectionRange = deduceSelectionFromLastEdit(activeDoc);
	return selectionRange;
}

function deduceSelectionFromLastEdit(activeDoc: StatelessNextEditDocument): Range | null {
	const mostRecentEdit = activeDoc.recentEdits.edits.at(-1);
	if (mostRecentEdit === undefined) {
		return null;
	}

	const mostRecentSingleEdit = mostRecentEdit.replacements.at(-1);
	if (mostRecentSingleEdit === undefined) {
		return null;
	}

	const offsetRange = mostRecentSingleEdit.replaceRange;
	const newText = mostRecentSingleEdit.newText;
	const change = newText.length - offsetRange.length;
	const newOffset = offsetRange.endExclusive + change;

	const selectionRange = activeDoc.documentAfterEdits.getTransformer().getRange(new OffsetRange(newOffset, newOffset));

	return selectionRange;
}
