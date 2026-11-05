/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { BasicInplaceReplace } from '../../../../common/languages/supports/inplaceReplaceSupport.js';

suite('BasicInplaceReplace', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function navigate(text: string, up: boolean): string | undefined {
		const range = new Range(1, 1, 1, text.length + 1);
		return BasicInplaceReplace.INSTANCE.navigateValueSet(range, text, range, null, up)?.value;
	}

	test('numbers', () => {
		assert.strictEqual(navigate('1', true), '2');
		assert.strictEqual(navigate('2', false), '1');
		assert.strictEqual(navigate('1.5', true), '2.5');
		assert.strictEqual(navigate('0', false), undefined);
	});

	test('decimals whose scaled value is not exact in floating point', () => {
		// 1.15 * 100 === 114.99999999999999
		assert.strictEqual(navigate('1.15', true), '2.15');
		assert.strictEqual(navigate('1.15', false), '0.15');
		assert.strictEqual(navigate('0.29', true), '1.29');
		assert.strictEqual(navigate('4.35', true), '5.35');
		assert.strictEqual(navigate('-1.15', true), '-0.15');
	});

	test('value sets', () => {
		assert.strictEqual(navigate('true', true), 'false');
		assert.strictEqual(navigate('public', false), 'private');
	});
});
