/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { hash } from 'vs/base/common/hash';

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
});