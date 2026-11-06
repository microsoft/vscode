/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isValidCapiAssignmentContext } from '../../browser/mainThreadTelemetry.js';

suite('MainThreadTelemetry - CAPI assignment context', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts well-formed assignment contexts', () => {
		assert.strictEqual(isValidCapiAssignmentContext('e4hcf520:1109203'), true);
		assert.strictEqual(isValidCapiAssignmentContext('e4hcf520:1109203;61623843:1255491'), true);
		// a single trailing separator is tolerated (CAPI emits `a:b;c:d;`)
		assert.strictEqual(isValidCapiAssignmentContext('e4hcf520:1109203;61623843:1255491;'), true);
	});

	test('rejects malformed, empty or oversized input', () => {
		assert.strictEqual(isValidCapiAssignmentContext(''), false);
		assert.strictEqual(isValidCapiAssignmentContext('noColonHere'), false);
		assert.strictEqual(isValidCapiAssignmentContext('a:b;;c:d'), false); // empty inner entry
		assert.strictEqual(isValidCapiAssignmentContext('a b:c'), false); // whitespace
		assert.strictEqual(isValidCapiAssignmentContext('a:b\nc:d'), false); // control character
		assert.strictEqual(isValidCapiAssignmentContext(`a:${'b'.repeat(9 * 1024)}`), false); // over 8KB
	});
});
