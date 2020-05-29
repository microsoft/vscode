/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { hash, StringSHA1 } from 'vs/base/common/hash';

suite('Hash', () => {
	test('string', () => {
		assert.equal(hash('hello'), hash('hello'));
		assert.notEqual(hash('hello'), hash('world'));
		assert.notEqual(hash('hello'), hash('olleh'));
		assert.notEqual(hash('hello'), hash('Hello'));
		assert.notEqual(hash('hello'), hash('Hello '));
		assert.notEqual(hash('h'), hash('H'));
		assert.notEqual(hash('-'), hash('_'));
	});

	test('number', () => {
		assert.equal(hash(1), hash(1));
		assert.notEqual(hash(0), hash(1));
		assert.notEqual(hash(1), hash(-1));
		assert.notEqual(hash(0x12345678), hash(0x123456789));
	});

	test('boolean', () => {
		assert.equal(hash(true), hash(true));
		assert.notEqual(hash(true), hash(false));
	});

	test('array', () => {
		assert.equal(hash([1, 2, 3]), hash([1, 2, 3]));
		assert.equal(hash(['foo', 'bar']), hash(['foo', 'bar']));
		assert.equal(hash([]), hash([]));
		assert.notEqual(hash(['foo', 'bar']), hash(['bar', 'foo']));
		assert.notEqual(hash(['foo', 'bar']), hash(['bar', 'foo', null]));
	});

	test('object', () => {
		assert.equal(hash({}), hash({}));
		assert.equal(hash({ 'foo': 'bar' }), hash({ 'foo': 'bar' }));
		assert.equal(hash({ 'foo': 'bar', 'foo2': undefined }), hash({ 'foo2': undefined, 'foo': 'bar' }));
		assert.notEqual(hash({ 'foo': 'bar' }), hash({ 'foo': 'bar2' }));
		assert.notEqual(hash({}), hash([]));
	});

	test('array - unexpected collision', function () {
		this.skip();
		const a = hash([undefined, undefined, undefined, undefined, undefined]);
		const b = hash([undefined, undefined, 'HHHHHH', [{ line: 0, character: 0 }, { line: 0, character: 0 }], undefined]);
		// console.log(a);
		// console.log(b);
		assert.notEqual(a, b);
	});

	function checkSHA1(strings: string[], expected: string) {
		const hash = new StringSHA1();
		for (const str of strings) {
			hash.update(str);
		}
		const actual = hash.digest();
		assert.equal(actual, expected);
	}

	test('sha1-1', () => {
		checkSHA1(['\udd56'], '9bdb77276c1852e1fb067820472812fcf6084024');
	});

	test('sha1-2', () => {
		checkSHA1(['\udb52'], '9bdb77276c1852e1fb067820472812fcf6084024');
	});

	test('sha1-3', () => {
		checkSHA1(['\uda02ꑍ'], '9b483a471f22fe7e09d83f221871a987244bbd3f');
	});

	test('sha1-4', () => {
		checkSHA1(['hello'], 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
	});
});
