/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as embeddedSupport from '../embeddedSupport';
import {TextDocument} from 'vscode-languageserver-types';

import { getLanguageService } from 'vscode-html-languageservice';

suite('HTML Embedded Support', () => {


	function assertEmbeddedLanguageId(value: string, expectedLanguageId: string): void {
		let offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		let document = TextDocument.create('test://test/test.html', 'html', 0, value);

		let position = document.positionAt(offset);
		let ls = getLanguageService();
		let htmlDoc = ls.parseHTMLDocument(document);

		let languageId = embeddedSupport.getEmbeddedLanguageAtPosition(ls, document, htmlDoc, position);
		assert.equal(languageId, expectedLanguageId);
	}

	function assertEmbeddedLanguageContent(value: string, languageId: string, expectedContent: string): void {

		let document = TextDocument.create('test://test/test.html', 'html', 0, value);

		let ls = getLanguageService();
		let htmlDoc = ls.parseHTMLDocument(document);

		let content = embeddedSupport.getEmbeddedContent(ls, document, htmlDoc, languageId);
		assert.equal(content, expectedContent);
	}

	test('Styles', function (): any {
		assertEmbeddedLanguageId('|<html><style>foo { }</style></html>', void 0);
		assertEmbeddedLanguageId('<html|><style>foo { }</style></html>', void 0);
		assertEmbeddedLanguageId('<html><st|yle>foo { }</style></html>', void 0);
		assertEmbeddedLanguageId('<html><style>|foo { }</style></html>', 'css');
		assertEmbeddedLanguageId('<html><style>foo| { }</style></html>', 'css');
		assertEmbeddedLanguageId('<html><style>foo { }|</style></html>', 'css');
		assertEmbeddedLanguageId('<html><style>foo { }</sty|le></html>', void 0);
	});

	test('Style content', function (): any {
		assertEmbeddedLanguageContent('<html><style>foo { }</style></html>', 'css', '             foo { }               ');
		assertEmbeddedLanguageContent('<html><script>var i = 0;</script></html>', 'css', '                                        ');
		assertEmbeddedLanguageContent('<html><style>foo { }</style>Hello<style>foo { }</style></html>', 'css', '             foo { }                    foo { }               ');
		assertEmbeddedLanguageContent('<html>\n  <style>\n    foo { }  \n  </style>\n</html>\n', 'css', '\n         \n    foo { }  \n  \n\n');

	});

	test('Scripts', function (): any {
		assertEmbeddedLanguageId('|<html><script>var i = 0;</script></html>', void 0);
		assertEmbeddedLanguageId('<html|><script>var i = 0;</script></html>', void 0);
		assertEmbeddedLanguageId('<html><scr|ipt>var i = 0;</script></html>', void 0);
		assertEmbeddedLanguageId('<html><script>|var i = 0;</script></html>', 'javascript');
		assertEmbeddedLanguageId('<html><script>var| i = 0;</script></html>', 'javascript');
		assertEmbeddedLanguageId('<html><script>var i = 0;|</script></html>', 'javascript');
		assertEmbeddedLanguageId('<html><script>var i = 0;</scr|ipt></html>', void 0);

		assertEmbeddedLanguageId('<script type="text/javascript">var| i = 0;</script>', 'javascript');
		assertEmbeddedLanguageId('<script type="text/ecmascript">var| i = 0;</script>', 'javascript');
		assertEmbeddedLanguageId('<script type="application/javascript">var| i = 0;</script>', 'javascript');
		assertEmbeddedLanguageId('<script type="application/ecmascript">var| i = 0;</script>', 'javascript');
		assertEmbeddedLanguageId('<script type="application/typescript">var| i = 0;</script>', void 0);
		assertEmbeddedLanguageId('<script type=\'text/javascript\'>var| i = 0;</script>', 'javascript');
	});

	test('Script content', function (): any {
		assertEmbeddedLanguageContent('<html><script>var i = 0;</script></html>', 'javascript', '              var i = 0;                ');
		assertEmbeddedLanguageContent('<script type="text/javascript">var i = 0;</script>', 'javascript', '                               var i = 0;         ');
	});

});