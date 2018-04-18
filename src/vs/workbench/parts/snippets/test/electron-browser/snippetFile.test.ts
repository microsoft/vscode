/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { SnippetFile, Snippet } from 'vs/workbench/parts/snippets/electron-browser/snippetsFile';

suite('Snippets', function () {

	class TestSnippetFile extends SnippetFile {
		constructor(filepath: string, snippets: Snippet[]) {
			super(filepath, undefined, undefined);
			this.data.push(...snippets);
		}
	}

	test('SnippetFile#select', function () {
		let file = new TestSnippetFile('somepath/foo.code-snippets', []);
		let bucket: Snippet[] = [];
		file.select('', bucket);
		assert.equal(bucket.length, 0);

		file = new TestSnippetFile('somepath/foo.code-snippets', [
			new Snippet(['foo'], 'FooSnippet1', 'foo', '', 'snippet', 'test'),
			new Snippet(['foo'], 'FooSnippet2', 'foo', '', 'snippet', 'test'),
			new Snippet(['bar'], 'BarSnippet1', 'foo', '', 'snippet', 'test'),
			new Snippet(['bar.comment'], 'BarSnippet2', 'foo', '', 'snippet', 'test'),
			new Snippet(['bar.strings'], 'BarSnippet2', 'foo', '', 'snippet', 'test'),
			new Snippet(['bazz', 'bazz'], 'BazzSnippet1', 'foo', '', 'snippet', 'test'),
		]);

		bucket = [];
		file.select('foo', bucket);
		assert.equal(bucket.length, 2);

		bucket = [];
		file.select('fo', bucket);
		assert.equal(bucket.length, 0);

		bucket = [];
		file.select('bar', bucket);
		assert.equal(bucket.length, 1);

		bucket = [];
		file.select('bar.comment', bucket);
		assert.equal(bucket.length, 2);

		bucket = [];
		file.select('bazz', bucket);
		assert.equal(bucket.length, 1);
	});

	test('SnippetFile#select - any scope', function () {

		let file = new TestSnippetFile('somepath/foo.code-snippets', [
			new Snippet([], 'AnySnippet1', 'foo', '', 'snippet', 'test'),
			new Snippet(['foo'], 'FooSnippet1', 'foo', '', 'snippet', 'test'),
		]);

		let bucket: Snippet[] = [];
		file.select('foo', bucket);
		assert.equal(bucket.length, 2);

	});

});
