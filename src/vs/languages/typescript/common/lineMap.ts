/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import EditorCommon = require('vs/editor/common/editorCommon');

interface LineMap {
	getOffset(position: EditorCommon.IPosition): number;
	getSpanFromRange(range: EditorCommon.IRange): { start: number; length: number };
	getPositionFromOffset(position: number): EditorCommon.IPosition;
	getRangeFromSpan(span: { start: number; length: number; }): EditorCommon.IRange;
}

namespace LineMap {

	export function create(text: string): LineMap {

		var lineStarts = strings.computeLineStarts(text);

		function getOffset(position: EditorCommon.IPosition) {
			return lineStarts[position.lineNumber - 1] + position.column - 1;
		}

		function getSpanFromRange(range: EditorCommon.IRange) {
			var start = lineStarts[range.startLineNumber - 1] + range.startColumn - 1;
			var length = lineStarts[range.endLineNumber - 1] + range.endColumn - 1 - start;
			return {
				start,
				length
			};
		}

		function getPositionFromOffset(position: number) {
			var line = 1;
			for (line = 1; line < lineStarts.length; line++) {
				if (lineStarts[line] > position) {
					break;
				}
			}
			return {
				lineNumber: line,
				column: 1 + position - lineStarts[line - 1]
			};
		}

		function getRangeFromSpan(span: { start: number; length: number; }) {
			var startPosition = getPositionFromOffset(span.start);
			var endPosition = getPositionFromOffset(span.start + span.length);
			return {
				startLineNumber: startPosition.lineNumber,
				startColumn: startPosition.column,
				endLineNumber: endPosition.lineNumber,
				endColumn: endPosition.column,
			};
		}

		return {
			getOffset,
			getSpanFromRange,
			getPositionFromOffset,
			getRangeFromSpan
		};
	}
}

export = LineMap;