/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { readVariableLengthQuantity, writeVariableLengthQuantity } from '../../common/variableLengthQuantity';

describe('variableLengthQuantity', () => {
	it('is sane', () => {
		const numbers = [
			-100000,
			-100,
			-1,
			0,
			1,
			100,
			100000,
		];

		for (const n of numbers) {
			const b = writeVariableLengthQuantity(n);
			const { value, consumed } = readVariableLengthQuantity(b, 0);
			expect(value).toBe(n);
			expect(consumed).toBe(b.buffer.length);
		}
	});

	it('is fuzzy', () => {
		for (let i = 0; i < 1000; i++) {
			const x = Math.round((Math.random() * 2 ** 31) * (Math.random() < 0.5 ? -1 : 1));

			const b = writeVariableLengthQuantity(x);
			const { value, consumed } = readVariableLengthQuantity(b, 0);
			expect(value).toBe(x);
			expect(consumed).toBe(b.buffer.length);
		}
	});
});
