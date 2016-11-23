/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IModel } from 'vs/editor/common/editorCommon';
import { IFoldingRange } from 'vs/editor/contrib/folding/common/foldingModel';

export function computeRanges(model: IModel): IFoldingRange[] {
	// we get here a clone of the model's indent ranges
	return model.getIndentRanges();
}

/**
 * Limits the number of folding ranges by removing ranges with larger indent levels
 */
export function limitByIndent(ranges: IFoldingRange[], maxEntries: number): IFoldingRange[] {
	if (ranges.length <= maxEntries) {
		return ranges;
	}

	let indentOccurrences = [];
	ranges.forEach(r => {
		if (r.indent < 1000) {
			indentOccurrences[r.indent] = (indentOccurrences[r.indent] || 0) + 1;
		}
	});
	let maxIndent = indentOccurrences.length;
	for (let i = 0; i < indentOccurrences.length; i++) {
		if (indentOccurrences[i]) {
			maxEntries -= indentOccurrences[i];
			if (maxEntries < 0) {
				maxIndent = i;
				break;
			}
		}

	}
	return ranges.filter(r => r.indent < maxIndent);
}