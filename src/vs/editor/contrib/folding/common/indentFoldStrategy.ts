/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IFoldingRange} from 'vs/editor/contrib/folding/common/foldingRange';

export function computeRanges(model:EditorCommon.IModel, tabSize: number, minimumRangeSize: number = 1) : IFoldingRange[] {

	let result : IFoldingRange[] = [];

	let createRange = (startLineNumber: number, endLineNumber: number) => {
		// create a collapsible region only if has the minimumRangeSize
		if (endLineNumber - startLineNumber >= minimumRangeSize) {
			result.push({startLineNumber, endLineNumber});
		}
	}

	var previousRegions : { indent: number, line: number}[] = [];
	previousRegions.push({indent: -1, line: model.getLineCount() + 1}); // sentinel, not make sure there's at least one entry

	for (var line = model.getLineCount(); line > 0; line--) {
		var indent = computeIndentLevel(model.getLineContent(line), tabSize);
		let previous = previousRegions[previousRegions.length - 1];

		// all previous regions with larger indent can be completed
		if (previous.indent > indent) {
			do {
				previousRegions.pop();
				previous = previousRegions[previousRegions.length - 1];
			} while (previous.indent > indent);
			createRange(line, previous.line - 1);
			if (previous.indent === indent) {
				previous.line = line;
			}
		}

		if (previous.indent < indent) {
			// new region with a bigger indent
			previousRegions.push({indent, line});
		}
	}
	return result;
}


function computeIndentLevel(line: string, tabSize: number): number {
	let i = 0;
	let indent = 0;
	while (i < line.length) {
		let ch = line.charAt(i);
		if (ch === ' ') {
			indent++;
		} else if (ch === '\t') {
			indent++;
			indent += (indent % tabSize);
		} else {
			break;
		}
		i++;
	}
	return indent;
}
