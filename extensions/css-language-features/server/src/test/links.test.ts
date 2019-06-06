/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'mocha';
import * as assert from 'assert';
import Uri from 'vscode-uri';
import { resolve } from 'path';
import { TextDocument, DocumentLink } from 'vscode-languageserver-types';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { getCSSLanguageService } from 'vscode-css-languageservice';
import { getDocumentContext } from '../utils/documentContext';

export interface ItemDescription {
	offset: number;
	value: string;
	target: string;
}

suite('Links', () => {
	const cssLanguageService = getCSSLanguageService();

	let assertLink = function (links: DocumentLink[], expected: ItemDescription, document: TextDocument) {
		let matches = links.filter(link => {
			return document.offsetAt(link.range.start) === expected.offset;
		});

		assert.equal(matches.length, 1, `${expected.offset} should only existing once: Actual: ${links.map(l => document.offsetAt(l.range.start)).join(', ')}`);
		let match = matches[0];
		assert.equal(document.getText(match.range), expected.value);
		assert.equal(match.target, expected.target);
	};

	function assertLinks(value: string, expected: ItemDescription[], testUri: string, workspaceFolders?: WorkspaceFolder[], lang: string = 'css'): void {
		const offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		const document = TextDocument.create(testUri, lang, 0, value);

		if (!workspaceFolders) {
			workspaceFolders = [{ name: 'x', uri: testUri.substr(0, testUri.lastIndexOf('/')) }];
		}

		const context = getDocumentContext(testUri, workspaceFolders);

		const stylesheet = cssLanguageService.parseStylesheet(document);
		let links = cssLanguageService.findDocumentLinks(document, stylesheet, context)!;

		assert.equal(links.length, expected.length);

		for (let item of expected) {
			assertLink(links, item, document);
		}
	}

	function getTestResource(path: string) {
		return Uri.file(resolve(__dirname, '../../test/linksTestFixtures', path)).toString();
	}

	test('url links', function () {

		let testUri = getTestResource('about.css');
		let folders = [{ name: 'x', uri: getTestResource('') }];

		assertLinks('html { background-image: url("hello.html|")',
			[{ offset: 29, value: '"hello.html"', target: getTestResource('hello.html') }], testUri, folders
		);
	});

	test('node module resolving', function () {

		let testUri = getTestResource('about.css');
		let folders = [{ name: 'x', uri: getTestResource('') }];

		assertLinks('html { background-image: url("~foo/hello.html|")',
			[{ offset: 29, value: '"~foo/hello.html"', target: getTestResource('node_modules/foo/hello.html') }], testUri, folders
		);
	});
});