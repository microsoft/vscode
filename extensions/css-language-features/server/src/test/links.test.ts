/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'mocha';
import * as assert from 'assert';
import Uri from 'vscode-uri';
import * as path from 'path';
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

	test('url links', function () {
		let testUri = Uri.file(path.resolve(__dirname, '../../test/linkTestFixtures/about.css')).toString();
		let folders = [{ name: 'x', uri: Uri.file(path.resolve(__dirname, '../../test/linkTestFixtures')).toString() }];

		assertLinks('html { background-image: url("hello.html|")',
			[{ offset: 29, value: '"hello.html"', target: 'file:///home/aeschli/workspaces/vscode/extensions/css-language-features/server/test/linkTestFixtures/hello.html' }], testUri, folders
		);
	});
});