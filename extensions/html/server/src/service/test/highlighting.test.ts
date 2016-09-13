/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as htmlLanguageService from '../htmlLanguageService';
import {CompletionList, TextDocument, TextEdit, Position, CompletionItemKind} from 'vscode-languageserver-types';

export function assertHighlights(value: string, expectedMatches: number[], elementName: string): void {
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

	test('Single', function (): any {
		assertHighlights('|<html></html>', [], null);
		assertHighlights('<|html></html>', [1, 8], 'html');
		assertHighlights('<h|tml></html>', [1, 8], 'html');
		assertHighlights('<htm|l></html>', [1, 8], 'html');
		assertHighlights('<html|></html>', [1, 8], 'html');
		assertHighlights('<html>|</html>', [], null);
		assertHighlights('<html><|/html>', [], null);
		assertHighlights('<html></|html>', [1, 8], 'html');
		assertHighlights('<html></h|tml>', [1, 8], 'html');
		assertHighlights('<html></ht|ml>', [1, 8], 'html');
		assertHighlights('<html></htm|l>', [1, 8], 'html');
		assertHighlights('<html></html|>', [1, 8], 'html');
		assertHighlights('<html></html>|', [], null);

	});

	test('Nested', function (): any {
		assertHighlights('<html>|<div></div></html>', [], null);
		assertHighlights('<html><|div></div></html>', [7, 13], 'div');
		assertHighlights('<html><div>|</div></html>', [], null);
		assertHighlights('<html><div></di|v></html>', [7, 13], 'div');
		assertHighlights('<html><div><div></div></di|v></html>', [7, 24], 'div');
		assertHighlights('<html><div><div></div|></div></html>', [12, 18], 'div');
		assertHighlights('<html><div><div|></div></div></html>', [12, 18], 'div');
		assertHighlights('<html><div><div></div></div></h|tml>', [1, 30], 'html');
		assertHighlights('<html><di|v></div><div></div></html>', [7, 13], 'div');
		assertHighlights('<html><div></div><div></d|iv></html>', [18, 24], 'div');
	});

	test('Selfclosed', function (): any {
		assertHighlights('<html><|div/></html>', [ 7 ], 'div');
		assertHighlights('<html><|br></html>', [ 7 ], 'br');
		assertHighlights('<html><div><d|iv/></div></html>', [ 12 ], 'div');
	});


});