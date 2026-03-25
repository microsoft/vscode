/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { clearMarks, getMarks, mark } from '../../common/performance.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

function marksFor(prefix: string) {
	return getMarks().filter(m => m.name.startsWith(prefix));
}

// Each test uses a unique prefix via a counter to avoid singleton state leaking between tests.
let testCounter = 0;
function uniquePrefix(): string {
	return `test/perf/${testCounter++}/`;
}

suite('clearMarks', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let prefix: string;

	setup(() => {
		prefix = uniquePrefix();
	});

	test('clears all marks with matching prefix', () => {
		mark(`${prefix}a`);
		mark(`${prefix}b`);
		mark(`${prefix}c`);

		clearMarks(prefix);
		assert.strictEqual(marksFor(prefix).length, 0);
	});

	test('does not clear marks with a different prefix', () => {
		const otherPrefix = uniquePrefix();
		mark(`${prefix}a`);
		mark(`${otherPrefix}b`);

		clearMarks(prefix);

		assert.strictEqual(marksFor(prefix).length, 0);
		assert.strictEqual(marksFor(otherPrefix).length, 1);

		clearMarks(otherPrefix);
	});
});
