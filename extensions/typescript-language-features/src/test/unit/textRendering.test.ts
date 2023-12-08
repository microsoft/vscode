/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { Uri } from 'vscode';
import { IFilePathToResourceConverter, documentationToMarkdown, asPlainTextWithLinks, tagsToMarkdown } from '../../languageFeatures/util/textRendering';
import { SymbolDisplayPart } from '../../tsServer/protocol/protocol';

const noopToResource: IFilePathToResourceConverter = {
	toResource: (path) => Uri.file(path)
};

suite('typescript.previewer', () => {
	test('Should ignore hyphens after a param tag', () => {
		assert.strictEqual(
			tagsToMarkdown([
				{
					name: 'param',
					text: 'a - b'
				}
			], noopToResource),
			'*@param* `a` — b');
	});

	test('Should parse url jsdoc @link', () => {
		assert.strictEqual(
			documentationToMarkdown(
				'x {@link http://www.example.com/foo} y {@link https://api.jquery.com/bind/#bind-eventType-eventData-handler} z',
				[],
				noopToResource, undefined
			).value,
			'x [http://www.example.com/foo](http://www.example.com/foo) y [https://api.jquery.com/bind/#bind-eventType-eventData-handler](https://api.jquery.com/bind/#bind-eventType-eventData-handler) z');
	});

	test('Should parse url jsdoc @link with text', () => {
		assert.strictEqual(
			documentationToMarkdown(
				'x {@link http://www.example.com/foo abc xyz} y {@link http://www.example.com/bar|b a z} z',
				[],
				noopToResource, undefined
			).value,
			'x [abc xyz](http://www.example.com/foo) y [b a z](http://www.example.com/bar) z');
	});

	test('Should treat @linkcode jsdocs links as monospace', () => {
		assert.strictEqual(
			documentationToMarkdown(
				'x {@linkcode http://www.example.com/foo} y {@linkplain http://www.example.com/bar} z',
				[],
				noopToResource, undefined
			).value,
			'x [`http://www.example.com/foo`](http://www.example.com/foo) y [http://www.example.com/bar](http://www.example.com/bar) z');
	});

	test('Should parse url jsdoc @link in param tag', () => {
		assert.strictEqual(
			tagsToMarkdown([
				{
					name: 'param',
					text: 'a x {@link http://www.example.com/foo abc xyz} y {@link http://www.example.com/bar|b a z} z'
				}
			], noopToResource),
			'*@param* `a` — x [abc xyz](http://www.example.com/foo) y [b a z](http://www.example.com/bar) z');
	});

	test('Should ignore unclosed jsdocs @link', () => {
		assert.strictEqual(
			documentationToMarkdown(
				'x {@link http://www.example.com/foo y {@link http://www.example.com/bar bar} z',
				[],
				noopToResource, undefined
			).value,
			'x {@link http://www.example.com/foo y [bar](http://www.example.com/bar) z');
	});

	test('Should support non-ascii characters in parameter name (#90108)', () => {
		assert.strictEqual(
			tagsToMarkdown([
				{
					name: 'param',
					text: 'parámetroConDiacríticos this will not'
				}
			], noopToResource),
			'*@param* `parámetroConDiacríticos` — this will not');
	});

	test('Should render @example blocks as code', () => {
		assert.strictEqual(
			tagsToMarkdown([
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
			tagsToMarkdown([
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
			tagsToMarkdown([
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
			tagsToMarkdown([
				{
					name: 'example',
					text: '<caption>Not code</caption>\n```\ncode();\n```'
				}
			], noopToResource),
			'*@example*  \nNot code\n```\ncode();\n```'
		);
	});

	test('Should not render @link inside of @example #187768', () => {
		assert.strictEqual(
			tagsToMarkdown([
				{
					"name": "example",
					"text": [
						{
							"text": "1 + 1 ",
							"kind": "text"
						},
						{
							"text": "{@link ",
							"kind": "link"
						},
						{
							"text": "foo",
							"kind": "linkName"
						},
						{
							"text": "}",
							"kind": "link"
						}
					]
				}
			], noopToResource),
			'*@example*  \n```\n1 + 1 {@link foo}\n```');
	});

	test('Should render @linkcode symbol name as code', () => {
		assert.strictEqual(
			asPlainTextWithLinks([
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
			'a [`dog`](command:_typescript.openJsDocLink?%5B%7B%22file%22%3A%7B%22path%22%3A%22%2Fpath%2Ffile.ts%22%2C%22scheme%22%3A%22file%22%7D%2C%22position%22%3A%7B%22line%22%3A6%2C%22character%22%3A4%7D%7D%5D) b');
	});

	test('Should render @linkcode text as code', () => {
		assert.strictEqual(
			asPlainTextWithLinks([
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
			'a [`husky`](command:_typescript.openJsDocLink?%5B%7B%22file%22%3A%7B%22path%22%3A%22%2Fpath%2Ffile.ts%22%2C%22scheme%22%3A%22file%22%7D%2C%22position%22%3A%7B%22line%22%3A6%2C%22character%22%3A4%7D%7D%5D) b');
	});
});
