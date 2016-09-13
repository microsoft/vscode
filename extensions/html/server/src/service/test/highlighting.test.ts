/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as htmlLanguageService from '../htmlLanguageService';
import {CompletionList, TextDocument, TextEdit, Position, CompletionItemKind} from 'vscode-languageserver-types';

export function assertHighlights(value: string, expectedMatches: number[], elementName: string): Thenable<void> {
	let offset = value.indexOf('|');
	value = value.substr(0, offset) + value.substr(offset + 1);

	let document = TextDocument.create('test://test/test.html', 'html', 0, value);
	let htmlDocument = htmlLanguageService.getLanguageService().parseHTMLDocument(document);

	let position = document.positionAt(offset);
	let ls = htmlLanguageService.getLanguageService();
	let htmlDoc = ls.parseHTMLDocument(document);

	let highlights = ls.findDocumentHighlights(document, position, htmlDoc);
	assert.equal(highlights.length, expectedMatches.length);
	for (let i = 0; i < highlights.length; i++) {
		let actualStartOffset = document.offsetAt(highlights[i].range.start);
		assert.equal(actualStartOffset, expectedMatches[i]);
		let actualEndOffset = document.offsetAt(highlights[i].range.end);
		assert.equal(actualEndOffset, expectedMatches[i] + elementName.length);

		assert.equal(document.getText().substring(actualStartOffset, actualEndOffset), elementName);
	}
}

suite('HTML Highlighting', () => {



	test('Highlighting', function (testDone): any {
		testHighlighting



}