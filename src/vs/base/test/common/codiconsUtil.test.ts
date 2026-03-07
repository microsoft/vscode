/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { register, getCodiconFontCharacters } from '../../common/codiconsUtil.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('codiconsUtil', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('register', () => {
		const icon1 = register('test-icon-1', 0x1234);
		assert.strictEqual(icon1.id, 'test-icon-1');

		const characters = getCodiconFontCharacters();
		assert.strictEqual(characters['test-icon-1'], 0x1234);

		const icon2 = register('test-icon-2', 'test-icon-1');
		assert.strictEqual(icon2.id, 'test-icon-2');
		assert.strictEqual(characters['test-icon-2'], 0x1234);

		assert.throws(() => register('test-icon-3', 'unknown-icon'), /test-icon-3 references an unknown codicon: unknown-icon/);
	});
});
