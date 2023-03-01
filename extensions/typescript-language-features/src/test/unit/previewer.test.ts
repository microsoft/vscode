/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { SymbolDisplayPart } from '../../protocol';
import { Uri } from 'vscode';
import { IFilePathToResourceConverter, markdownDocumentation, plainWithLinks, tagsMarkdownPreview } from '../../utils/previewer';

const noopToResource: IFilePathToResourceConverter = {
	toResource: (path) => Uri.file(path)
};

suite('typescript.previewer', () => {
	test('Should ignore hyphens after a param tag', async () => {
		assert.strictEqual(
			tagsMarkdownPreview([
				{
					name: 'param',
					text: 'a - b'
				}
			], noopToResource),
			'*@param* `a` — b');
	});

	test('Should parse url jsdoc @link', async () => {
		assert.strictEqual(
			markdownDocumentation(
				'x {@link http://www.example.com/foo} y {@link https://api.jquery.com/bind/#bind-eventType-eventData-handler} z',
				[],
				noopToResource, undefined
			).value,
			'x [http://www.example.com/foo](http://www.example.com/foo) y [https://api.jquery.com/bind/#bind-eventType-eventData-handler](https://api.jquery.com/bind/#bind-eventType-eventData-handler) z');
	});

	test('Should parse url jsdoc @link with text', async () => {
		assert.strictEqual(
			markdownDocumentation(
				'x {@link http://www.example.com/foo abc xyz} y {@link http://www.example.com/bar|b a z} z',
				[],
				noopToResource, undefined
			).value,
			'x [abc xyz](http://www.example.com/foo) y [b a z](http://www.example.com/bar) z');
	});

	test('Should treat @linkcode jsdocs links as monospace', async () => {
		assert.strictEqual(
			markdownDocumentation(
				'x {@linkcode http://www.example.com/foo} y {@linkplain http://www.example.com/bar} z',
				[],
				noopToResource, undefined
			).value,
			'x [`http://www.example.com/foo`](http://www.example.com/foo) y [http://www.example.com/bar](http://www.example.com/bar) z');
	});

	test('Should parse url jsdoc @link in param tag', async () => {
		assert.strictEqual(
			tagsMarkdownPreview([
				{
					name: 'param',
					text: 'a x {@link http://www.example.com/foo abc xyz} y {@link http://www.example.com/bar|b a z} z'
				}
			], noopToResource),
			'*@param* `a` — x [abc xyz](http://www.example.com/foo) y [b a z](http://www.example.com/bar) z');
	});

	test('Should ignore unclosed jsdocs @link', async () => {
		assert.strictEqual(
			markdownDocumentation(
				'x {@link http://www.example.com/foo y {@link http://www.example.com/bar bar} z',
				[],
				noopToResource, undefined
			).value,
			'x {@link http://www.example.com/foo y [bar](http://www.example.com/bar) z');
	});

	test('Should support non-ascii characters in parameter name (#90108)', async () => {
		assert.strictEqual(
			tagsMarkdownPreview([
				{
					name: 'param',
					text: 'parámetroConDiacríticos this will not'
				}
			], noopToResource),
			'*@param* `parámetroConDiacríticos` — this will not');
	});

	test('Should render @example blocks as code', () => {
		assert.strictEqual(
			tagsMarkdownPreview([
				{
					name: 'example',
					text: 'code();'
				}
			], noopToResource),
			'*@example*  \n```\ncode();\n```'
		);
	});

	test('Should not render @example blocks as code as if they contain a codeblock', () => {
		assert.strictEqual(
			tagsMarkdownPreview([
				{
					name: 'example',
					text: 'Not code\n```\ncode();\n```'
				}
			], noopToResource),
			'*@example*  \nNot code\n```\ncode();\n```'
		);
	});

	test('Should render @example blocks as code if they contain a <caption>', () => {
		assert.strictEqual(
			tagsMarkdownPreview([
				{
					name: 'example',
					text: '<caption>Not code</caption>\ncode();'
				}
			], noopToResource),
			'*@example*  \nNot code\n```\ncode();\n```'
		);
	});

	test('Should not render @example blocks as code if they contain a <caption> and a codeblock', () => {
		assert.strictEqual(
			tagsMarkdownPreview([
				{
					name: 'example',
					text: '<caption>Not code</caption>\n```\ncode();\n```'
				}
			], noopToResource),
			'*@example*  \nNot code\n```\ncode();\n```'
		);
	});

	test('Should render @linkcode symbol name as code', async () => {
		assert.strictEqual(
			plainWithLinks([
				{ "text": "a ", "kind": "text" },
				{ "text": "{@linkcode ", "kind": "link" },
				{
					"text": "dog",
					"kind": "linkName",
					"target": {
						"file": "/path/file.ts",
						"start": { "line": 7, "offset": 5 },
						"end": { "line": 7, "offset": 13 }
					}
				} as SymbolDisplayPart,
				{ "text": "}", "kind": "link" },
				{ "text": " b", "kind": "text" }
			], noopToResource),
			'a [`dog`](file:///path/file.ts#L7%2C5) b');
	});

	test('Should render @linkcode text as code', async () => {
		assert.strictEqual(
			plainWithLinks([
				{ "text": "a ", "kind": "text" },
				{ "text": "{@linkcode ", "kind": "link" },
				{
					"text": "dog",
					"kind": "linkName",
					"target": {
						"file": "/path/file.ts",
						"start": { "line": 7, "offset": 5 },
						"end": { "line": 7, "offset": 13 }
					}
				} as SymbolDisplayPart,
				{ "text": "husky", "kind": "linkText" },
				{ "text": "}", "kind": "link" },
				{ "text": " b", "kind": "text" }
			], noopToResource),
			'a [`husky`](file:///path/file.ts#L7%2C5) b');
	});
});
