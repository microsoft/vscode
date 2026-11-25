/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, suite, test } from 'vitest';
import { isSubword } from '../../common/inlineSuggestionEdit';

suite('isSubword', () => {
	test('isSubword', () => {
		assert.strictEqual(isSubword('acf', 'abcdef'), true);
		assert.strictEqual(isSubword('ab', 'abc'), true);
		assert.strictEqual(isSubword('cccc', 'ccc'), false);
		assert.strictEqual(isSubword('abc', 'ab'), false);
	});
});

