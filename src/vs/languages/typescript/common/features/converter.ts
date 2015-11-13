/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

/**
 * @returns The character offset of the {{position}} using the {{tree}}.
 */
export function getOffset(file:ts.SourceFile, position:EditorCommon.IPosition):number {
	return file.getPositionOfLineAndCharacter(position.lineNumber - 1, position.column - 1);
}

/**
 * @returns The character offset of the start position using the {{tree}}.
 */
export function getStartOffset(file:ts.SourceFile, range:EditorCommon.IRange):number {
	return file.getPositionOfLineAndCharacter(range.startLineNumber - 1, range.startColumn - 1);
}

/**
 * @returns The character offset of the end position using the {{tree}}.
 */
export function getEndOffset(file:ts.SourceFile, range:EditorCommon.IRange):number {
	return file.getPositionOfLineAndCharacter(range.endLineNumber - 1, range.endColumn - 1);
}

export function getPosition(file:ts.SourceFile, offset:number):EditorCommon.IPosition {
	offset = sanitizePosition(file, offset);
	var lineAndCharactor = file.getLineAndCharacterOfPosition(offset);
	return {
		lineNumber: 1 + lineAndCharactor.line,
		column: 1 + lineAndCharactor.character
	};
}

/**
 * @returns The {{IRange}} for the {{start}} and {{end}} parameters using the {{tree}}.
 */
export function getRange(file: ts.SourceFile, startOrSpan: number|ts.TextSpan, endOrEmpty?: number|boolean, empty?: boolean): EditorCommon.IRange {

	var start: number,
		end: number;

	if (typeof endOrEmpty === 'number') {
		end = endOrEmpty;
	} else {
		empty = endOrEmpty;
	}

	if (typeof startOrSpan === 'number') {
		start = startOrSpan;
	} else {
		start = startOrSpan.start;
		end = start + startOrSpan.length;
	}

	start = sanitizePosition(file, start);
	end = sanitizePosition(file, end);

	if(empty) {
		var p1 = file.getLineAndCharacterOfPosition(start);
		return {
			startLineNumber: 1 + p1.line,
			startColumn: 1 + p1.character,
			endLineNumber: 1 + p1.line,
			endColumn: 1 + p1.character
		};

	} else {
		var p1 = file.getLineAndCharacterOfPosition(start),
			p2 = file.getLineAndCharacterOfPosition(end);

		return {
			startLineNumber: 1 + p1.line,
			startColumn: 1 + p1.character,
			endLineNumber: 1 + p2.line,
			endColumn: 1 + p2.character
		};
	}
}

function sanitizePosition(sourceFile: ts.SourceFile, position: number): number {
	var length = sourceFile.getFullWidth();
	// The value `length` is a valid position and denotes the end of the text
	return position > length ? length : position;
}
