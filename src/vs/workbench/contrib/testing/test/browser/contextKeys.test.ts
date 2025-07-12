/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestingContextKeys } from '../../common/testingContextKeys.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Testing Context Keys', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('explorerResourceHasTests context key exists', () => {
		const contextKey = TestingContextKeys.explorerResourceHasTests;
		
		// Verify the context key is properly defined
		assert.ok(contextKey, 'explorerResourceHasTests context key should be defined');
		assert.strictEqual(contextKey.key, 'testing.explorerResourceHasTests', 'Context key should have correct name');
		assert.strictEqual(contextKey.type, 'boolean', 'Context key should be boolean type');
		assert.strictEqual(contextKey.defaultValue, false, 'Context key should default to false');
	});
});