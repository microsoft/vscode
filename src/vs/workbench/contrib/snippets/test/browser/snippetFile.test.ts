/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SnippetFile, Snippet, SnippetSource } from '../../browser/snippetsFile.js';
import { URI } from '../../../../../base/common/uri.js';
import { SnippetParser } from '../../../../../editor/contrib/snippet/browser/snippetParser.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Snippets', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	class TestSnippetFile extends SnippetFile {
		constructor(filepath: URI, snippets: Snippet[]) {
			super(SnippetSource.Extension, filepath, undefined, undefined, undefined!, undefined!);
			this.data.push(...snippets);
		}
	}

	test('SnippetFile#select', () => {
		let file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), []);
		let bucket: Snippet[] = [];
		file.select('', bucket);
		assert.strictEqual(bucket.length, 0);

		file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), [
			new Snippet(false, ['foo'], 'FooSnippet1', 'foo', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
			new Snippet(false, ['foo'], 'FooSnippet2', 'foo', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
			new Snippet(false, ['bar'], 'BarSnippet1', 'foo', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
			new Snippet(false, ['bar.comment'], 'BarSnippet2', 'foo', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
			new Snippet(false, ['bar.strings'], 'BarSnippet2', 'foo', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
			new Snippet(false, ['bazz', 'bazz'], 'BazzSnippet1', 'foo', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
		]);

		bucket = [];
		file.select('foo', bucket);
		assert.strictEqual(bucket.length, 2);

		bucket = [];
		file.select('fo', bucket);
		assert.strictEqual(bucket.length, 0);

		bucket = [];
		file.select('bar', bucket);
		assert.strictEqual(bucket.length, 1);

		bucket = [];
		file.select('bar.comment', bucket);
		assert.strictEqual(bucket.length, 2);

		bucket = [];
		file.select('bazz', bucket);
		assert.strictEqual(bucket.length, 1);
	});

	test('SnippetFile#select - any scope', function () {

		const file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), [
			new Snippet(false, [], 'AnySnippet1', 'foo', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
			new Snippet(false, ['foo'], 'FooSnippet1', 'foo', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
		]);

		const bucket: Snippet[] = [];
		file.select('foo', bucket);
		assert.strictEqual(bucket.length, 2);

	});

	test('Snippet#needsClipboard', function () {

		function assertNeedsClipboard(body: string, expected: boolean): void {
			const snippet = new Snippet(false, ['foo'], 'FooSnippet1', 'foo', '', body, 'test', SnippetSource.User, generateUuid());
			assert.strictEqual(snippet.needsClipboard, expected);

			assert.strictEqual(SnippetParser.guessNeedsClipboard(body), expected);
		}

		assertNeedsClipboard('foo$CLIPBOARD', true);
		assertNeedsClipboard('${CLIPBOARD}', true);
		assertNeedsClipboard('foo${CLIPBOARD}bar', true);
		assertNeedsClipboard('foo$clipboard', false);
		assertNeedsClipboard('foo${clipboard}', false);
		assertNeedsClipboard('baba', false);
	});

	test('Snippet#isTrivial', function () {

		function assertIsTrivial(body: string, expected: boolean): void {
			const snippet = new Snippet(false, ['foo'], 'FooSnippet1', 'foo', '', body, 'test', SnippetSource.User, generateUuid());
			assert.strictEqual(snippet.isTrivial, expected);
		}

		assertIsTrivial('foo', true);
		assertIsTrivial('foo$0', true);
		assertIsTrivial('foo$0bar', false);
		assertIsTrivial('foo$1', false);
		assertIsTrivial('foo$1$0', false);
		assertIsTrivial('${1:foo}', false);
	});

	test('SnippetFile#select - include pattern', function () {

		const file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), [
			new Snippet(false, ['typescript'], 'TestSnippet', 'test', '', 'snippet', 'test', SnippetSource.User, generateUuid(), ['**/*.test.ts']),
			new Snippet(false, ['typescript'], 'SpecSnippet', 'spec', '', 'snippet', 'test', SnippetSource.User, generateUuid(), ['**/*.spec.ts']),
			new Snippet(false, ['typescript'], 'AllSnippet', 'all', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
		]);

		// Test file should only get TestSnippet and AllSnippet
		let bucket: Snippet[] = [];
		file.select('typescript', bucket, URI.file('/project/src/foo.test.ts'));
		assert.strictEqual(bucket.length, 2);
		assert.ok(bucket.some(s => s.name === 'TestSnippet'));
		assert.ok(bucket.some(s => s.name === 'AllSnippet'));

		// Spec file should only get SpecSnippet and AllSnippet
		bucket = [];
		file.select('typescript', bucket, URI.file('/project/src/foo.spec.ts'));
		assert.strictEqual(bucket.length, 2);
		assert.ok(bucket.some(s => s.name === 'SpecSnippet'));
		assert.ok(bucket.some(s => s.name === 'AllSnippet'));

		// Regular file should only get AllSnippet
		bucket = [];
		file.select('typescript', bucket, URI.file('/project/src/foo.ts'));
		assert.strictEqual(bucket.length, 1);
		assert.strictEqual(bucket[0].name, 'AllSnippet');

		// Without URI, all snippets should be selected (backward compatibility)
		bucket = [];
		file.select('typescript', bucket);
		assert.strictEqual(bucket.length, 3);
	});

	test('SnippetFile#select - exclude pattern', function () {

		const file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), [
			new Snippet(false, ['javascript'], 'ProdSnippet', 'prod', '', 'snippet', 'test', SnippetSource.User, generateUuid(), undefined, ['**/*.min.js', '**/dist/**']),
			new Snippet(false, ['javascript'], 'AllSnippet', 'all', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
		]);

		// Regular .js file should get both snippets
		let bucket: Snippet[] = [];
		file.select('javascript', bucket, URI.file('/project/src/foo.js'));
		assert.strictEqual(bucket.length, 2);

		// Minified file should only get AllSnippet (ProdSnippet is excluded)
		bucket = [];
		file.select('javascript', bucket, URI.file('/project/src/foo.min.js'));
		assert.strictEqual(bucket.length, 1);
		assert.strictEqual(bucket[0].name, 'AllSnippet');

		// File in dist folder should only get AllSnippet
		bucket = [];
		file.select('javascript', bucket, URI.file('/project/dist/bundle.js'));
		assert.strictEqual(bucket.length, 1);
		assert.strictEqual(bucket[0].name, 'AllSnippet');
	});

	test('SnippetFile#select - include and exclude patterns together', function () {

		const file = new TestSnippetFile(URI.file('somepath/foo.code-snippets'), [
			new Snippet(false, ['typescript'], 'TestSnippet', 'test', '', 'snippet', 'test', SnippetSource.User, generateUuid(), ['**/*.test.ts', '**/*.spec.ts'], ['**/*.perf.test.ts']),
		]);

		// Regular test file should get the snippet
		let bucket: Snippet[] = [];
		file.select('typescript', bucket, URI.file('/project/src/foo.test.ts'));
		assert.strictEqual(bucket.length, 1);

		// Spec file should get the snippet
		bucket = [];
		file.select('typescript', bucket, URI.file('/project/src/foo.spec.ts'));
		assert.strictEqual(bucket.length, 1);

		// Performance test file should NOT get the snippet (excluded)
		bucket = [];
		file.select('typescript', bucket, URI.file('/project/src/foo.perf.test.ts'));
		assert.strictEqual(bucket.length, 0);

		// Regular file should NOT get the snippet (not included)
		bucket = [];
		file.select('typescript', bucket, URI.file('/project/src/foo.ts'));
		assert.strictEqual(bucket.length, 0);
	});

});
