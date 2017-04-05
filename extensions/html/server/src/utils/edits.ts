/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, TextEdit, Position } from 'vscode-languageserver-types';

export function applyEdits(document: TextDocument, edits: TextEdit[]): string {
	let text = document.getText();
	let sortedEdits = edits.sort((a, b) => {
		let startDiff = comparePositions(a.range.start, b.range.start);
		if (startDiff === 0) {
			return comparePositions(a.range.end, b.range.end);
		}
		return startDiff;
	});
	let lastOffset = text.length;
	sortedEdits.forEach(e => {
		let startOffset = document.offsetAt(e.range.start);
		let endOffset = document.offsetAt(e.range.end);
		text = text.substring(0, startOffset) + e.newText + text.substring(endOffset, text.length);
		lastOffset = startOffset;
	});
	return text;
}

function comparePositions(p1: Position, p2: Position) {
	let diff = p2.line - p1.line;
	if (diff === 0) {
		return p2.character - p1.character;
	}
	return diff;
}