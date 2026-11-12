/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IArcTextEdit } from '../../../../base/common/editArcTracker.js';
import { IOffsetEdit } from '../../common/diffComputeService.js';

/** Returns only reconstructing diff edits; whole-file fallbacks would attribute unchanged interior text to the agent. */
export function createArcTextEditFromDiff(changes: readonly IOffsetEdit[], beforeText: string, afterText: string): IArcTextEdit | undefined {
	const edit: IArcTextEdit = {
		replacements: changes.map(change => ({
			start: change.startOffset,
			endExclusive: change.endOffsetExclusive,
			text: change.newText,
		}))
	};
	return applyEdit(beforeText, edit) === afterText ? edit : undefined;
}

function applyEdit(value: string, edit: IArcTextEdit): string {
	let result = '';
	let offset = 0;
	for (const replacement of edit.replacements) {
		result += value.substring(offset, replacement.start);
		result += replacement.text;
		offset = replacement.endExclusive;
	}
	return result + value.substring(offset);
}
