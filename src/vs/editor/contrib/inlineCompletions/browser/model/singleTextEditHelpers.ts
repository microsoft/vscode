/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commonPrefixLength } from '../../../../../base/common/strings.js';
import { Range } from '../../../../common/core/range.js';
import { TextLength } from '../../../../common/core/textLength.js';
import { SingleTextEdit } from '../../../../common/core/textEdit.js';
import { EndOfLinePreference, ITextModel } from '../../../../common/model.js';

export function singleTextRemoveCommonPrefix(edit: SingleTextEdit, model: ITextModel, validModelRange?: Range): SingleTextEdit {
	const modelRange = validModelRange ? edit.range.intersectRanges(validModelRange) : edit.range;
	if (!modelRange) {
		return edit;
	}
	const valueToReplace = model.getValueInRange(modelRange, EndOfLinePreference.LF);
	const commonPrefixLen = commonPrefixLength(valueToReplace, edit.text);
	const start = TextLength.ofText(valueToReplace.substring(0, commonPrefixLen)).addToPosition(edit.range.getStartPosition());
	const text = edit.text.substring(commonPrefixLen);
	const range = Range.fromPositions(start, edit.range.getEndPosition());
	return new SingleTextEdit(range, text);
}

export function singleTextEditAugments(edit: SingleTextEdit, base: SingleTextEdit): boolean {
	// The augmented completion must replace the base range, but can replace even more
	return edit.text.startsWith(base.text) && rangeExtends(edit.range, base.range);
}

function rangeExtends(extendingRange: Range, rangeToExtend: Range): boolean {
	return rangeToExtend.getStartPosition().equals(extendingRange.getStartPosition())
		&& rangeToExtend.getEndPosition().isBeforeOrEqual(extendingRange.getEndPosition());
}
