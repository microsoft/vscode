/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IModel} from 'vs/editor/common/editorCommon';
import {IFoldingRange} from 'vs/editor/contrib/folding/common/foldingRange';

export function computeRanges(model: IModel, tabSize: number, minimumRangeSize: number = 1): IFoldingRange[] {

	let result: IFoldingRange[] = [];

	let previousRegions: { indent: number, line: number }[] = [];
	previousRegions.push({ indent: -1, line: model.getLineCount() + 1 }); // sentinel, to make sure there's at least one entry

	for (let line = model.getLineCount(); line > 0; line--) {
		let indent = computeIndentLevel(model.getLineContent(line), tabSize);
		if (indent === -1) {
			continue; // only whitespace
		}

		let previous = previousRegions[previousRegions.length - 1];

		if (previous.indent > indent) {
			// discard all regions with larger indent
			do {
				previousRegions.pop();
				previous = previousRegions[previousRegions.length - 1];
			} while (previous.indent > indent);

			// new folding range
			let endLineNumber = previous.line - 1;
			if (endLineNumber - line >= minimumRangeSize) {
				result.push({ startLineNumber: line, endLineNumber, indent: indent });
			}
		}
		if (previous.indent === indent) {
			previous.line = line;
		} else { // previous.indent < indent
			// new region with a bigger indent
			previousRegions.push({ indent, line });
		}
	}
	return result.reverse();
}


export function computeIndentLevel(line: string, tabSize: number): number {
	let i = 0;
	let indent = 0;
	while (i < line.length) {
		let ch = line.charAt(i);
		if (ch === ' ') {
			indent++;
		} else if (ch === '\t') {
			indent = indent - indent % tabSize + tabSize;
		} else {
			break;
		}
		i++;
	}
	if (i === line.length) {
		return -1; // line only consists of whitespace
	}
	return indent;
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