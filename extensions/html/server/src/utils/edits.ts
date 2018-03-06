/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, TextEdit } from 'vscode-languageserver-types';
import { mergeSort } from './arrays';

export function applyEdits(document: TextDocument, edits: TextEdit[]): string {
	let text = document.getText();
	let sortedEdits = mergeSort(edits, (a, b) => {
		let diff = a.range.start.line - b.range.start.line;
		if (diff === 0) {
			return a.range.start.character - b.range.start.character;
		}
		return 0;
	});
	let lastModifiedOffset = text.length;
	for (let i = sortedEdits.length - 1; i >= 0; i--) {
		let e = sortedEdits[i];
		let startOffset = document.offsetAt(e.range.start);
		let endOffset = document.offsetAt(e.range.end);
		if (endOffset <= lastModifiedOffset) {
			text = text.substring(0, startOffset) + e.newText + text.substring(endOffset, text.length);
		} else {
			throw new Error('Ovelapping edit');
		}
		lastModifiedOffset = startOffset;
	}
	return text;
}