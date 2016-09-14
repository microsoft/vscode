
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as htmlLinks from '../services/htmlLinks';
import {CompletionList, TextDocument, TextEdit, Position, CompletionItemKind} from 'vscode-languageserver-types';
import Uri from 'vscode-uri';
import * as htmlLanguageService from '../htmlLanguageService';

suite('HTML Link Detection', () => {

	function testLinkCreation(modelUrl:string, rootUrl:string, tokenContent:string, expected:string): void {
		let document = TextDocument.create(modelUrl, 'html', 0, `<a href="${tokenContent}">`);
		let ls = htmlLanguageService.getLanguageService();
		let links = ls.findDocumentLinks(document, rootUrl);
		assert.equal(links[0] && links[0].target, expected);
	}

	function testLinkDetection(value:string, expectedLinkLocations:number[]): void {
		let document = TextDocument.create('test://test/test.html', 'html', 0, value);

		let ls = htmlLanguageService.getLanguageService();
		let links = ls.findDocumentLinks(document, 'test://test');
		assert.deepEqual(links.map(l => l.range.start.character), expectedLinkLocations);
	}

	test('Link creation', () => {
		testLinkCreation('inmemory://model/1', null, 'javascript:void;', null);
		testLinkCreation('inmemory://model/1', null, ' \tjavascript:alert(7);', null);
		testLinkCreation('inmemory://model/1', null, ' #relative', null);
		testLinkCreation('inmemory://model/1', null, 'file:///C:\\Alex\\src\\path\\to\\file.txt', 'file:///C:\\Alex\\src\\path\\to\\file.txt');
		testLinkCreation('inmemory://model/1', null, 'http://www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', null, 'https://www.microsoft.com/', 'https://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', null, '//www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', null, '../../a.js', 'inmemory://model/a.js');

		testLinkCreation('inmemory://model/1', 'inmemory://model/', 'javascript:void;', null);
		testLinkCreation('inmemory://model/1', 'inmemory://model/', ' \tjavascript:alert(7);', null);
		testLinkCreation('inmemory://model/1', 'inmemory://model/', ' #relative', null);
		testLinkCreation('inmemory://model/1', 'inmemory://model/', 'file:///C:\\Alex\\src\\path\\to\\file.txt', 'file:///C:\\Alex\\src\\path\\to\\file.txt');
		testLinkCreation('inmemory://model/1', 'inmemory://model/', 'http://www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', 'inmemory://model/', 'https://www.microsoft.com/', 'https://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', 'inmemory://model/', '  //www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', 'inmemory://model/', '../../a.js', 'inmemory://model/a.js');

		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'javascript:void;', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, ' \tjavascript:alert(7);', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, ' #relative', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'file:///C:\\Alex\\src\\path\\to\\file.txt', 'file:///C:\\Alex\\src\\path\\to\\file.txt');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'http://www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'https://www.microsoft.com/', 'https://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, '  //www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'a.js', 'file:///c:/Alex/src/path/to/a.js');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, '/a.js', 'file:///a.js');

		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', 'javascript:void;', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', ' \tjavascript:alert(7);', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', ' #relative', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'file:///C:\\Alex\\src\\path\\to\\file.txt', 'file:///C:\\Alex\\src\\path\\to\\file.txt');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', 'http://www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', 'https://www.microsoft.com/', 'https://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', 'https://www.microsoft.com/?q=1#h', 'https://www.microsoft.com/?q=1#h');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', '  //www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', 'a.js', 'file:///c:/Alex/src/path/to/a.js');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', '/a.js', 'file:///c:/Alex/src/a.js');

		testLinkCreation('https://www.test.com/path/to/file.txt', null, 'file:///C:\\Alex\\src\\path\\to\\file.txt', 'file:///C:\\Alex\\src\\path\\to\\file.txt');
		testLinkCreation('https://www.test.com/path/to/file.txt', null, '//www.microsoft.com/', 'https://www.microsoft.com/');
		testLinkCreation('https://www.test.com/path/to/file.txt', 'https://www.test.com', '//www.microsoft.com/', 'https://www.microsoft.com/');

		// invalid uris don't throw
		testLinkCreation('https://www.test.com/path/to/file.txt', 'https://www.test.com', '%', 'https://www.test.com/path/to/%');

		// Bug #18314: Ctrl + Click does not open existing file if folder's name starts with 'c' character
		testLinkCreation('file:///c:/Alex/working_dir/18314-link-detection/test.html', 'file:///c:/Alex/working_dir/18314-link-detection/', '/class/class.js', 'file:///c:/Alex/working_dir/18314-link-detection/class/class.js');
	});

	test('Link detection', () => {
		testLinkDetection('<img src="foo.png">', [ 9 ]);
		testLinkDetection('<a href="http://server/foo.html">', [ 8 ]);
	});

});