/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { matchesSubString } from '../../../../../base/common/filters.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { ITextModel, EndOfLinePreference } from '../../../../common/model.js';
import { singleTextRemoveCommonPrefix } from './singleTextEditHelpers.js';

export function inlineCompletionIsVisible(singleTextEdit: TextReplacement, originalRange: Range | undefined, model: ITextModel, cursorPosition: Position): boolean {
	const minimizedReplacement = singleTextRemoveCommonPrefix(singleTextEdit, model);
	const editRange = singleTextEdit.range;
	if (!editRange
		|| (originalRange && !originalRange.getStartPosition().equals(editRange.getStartPosition()))
		|| cursorPosition.lineNumber !== minimizedReplacement.range.startLineNumber
		|| minimizedReplacement.isEmpty // if the completion is empty after removing the common prefix of the completion and the model, the completion item would not be visible
	) {
		return false;
	}

	// We might consider comparing by .toLowerText, but this requires GhostTextReplacement
	const originalValue = model.getValueInRange(minimizedReplacement.range, EndOfLinePreference.LF);
	const filterText = minimizedReplacement.text;

	const cursorPosIndex = Math.max(0, cursorPosition.column - minimizedReplacement.range.startColumn);

	let filterTextBefore = filterText.substring(0, cursorPosIndex);
	let filterTextAfter = filterText.substring(cursorPosIndex);

	let originalValueBefore = originalValue.substring(0, cursorPosIndex);
	let originalValueAfter = originalValue.substring(cursorPosIndex);

	const originalValueIndent = model.getLineIndentColumn(minimizedReplacement.range.startLineNumber);
	if (minimizedReplacement.range.startColumn <= originalValueIndent) {
		// Remove indentation
		originalValueBefore = originalValueBefore.trimStart();
		if (originalValueBefore.length === 0) {
			originalValueAfter = originalValueAfter.trimStart();
		}
		filterTextBefore = filterTextBefore.trimStart();
		if (filterTextBefore.length === 0) {
			filterTextAfter = filterTextAfter.trimStart();
		}
	}

	return filterTextBefore.startsWith(originalValueBefore)
		&& !!matchesSubString(originalValueAfter, filterTextAfter);
}
