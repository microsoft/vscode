/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITokenizedModel } from 'vs/editor/common/editorCommon';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';

export class IndentRange {
	_indentRangeBrand: void;
	startLineNumber: number;
	endLineNumber: number;
	indent: number;

	constructor(startLineNumber: number, endLineNumber: number, indent: number) {
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
		this.indent = indent;
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

export function computeRanges(model: ITokenizedModel, minimumRangeSize: number = 1): IndentRange[] {

	let result: IndentRange[] = [];
	let foldingRules = LanguageConfigurationRegistry.getFoldingRules(model.getLanguageIdentifier().id);
	let offSide = foldingRules && foldingRules.indendationBasedFolding && foldingRules.indendationBasedFolding.offSide;

	let previousRegions: { indent: number, line: number }[] = [];
	previousRegions.push({ indent: -1, line: model.getLineCount() + 1 }); // sentinel, to make sure there's at least one entry

	for (let line = model.getLineCount(); line > 0; line--) {
		let indent = model.getIndentLevel(line);
		let previous = previousRegions[previousRegions.length - 1];
		if (indent === -1) {
			if (offSide) {
				// for offSide languages, empty lines are associated to the next block
				previous.line = line;
			}
			continue; // only whitespace
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
			previousRegions.push({ indent, line });
		}
	}

	return result.reverse();
}
