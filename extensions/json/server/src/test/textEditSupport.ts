/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ITextDocument, TextEdit} from 'vscode-languageserver';
import assert = require('assert');

export function applyEdits(document: ITextDocument, edits: TextEdit[]) : string {
	let formatted = document.getText();
	let sortedEdits = edits.sort((a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start));
	let lastOffset = formatted.length;
	sortedEdits.forEach(e => {
		let startOffset = document.offsetAt(e.range.start);
		let endOffset = document.offsetAt(e.range.end);
		assert.ok(startOffset <= endOffset);
		assert.ok(endOffset <= lastOffset);
		formatted = formatted.substring(0, startOffset) + e.newText + formatted.substring(endOffset, formatted.length);
		lastOffset = startOffset;
	});
	return formatted;
}