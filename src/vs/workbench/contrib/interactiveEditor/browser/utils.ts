/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineRange } from 'vs/editor/common/core/lineRange';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';

export function invertLineRange(range: LineRange, model: ITextModel): LineRange[] {
	if (range.isEmpty) {
		return [];
	}
	const result: LineRange[] = [];
	result.push(new LineRange(1, range.startLineNumber));
	result.push(new LineRange(range.endLineNumberExclusive, model.getLineCount() + 1));
	return result.filter(r => !r.isEmpty);
}

export function lineRangeAsRange(r: LineRange): Range {
	return new Range(r.startLineNumber, 1, r.endLineNumberExclusive - 1, 1);
}
