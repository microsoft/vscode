/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'mocha';
import * as assert from 'assert';
import { URI } from 'vscode-uri';
import { resolve } from 'path';
import { TextDocument, DocumentLink } from 'vscode-languageserver-types';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { getCSSLanguageService } from 'vscode-css-languageservice';
import { getDocumentContext } from '../utils/documentContext';
import { getNodeFSRequestService } from '../node/nodeFs';

export interface ItemDescription {
	offset: number;
	value: string;
	target: string;
}

suite('Links', () => {
	const cssLanguageService = getCSSLanguageService({ fileSystemProvider: getNodeFSRequestService() });

	const assertLink = function (links: DocumentLink[], expected: ItemDescription, document: TextDocument) {
		const matches = links.filter(link => {
			return document.offsetAt(link.range.start) === expected.offset;
		});

		assert.strictEqual(matches.length, 1, `${expected.offset} should only existing once: Actual: ${links.map(l => document.offsetAt(l.range.start)).join(', ')}`);
		const match = matches[0];
		assert.strictEqual(document.getText(match.range), expected.value);
		assert.strictEqual(match.target, expected.target);
	};

	async function assertLinks(value: string, expected: ItemDescription[], testUri: string, workspaceFolders?: WorkspaceFolder[], lang: string = 'css'): Promise<void> {
		const offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		const document = TextDocument.create(testUri, lang, 0, value);

		if (!workspaceFolders) {
			workspaceFolders = [{ name: 'x', uri: testUri.substr(0, testUri.lastIndexOf('/')) }];
		}

		const context = getDocumentContext(testUri, workspaceFolders);

		const stylesheet = cssLanguageService.parseStylesheet(document);
		const links = await cssLanguageService.findDocumentLinks2(document, stylesheet, context)!;

		assert.strictEqual(links.length, expected.length);

		for (const item of expected) {
			assertLink(links, item, document);
		}
	}

	function getTestResource(path: string) {
		return URI.file(resolve(__dirname, '../../test/linksTestFixtures', path)).toString(true);
	}

	test('url links', async function () {

		const testUri = getTestResource('about.css');
		const folders = [{ name: 'x', uri: getTestResource('') }];

		await assertLinks('html { background-image: url("hello.html|")',
			[{ offset: 29, value: '"hello.html"', target: getTestResource('hello.html') }], testUri, folders
		);
	});

	test('node module resolving', async function () {

		const testUri = getTestResource('about.css');
		const folders = [{ name: 'x', uri: getTestResource('') }];

		await assertLinks('html { background-image: url("~foo/hello.html|")',
			[{ offset: 29, value: '"~foo/hello.html"', target: getTestResource('node_modules/foo/hello.html') }], testUri, folders
		);
	});

	test('node module subfolder resolving', async function () {

		const testUri = getTestResource('subdir/about.css');
		const folders = [{ name: 'x', uri: getTestResource('') }];

		await assertLinks('html { background-image: url("~foo/hello.html|")',
			[{ offset: 29, value: '"~foo/hello.html"', target: getTestResource('node_modules/foo/hello.html') }], testUri, folders
		);
	});
});
