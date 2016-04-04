/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import strings = require('vs/base/common/strings');

suite('Strings', () => {
	test('equalsIgnoreCase', function() {

		assert(strings.equalsIgnoreCase('', ''));
		assert(!strings.equalsIgnoreCase('', '1'));
		assert(!strings.equalsIgnoreCase('1', ''));

		assert(strings.equalsIgnoreCase('a', 'a'));
		assert(strings.equalsIgnoreCase('abc', 'Abc'));
		assert(strings.equalsIgnoreCase('abc', 'ABC'));
		assert(strings.equalsIgnoreCase('Höhenmeter', 'HÖhenmeter'));
		assert(strings.equalsIgnoreCase('ÖL', 'Öl'));
	});

	test('format', function () {
		assert.strictEqual(strings.format('Foo Bar'), 'Foo Bar');
		assert.strictEqual(strings.format('Foo {0} Bar'), 'Foo {0} Bar');
		assert.strictEqual(strings.format('Foo {0} Bar', 'yes'), 'Foo yes Bar');
		assert.strictEqual(strings.format('Foo {0} Bar {0}', 'yes'), 'Foo yes Bar yes');
		assert.strictEqual(strings.format('Foo {0} Bar {1}{2}', 'yes'), 'Foo yes Bar {1}{2}');
		assert.strictEqual(strings.format('Foo {0} Bar {1}{2}', 'yes', undefined), 'Foo yes Bar undefined{2}');
		assert.strictEqual(strings.format('Foo {0} Bar {1}{2}', 'yes', 5, false), 'Foo yes Bar 5false');
		assert.strictEqual(strings.format('Foo {0} Bar. {1}', '(foo)', '.test'), 'Foo (foo) Bar. .test');
	});

	test('computeLineStarts', function () {
		function assertLineStart(text: string, ...offsets: number[]):void {
			var actual = strings.computeLineStarts(text);
			assert.equal(actual.length, offsets.length);
			if(actual.length !== offsets.length) {
				return;
			}
			while(offsets.length > 0) {
				assert.equal(actual.pop(), offsets.pop());
			}
		}

		assertLineStart('', 0);
		assertLineStart('farboo', 0);
		assertLineStart('far\nboo', 0, 4);
		assertLineStart('far\rboo', 0, 4);
		assertLineStart('far\r\nboo', 0, 5);
		assertLineStart('far\n\rboo', 0, 4, 5);
		assertLineStart('far\n \rboo', 0, 4, 6);
		assertLineStart('far\nboo\nfar', 0, 4, 8);
	});


	test('pad', function () {
		assert.strictEqual(strings.pad(1, 0), '1');
		assert.strictEqual(strings.pad(1, 1), '1');
		assert.strictEqual(strings.pad(1, 2), '01');
		assert.strictEqual(strings.pad(0, 2), '00');
	});

	test('escape', function () {
		assert.strictEqual(strings.escape(''), '');
		assert.strictEqual(strings.escape('foo'), 'foo');
		assert.strictEqual(strings.escape('foo bar'), 'foo bar');
		assert.strictEqual(strings.escape('<foo bar>'), '&lt;foo bar&gt;');
		assert.strictEqual(strings.escape('<foo>Hello</foo>'), '&lt;foo&gt;Hello&lt;/foo&gt;');
	});

	test('startsWith', function () {
		assert(strings.startsWith('foo', 'f'));
		assert(strings.startsWith('foo', 'fo'));
		assert(strings.startsWith('foo', 'foo'));
		assert(!strings.startsWith('foo', 'o'));
		assert(!strings.startsWith('', 'f'));
		assert(strings.startsWith('foo', ''));
		assert(strings.startsWith('', ''));
	});

	test('endsWith', function () {
		assert(strings.endsWith('foo', 'o'));
		assert(strings.endsWith('foo', 'oo'));
		assert(strings.endsWith('foo', 'foo'));
		assert(strings.endsWith('foo bar foo', 'foo'));
		assert(!strings.endsWith('foo', 'f'));
		assert(!strings.endsWith('', 'f'));
		assert(strings.endsWith('foo', ''));
		assert(strings.endsWith('', ''));
		assert(strings.endsWith('/', '/'));
	});

	test('ltrim', function () {
		assert.strictEqual(strings.ltrim('foo', 'f'), 'oo');
		assert.strictEqual(strings.ltrim('foo', 'o'), 'foo');
		assert.strictEqual(strings.ltrim('http://www.test.de', 'http://'), 'www.test.de');
		assert.strictEqual(strings.ltrim('/foo/', '/'), 'foo/');
		assert.strictEqual(strings.ltrim('//foo/', '/'), 'foo/');
		assert.strictEqual(strings.ltrim('/', ''), '/');
		assert.strictEqual(strings.ltrim('/', '/'), '');
		assert.strictEqual(strings.ltrim('///', '/'), '');
		assert.strictEqual(strings.ltrim('', ''), '');
		assert.strictEqual(strings.ltrim('', '/'), '');
	});

	test('rtrim', function () {
		assert.strictEqual(strings.rtrim('foo', 'o'), 'f');
		assert.strictEqual(strings.rtrim('foo', 'f'), 'foo');
		assert.strictEqual(strings.rtrim('http://www.test.de', '.de'), 'http://www.test');
		assert.strictEqual(strings.rtrim('/foo/', '/'), '/foo');
		assert.strictEqual(strings.rtrim('/foo//', '/'), '/foo');
		assert.strictEqual(strings.rtrim('/', ''), '/');
		assert.strictEqual(strings.rtrim('/', '/'), '');
		assert.strictEqual(strings.rtrim('///', '/'), '');
		assert.strictEqual(strings.rtrim('', ''), '');
		assert.strictEqual(strings.rtrim('', '/'), '');
	});

	test('trim', function () {
		assert.strictEqual(strings.trim(' foo '), 'foo');
		assert.strictEqual(strings.trim('  foo'), 'foo');
		assert.strictEqual(strings.trim('bar  '), 'bar');
		assert.strictEqual(strings.trim('   '), '');
		assert.strictEqual(strings.trim('foo bar', 'bar'), 'foo ');
	});

	test('trimWhitespace', function () {
		assert.strictEqual(' foo '.trim(), 'foo');
		assert.strictEqual('	 foo	'.trim(), 'foo');
		assert.strictEqual('  foo'.trim(), 'foo');
		assert.strictEqual('bar  '.trim(), 'bar');
		assert.strictEqual('   '.trim(), '');
		assert.strictEqual(' 	  '.trim(), '');
	});

	test('localeCompare', function() {
		assert.strictEqual(strings.localeCompare('a', 'a'), 'a'.localeCompare('a'));
		assert.strictEqual(strings.localeCompare('A', 'A'), 'A'.localeCompare('A'));
		assert.strictEqual(strings.localeCompare('All', 'A'), 'All'.localeCompare('A'));
		assert.strictEqual(strings.localeCompare('A', 'All'), 'A'.localeCompare('All'));
		assert.strictEqual(strings.localeCompare('A', 'a'), 'A'.localeCompare('a'));
		assert.strictEqual(strings.localeCompare('a', 'A'), 'a'.localeCompare('A'));
	});

	test('appendWithLimit', function() {
		assert.strictEqual(strings.appendWithLimit('ab', 'cd', 100), 'abcd');
		assert.strictEqual(strings.appendWithLimit('ab', 'cd', 2), '...cd');
		assert.strictEqual(strings.appendWithLimit('ab', 'cdefgh',4), '...efgh');
		assert.strictEqual(strings.appendWithLimit('abcdef', 'ghijk', 7), '...efghijk');
	});
});