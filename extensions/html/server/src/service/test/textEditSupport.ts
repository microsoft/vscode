/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TextDocument, TextEdit} from 'vscode-languageserver-types';
import * as assert from 'assert';

export function applyEdits(document: TextDocument, edits: TextEdit[]): string {
	let text = document.getText();
	let sortedEdits = edits.sort((a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start));
	let lastOffset = text.length;
	sortedEdits.forEach(e => {
		let startOffset = document.offsetAt(e.range.start);
		let endOffset = document.offsetAt(e.range.end);
		assert.ok(startOffset <= endOffset);
		assert.ok(endOffset <= lastOffset);
		text = text.substring(0, startOffset) + e.newText + text.substring(endOffset, text.length);
		lastOffset = startOffset;
	});
	return text;
}