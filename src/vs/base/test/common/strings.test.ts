/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import strings = require('vs/base/common/strings');

suite('Strings', () => {
	test('equalsIgnoreCase', function () {

		assert(strings.equalsIgnoreCase('', ''));
		assert(!strings.equalsIgnoreCase('', '1'));
		assert(!strings.equalsIgnoreCase('1', ''));

		assert(strings.equalsIgnoreCase('a', 'a'));
		assert(strings.equalsIgnoreCase('abc', 'Abc'));
		assert(strings.equalsIgnoreCase('abc', 'ABC'));
		assert(strings.equalsIgnoreCase('Höhenmeter', 'HÖhenmeter'));
		assert(strings.equalsIgnoreCase('ÖL', 'Öl'));
	});

	test('compareIgnoreCase', function () {

		function assertCompareIgnoreCase(a: string, b: string): void {
			let actual = strings.compareIgnoreCase(a, b);
			let expected = strings.compare(a.toLowerCase(), b.toLowerCase());
			assert.equal(actual, expected, `${a} <> ${b}`);
		}

		assertCompareIgnoreCase('', '');
		assertCompareIgnoreCase('abc', 'ABC');
		assertCompareIgnoreCase('abc', 'ABc');
		assertCompareIgnoreCase('abc', 'ABcd');
		assertCompareIgnoreCase('abc', 'abcd');
		assertCompareIgnoreCase('foo', 'föo');
		assertCompareIgnoreCase('Code', 'code');
		assertCompareIgnoreCase('Code', 'cöde');

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
		function assertLineStart(text: string, ...offsets: number[]): void {
			const actual = strings.computeLineStarts(text);
			assert.equal(actual.length, offsets.length);
			if (actual.length !== offsets.length) {
				return;
			}
			while (offsets.length > 0) {
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

	test('appendWithLimit', function () {
		assert.strictEqual(strings.appendWithLimit('ab', 'cd', 100), 'abcd');
		assert.strictEqual(strings.appendWithLimit('ab', 'cd', 2), '...cd');
		assert.strictEqual(strings.appendWithLimit('ab', 'cdefgh', 4), '...efgh');
		assert.strictEqual(strings.appendWithLimit('abcdef', 'ghijk', 7), '...efghijk');
	});

	test('repeat', () => {
		assert.strictEqual(strings.repeat(' ', 4), '    ');
		assert.strictEqual(strings.repeat(' ', 1), ' ');
		assert.strictEqual(strings.repeat(' ', 0), '');
		assert.strictEqual(strings.repeat('abc', 2), 'abcabc');
	});

	test('lastNonWhitespaceIndex', () => {
		assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t '), 2);
		assert.strictEqual(strings.lastNonWhitespaceIndex('abc'), 2);
		assert.strictEqual(strings.lastNonWhitespaceIndex('abc\t'), 2);
		assert.strictEqual(strings.lastNonWhitespaceIndex('abc '), 2);
		assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t '), 2);
		assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t abc \t \t '), 11);
		assert.strictEqual(strings.lastNonWhitespaceIndex('abc  \t \t abc \t \t ', 8), 2);
		assert.strictEqual(strings.lastNonWhitespaceIndex('  \t \t '), -1);
	});

	test('containsRTL', () => {
		assert.equal(strings.containsRTL('a'), false);
		assert.equal(strings.containsRTL(''), false);
		assert.equal(strings.containsRTL(strings.UTF8_BOM_CHARACTER + 'a'), false);
		assert.equal(strings.containsRTL('hello world!'), false);
		assert.equal(strings.containsRTL('a📚📚b'), false);
		assert.equal(strings.containsRTL('هناك حقيقة مثبتة منذ زمن طويل'), true);
		assert.equal(strings.containsRTL('זוהי עובדה מבוססת שדעתו'), true);
	});

	// test('containsRTL speed', () => {
	// 	var SIZE = 1000000;
	// 	var REPEAT = 10;
	// 	function generateASCIIStr(len:number): string {
	// 		let r = '';
	// 		for (var i = 0; i < len; i++) {
	// 			var res = Math.floor(Math.random() * 256);
	// 			r += String.fromCharCode(res);
	// 		}
	// 		return r;
	// 	}
	// 	function testContainsRTLSpeed(): number {
	// 		var str = generateASCIIStr(SIZE);
	// 		var start = Date.now();
	// 		assert.equal(strings.containsRTL(str), false);
	// 		return (Date.now() - start);
	// 	}
	// 	var allTime = 0;
	// 	for (var i = 0; i < REPEAT; i++) {
	// 		allTime += testContainsRTLSpeed();
	// 	}
	// 	console.log('TOOK: ' + (allTime)/10 + 'ms for size of ' + SIZE/1000000 + 'Mb');
	// });

	test('isBasicASCII', () => {
		function assertIsBasicASCII(str: string, expected: boolean): void {
			assert.equal(strings.isBasicASCII(str), expected, str + ` (${str.charCodeAt(0)})`);
		}
		assertIsBasicASCII('abcdefghijklmnopqrstuvwxyz', true);
		assertIsBasicASCII('ABCDEFGHIJKLMNOPQRSTUVWXYZ', true);
		assertIsBasicASCII('1234567890', true);
		assertIsBasicASCII('`~!@#$%^&*()-_=+[{]}\\|;:\'",<.>/?', true);
		assertIsBasicASCII(' ', true);
		assertIsBasicASCII('\t', true);
		assertIsBasicASCII('\n', true);
		assertIsBasicASCII('\r', true);

		let ALL = '\r\t\n';
		for (let i = 32; i < 127; i++) {
			ALL += String.fromCharCode(i);
		}
		assertIsBasicASCII(ALL, true);

		assertIsBasicASCII(String.fromCharCode(31), false);
		assertIsBasicASCII(String.fromCharCode(127), false);
		assertIsBasicASCII('ü', false);
		assertIsBasicASCII('a📚📚b', false);
	});
});
