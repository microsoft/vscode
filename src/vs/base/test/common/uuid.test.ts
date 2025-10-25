/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as uuid from '../../common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('UUID', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('generation', () => {
		const asHex = uuid.generateUuid();
		assert.strictEqual(asHex.length, 36);
		assert.strictEqual(asHex[14], '4');
		assert.ok(asHex[19] === '8' || asHex[19] === '9' || asHex[19] === 'a' || asHex[19] === 'b');
	});

	test('self-check', function () {
		const t1 = Date.now();
		while (Date.now() - t1 < 50) {
			const value = uuid.generateUuid();
			assert.ok(uuid.isUUID(value));
		}
	});
});
