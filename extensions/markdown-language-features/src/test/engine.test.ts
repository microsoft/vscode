/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import 'mocha';

import { InMemoryDocument } from './inMemoryDocument';
import { createNewMarkdownEngine } from './engine';

const testFileName = vscode.Uri.file('test.md');

suite('markdown.engine', () => {
	suite('rendering', () => {
		const input = '# hello\n\nworld!';
		const output = '<h1 id="hello" data-line="0" class="code-line">hello</h1>\n'
			+ '<p data-line="2" class="code-line">world!</p>\n';

		test('Renders a document', async () => {
			const doc = new InMemoryDocument(testFileName, input);
			const engine = createNewMarkdownEngine();
			assert.strictEqual((await engine.render(doc)).html, output);
		});

		test('Renders a string', async () => {
			const engine = createNewMarkdownEngine();
			assert.strictEqual((await engine.render(input)).html, output);
		});
	});

	// TODO: How can I run these tests? These tests are not finished yet.
	suite('image-caching', () => {
		const input = '![](img.png) [](no-img.png) ![](http://example.org/img.png) ![](img.png) ![](./img2.png)';

		test('Extracts all images', async () => {
			const engine = createNewMarkdownEngine();
			assert.deepStrictEqual((await engine.render(input)).html, {
				html: '',
				containingImages: [{ src: 'img.png' }, { src: 'http://example.org/img.png' }, { src: 'img.png' }, {}],
			});
		});

		test('Cache-Keys are considered', async () => {
			const engine = createNewMarkdownEngine();
			const imageCacheKeyBySrc = new Map<string, string>();
			imageCacheKeyBySrc.set('img.png', '1');
			imageCacheKeyBySrc.set('./img2.png', '2');

			assert.deepStrictEqual((await engine.render(input, { imageCacheKeyBySrc })).html, {
				html: '',
				containingImages: [{ src: 'img.png' }, { src: 'http://example.org/img.png' }, { src: 'img.png' }, {}],
			});
		});
	});
});
