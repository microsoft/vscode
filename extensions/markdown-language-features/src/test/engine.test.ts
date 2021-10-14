/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { createNewMarkdownEngine } from './engine';
import { InMemoryDocument } from './inMemoryDocument';


const testFileName = vscode.Uri.file('test.md');

suite('markdown.engine', () => {
	suite('rendering', () => {
		const input = '# hello\n\nworld!';
		const output = '<h1 data-line="0" class="code-line" id="hello">hello</h1>\n'
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

	suite('image-caching', () => {
		const input = '![](img.png) [](no-img.png) ![](http://example.org/img.png) ![](img.png) ![](./img2.png)';

		test('Extracts all images', async () => {
			const engine = createNewMarkdownEngine();
			assert.deepStrictEqual((await engine.render(input)), {
				html: '<p data-line="0" class="code-line">'
					+ '<img src="img.png" alt="" class="loading" id="image-hash--754511435" data-src="img.png"> '
					+ '<a href="no-img.png" data-href="no-img.png"></a> '
					+ '<img src="http://example.org/img.png" alt="" class="loading" id="image-hash--1903814170" data-src="http://example.org/img.png"> '
					+ '<img src="img.png" alt="" class="loading" id="image-hash--754511435" data-src="img.png"> '
					+ '<img src="./img2.png" alt="" class="loading" id="image-hash-265238964" data-src="./img2.png">'
					+ '</p>\n'
				,
				containingImages: [{ src: 'img.png' }, { src: 'http://example.org/img.png' }, { src: 'img.png' }, { src: './img2.png' }],
			});
		});
	});
});
