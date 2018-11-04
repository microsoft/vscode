/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { formatPII, getExactExpressionStartAndEnd } from 'vs/workbench/parts/debug/common/debugUtils';

suite('Debug - Utils', () => {
	test('formatPII', () => {
		assert.strictEqual(formatPII('Foo Bar', false, {}), 'Foo Bar');
		assert.strictEqual(formatPII('Foo {key} Bar', false, {}), 'Foo {key} Bar');
		assert.strictEqual(formatPII('Foo {key} Bar', false, { 'key': 'yes' }), 'Foo yes Bar');
		assert.strictEqual(formatPII('Foo {_0} Bar {_0}', true, { '_0': 'yes' }), 'Foo yes Bar yes');
		assert.strictEqual(formatPII('Foo {0} Bar {1}{2}', false, { '0': 'yes' }), 'Foo yes Bar {1}{2}');
		assert.strictEqual(formatPII('Foo {0} Bar {1}{2}', false, { '0': 'yes', '1': 'undefined' }), 'Foo yes Bar undefined{2}');
		assert.strictEqual(formatPII('Foo {_key0} Bar {key1}{key2}', true, { '_key0': 'yes', 'key1': '5', 'key2': 'false' }), 'Foo yes Bar {key1}{key2}');
		assert.strictEqual(formatPII('Foo {_key0} Bar {key1}{key2}', false, { '_key0': 'yes', 'key1': '5', 'key2': 'false' }), 'Foo yes Bar 5false');
	});

	test('getExactExpressionStartAndEnd', () => {
		assert.deepEqual(getExactExpressionStartAndEnd('foo', 1, 2), { start: 1, end: 3 });
		assert.deepEqual(getExactExpressionStartAndEnd('foo', 1, 3), { start: 1, end: 3 });
		assert.deepEqual(getExactExpressionStartAndEnd('foo', 1, 4), { start: 1, end: 3 });
		assert.deepEqual(getExactExpressionStartAndEnd('this.name = "John"', 1, 10), { start: 1, end: 9 });
		assert.deepEqual(getExactExpressionStartAndEnd('this.name = "John"', 6, 10), { start: 1, end: 9 });
		// Hovers over "address" should pick up this->address
		assert.deepEqual(getExactExpressionStartAndEnd('this->address = "Main street"', 6, 10), { start: 1, end: 13 });
		// Hovers over "name" should pick up a.b.c.d.name
		assert.deepEqual(getExactExpressionStartAndEnd('var t = a.b.c.d.name', 16, 20), { start: 9, end: 20 });
		assert.deepEqual(getExactExpressionStartAndEnd('MyClass::StaticProp', 10, 20), { start: 1, end: 19 });
		assert.deepEqual(getExactExpressionStartAndEnd('largeNumber = myVar?.prop', 21, 25), { start: 15, end: 25 });

		// For example in expression 'a.b.c.d', hover was under 'b', 'a.b' should be the exact range
		assert.deepEqual(getExactExpressionStartAndEnd('var t = a.b.c.d.name', 11, 12), { start: 9, end: 11 });

		assert.deepEqual(getExactExpressionStartAndEnd('var t = a.b;c.d.name', 16, 20), { start: 13, end: 20 });
		assert.deepEqual(getExactExpressionStartAndEnd('var t = a.b.c-d.name', 16, 20), { start: 15, end: 20 });
	});
});
