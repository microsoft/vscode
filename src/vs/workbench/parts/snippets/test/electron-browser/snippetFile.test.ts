/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SnippetFile, Snippet, SnippetSource } from 'vs/workbench/parts/snippets/electron-browser/snippetsFile';
import { URI } from 'vs/base/common/uri';

suite('Snippets', function () {

	class TestSnippetFile extends SnippetFile {
		constructor(filepath: URI, snippets: Snippet[]) {
			super(SnippetSource.Extension, filepath, undefined, undefined, undefined!);
			this.data.push(...snippets);
		}
	}

	test('SnippetFile#select', () => {
		let file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), []);
		let bucket: Snippet[] = [];
		file.select('', bucket);
		assert.equal(bucket.length, 0);

		file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), [
			new Snippet(['foo'], 'FooSnippet1', 'foo', '', 'snippet', 'test', SnippetSource.User),
			new Snippet(['foo'], 'FooSnippet2', 'foo', '', 'snippet', 'test', SnippetSource.User),
			new Snippet(['bar'], 'BarSnippet1', 'foo', '', 'snippet', 'test', SnippetSource.User),
			new Snippet(['bar.comment'], 'BarSnippet2', 'foo', '', 'snippet', 'test', SnippetSource.User),
			new Snippet(['bar.strings'], 'BarSnippet2', 'foo', '', 'snippet', 'test', SnippetSource.User),
			new Snippet(['bazz', 'bazz'], 'BazzSnippet1', 'foo', '', 'snippet', 'test', SnippetSource.User),
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

		let file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), [
			new Snippet([], 'AnySnippet1', 'foo', '', 'snippet', 'test', SnippetSource.User),
			new Snippet(['foo'], 'FooSnippet1', 'foo', '', 'snippet', 'test', SnippetSource.User),
		]);

		let bucket: Snippet[] = [];
		file.select('foo', bucket);
		assert.equal(bucket.length, 2);

	});

});
