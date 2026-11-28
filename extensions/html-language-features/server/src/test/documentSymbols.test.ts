/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { getLanguageModes, ClientCapabilities, TextDocument } from '../modes/languageModes.js';
import { findDocumentSymbols } from '../modes/htmlSymbols.js';
import { getNodeFileFS } from '../node/nodeFs.js';

suite('HTML Document Symbols', () => {

	function createLanguageModes() {
		const workspace = {
			settings: {},
			folders: [{ name: 'foo', uri: 'test://foo' }]
		};
		return getLanguageModes({ css: true, javascript: true }, workspace, ClientCapabilities.LATEST, getNodeFileFS());
	}

	test('HTML only - under limit', async () => {
		const content = '<html><head><title>Test</title></head><body><div id="main" class="container"><p>Hello</p></div></body></html>';
		const document = TextDocument.create('test://test.html', 'html', 1, content);
		const languageModes = createLanguageModes();

		try {
			const symbols = await findDocumentSymbols(languageModes, document, 5000);
			assert.ok(symbols.length > 0);
			assert.strictEqual(symbols.length, 6); // html, head, title, body, div#main.container, p
			assert.strictEqual(symbols[0].name, 'html');
			assert.strictEqual(symbols[4].name, 'div#main.container');
		} finally {
			languageModes.dispose();
		}
	});

	test('HTML with custom limit', async () => {
		const content = '<div><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>';
		const document = TextDocument.create('test://test.html', 'html', 1, content);
		const languageModes = createLanguageModes();

		try {
			const allSymbols = await findDocumentSymbols(languageModes, document, 5000);
			assert.strictEqual(allSymbols.length, 6); // div + 5 spans

			const limitedSymbols = await findDocumentSymbols(languageModes, document, 3);
			assert.strictEqual(limitedSymbols.length, 3);
			assert.deepStrictEqual(limitedSymbols, allSymbols.slice(0, 3));
		} finally {
			languageModes.dispose();
		}
	});

	test('HTML with limit 0 or negative', async () => {
		const content = '<div><p>Hello</p></div>';
		const document = TextDocument.create('test://test.html', 'html', 1, content);
		const languageModes = createLanguageModes();

		try {
			const zeroSymbols = await findDocumentSymbols(languageModes, document, 0);
			assert.strictEqual(zeroSymbols.length, 0);

			const negSymbols = await findDocumentSymbols(languageModes, document, -1);
			assert.strictEqual(negSymbols.length, 0);
		} finally {
			languageModes.dispose();
		}
	});

	test('HTML large document capped at limit', async () => {
		const rows: string[] = [];
		for (let i = 0; i < 200; i++) {
			rows.push(`<div class="row-${i}" id="r${i}"><span>Item ${i}</span></div>`);
		}
		const content = `<!DOCTYPE html><html><body>${rows.join('\n')}</body></html>`;
		const document = TextDocument.create('test://test.html', 'html', 1, content);
		const languageModes = createLanguageModes();

		try {
			// Total elements: html, body, and 200 * 2 = 400 => 402 elements
			const allSymbols = await findDocumentSymbols(languageModes, document, 5000);
			assert.strictEqual(allSymbols.length, 402);

			const cappedSymbols = await findDocumentSymbols(languageModes, document, 50);
			assert.strictEqual(cappedSymbols.length, 50);
			assert.deepStrictEqual(cappedSymbols, allSymbols.slice(0, 50));
		} finally {
			languageModes.dispose();
		}
	});

	test('HTML with embedded CSS and JS respects limit cumulatively', async () => {
		const content = [
			'<!DOCTYPE html>',
			'<html>',
			'<head>',
			'<style>',
			'.item { color: red; }',
			'.card { background: blue; }',
			'</style>',
			'<script>',
			'function foo() {}',
			'function bar() {}',
			'</script>',
			'</head>',
			'<body>',
			'<div></div>',
			'</body>',
			'</html>'
		].join('\n');
		const document = TextDocument.create('test://test.html', 'html', 1, content);
		const languageModes = createLanguageModes();

		try {
			const allSymbols = await findDocumentSymbols(languageModes, document, 5000);
			assert.ok(allSymbols.length > 5);

			// Limit to fewer symbols than total
			const cappedSymbols = await findDocumentSymbols(languageModes, document, 4);
			assert.strictEqual(cappedSymbols.length, 4);
			assert.deepStrictEqual(cappedSymbols, allSymbols.slice(0, 4));
		} finally {
			languageModes.dispose();
		}
	});

});
