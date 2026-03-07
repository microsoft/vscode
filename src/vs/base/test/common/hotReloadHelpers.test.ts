/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { readHotReloadableExport, createHotClass } from '../../common/hotReloadHelpers.js';

suite('hotReloadHelpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('readHotReloadableExport returns the value', () => {
		const val = { foo: 'bar' };
		const result = readHotReloadableExport(val, undefined);
		assert.strictEqual(result, val);
	});

	test('createHotClass returns an observable of the class', () => {
		class TestClass {}
		const obs = createHotClass(TestClass);
		assert.strictEqual(obs.get(), TestClass);
	});
});
