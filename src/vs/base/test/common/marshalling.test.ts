/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { parse, stringify } from 'vs/base/common/marshalling';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Marshalling', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('RegExp', () => {
		const value = /foo/img;
		const raw = stringify(value);
		const clone = <RegExp>parse(raw);

		assert.strictEqual(value.source, clone.source);
		assert.strictEqual(value.global, clone.global);
		assert.strictEqual(value.ignoreCase, clone.ignoreCase);
		assert.strictEqual(value.multiline, clone.multiline);
	});

	test('URI', () => {
		const value = URI.from({ scheme: 'file', authority: 'server', path: '/shares/c#files', query: 'q', fragment: 'f' });
		const raw = stringify(value);
		const clone = <URI>parse(raw);

		assert.strictEqual(value.scheme, clone.scheme);
		assert.strictEqual(value.authority, clone.authority);
		assert.strictEqual(value.path, clone.path);
		assert.strictEqual(value.query, clone.query);
		assert.strictEqual(value.fragment, clone.fragment);
	});

	test('Bug 16793:# in folder name => mirror models get out of sync', () => {
		const uri1 = URI.file('C:\\C#\\file.txt');
		assert.strictEqual(parse(stringify(uri1)).toString(), uri1.toString());
	});
});
