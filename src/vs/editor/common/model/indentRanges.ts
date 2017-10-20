/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITextModel } from 'vs/editor/common/editorCommon';
import { FoldingMarkers } from 'vs/editor/common/modes/languageConfiguration';

export class IndentRange {
	_indentRangeBrand: void;
	startLineNumber: number;
	endLineNumber: number;
	indent: number;
	marker: boolean;

	constructor(startLineNumber: number, endLineNumber: number, indent: number, marker?: boolean) {
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
		this.indent = indent;
		this.marker = marker;
	}

	public static deepCloneArr(indentRanges: IndentRange[]): IndentRange[] {
		let result: IndentRange[] = [];
		for (let i = 0, len = indentRanges.length; i < len; i++) {
			let r = indentRanges[i];
			result[i] = new IndentRange(r.startLineNumber, r.endLineNumber, r.indent);
		}
		return result;
	}
}

interface PreviousRegion { indent: number; line: number; marker: boolean; };

export function computeRanges(model: ITextModel, offSide: boolean, markers?: FoldingMarkers, minimumRangeSize: number = 1): IndentRange[] {

	let result: IndentRange[] = [];

	let pattern = void 0;
	if (markers) {
		pattern = new RegExp(`(${markers.start.source})|(?:${markers.end.source})`);
	}

	let previousRegions: PreviousRegion[] = [];
	previousRegions.push({ indent: -1, line: model.getLineCount() + 1, marker: false }); // sentinel, to make sure there's at least one entry

	for (let line = model.getLineCount(); line > 0; line--) {
		let indent = model.getIndentLevel(line);
		let previous = previousRegions[previousRegions.length - 1];
		if (indent === -1) {
			if (offSide && !previous.marker) {
				// for offSide languages, empty lines are associated to the next block
				previous.line = line;
			}
			continue; // only whitespace
		}
		let m;
		if (pattern && (m = model.getLineContent(line).match(pattern))) {
			// folding pattern match
			if (m[1]) { // start pattern match
				// discard all regions until the folding pattern
				let i = previousRegions.length - 1;
				while (i > 0 && !previousRegions[i].marker) {
					i--;
				}
				if (i > 0) {
					previousRegions.length = i + 1;
					previous = previousRegions[i];

					// new folding range from pattern, includes the end line
					result.push(new IndentRange(line, previous.line, indent, true));
					previous.marker = false;
					previous.indent = indent;
					previous.line = line;
					continue;
				} else {
					// no end marker found, treat line as a regular line
				}
			} else { // end pattern match
				previousRegions.push({ indent: -2, line, marker: true });
				continue;
			}
		}
		if (previous.indent > indent) {
			// discard all regions with larger indent
			do {
				previousRegions.pop();
				previous = previousRegions[previousRegions.length - 1];
			} while (previous.indent > indent);

			// new folding range
			let endLineNumber = previous.line - 1;
			if (endLineNumber - line >= minimumRangeSize) {
				result.push(new IndentRange(line, endLineNumber, indent));
			}
		}
		if (previous.indent === indent) {
			previous.line = line;
		} else { // previous.indent < indent
			// new region with a bigger indent
			previousRegions.push({ indent, line, marker: false });
		}
	}

	return result.reverse();
}
