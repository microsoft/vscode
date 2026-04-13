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
import { resolveNodeModuleLinks } from '../utils/nodeModuleLinks';

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

	test('url links - untitled', async function () {

		const testUri = 'untitled:untitled-1';
		const folders = [{ name: 'x', uri: getTestResource('') }];

		await assertLinks('@import url("base.css|");")',
			[{ offset: 12, value: '"base.css"', target: 'untitled:base.css' }], testUri, folders
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

	test('bare module import fallback to node_modules', async function () {

		const testUri = getTestResource('about.css');
		const folders: WorkspaceFolder[] = [{ name: 'x', uri: getTestResource('') }];
		const requestService = getNodeFSRequestService();

		const value = '@import "foo/hello.html|";';
		const cleanValue = value.replace('|', '');

		const document = TextDocument.create(testUri, 'css', 0, cleanValue);
		const context = getDocumentContext(testUri, folders);
		const stylesheet = cssLanguageService.parseStylesheet(document);
		const links = await cssLanguageService.findDocumentLinks2(document, stylesheet, context);
		const resolved = await resolveNodeModuleLinks(links, document, folders, requestService);

		assert.strictEqual(resolved.length, 1);
		assert.strictEqual(resolved[0].target, getTestResource('node_modules/foo/hello.html'));
	});

	test('bare module import keeps local file when it exists', async function () {

		const testUri = getTestResource('about.css');
		const folders: WorkspaceFolder[] = [{ name: 'x', uri: getTestResource('') }];
		const requestService = getNodeFSRequestService();

		// node_modules/foo/package.json exists as a local file relative to the fixture dir
		const value = '@import "node_modules/foo/package.json|";';
		const cleanValue = value.replace('|', '');

		const document = TextDocument.create(testUri, 'css', 0, cleanValue);
		const context = getDocumentContext(testUri, folders);
		const stylesheet = cssLanguageService.parseStylesheet(document);
		const links = await cssLanguageService.findDocumentLinks2(document, stylesheet, context);
		const resolved = await resolveNodeModuleLinks(links, document, folders, requestService);

		assert.strictEqual(resolved.length, 1);
		// Should keep the original local resolution (not double node_modules)
		assert.strictEqual(resolved[0].target, getTestResource('node_modules/foo/package.json'));
	});

	test('relative import is not affected by node_modules fallback', async function () {

		const testUri = getTestResource('about.css');
		const folders: WorkspaceFolder[] = [{ name: 'x', uri: getTestResource('') }];
		const requestService = getNodeFSRequestService();

		const value = '@import "./nonexistent.css|";';
		const cleanValue = value.replace('|', '');

		const document = TextDocument.create(testUri, 'css', 0, cleanValue);
		const context = getDocumentContext(testUri, folders);
		const stylesheet = cssLanguageService.parseStylesheet(document);
		const links = await cssLanguageService.findDocumentLinks2(document, stylesheet, context);
		const resolved = await resolveNodeModuleLinks(links, document, folders, requestService);

		assert.strictEqual(resolved.length, 1);
		// Should stay as relative resolution, NOT try node_modules
		assert.strictEqual(resolved[0].target, getTestResource('nonexistent.css'));
	});
});
