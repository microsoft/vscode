/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { clearMarks, getMarks, mark } from '../../common/performance.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

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

	teardown(() => {
		clearMarks();
	});

	test('clears a specific mark by exact name', () => {
		const nameA = `${prefix}a`;
		const nameB = `${prefix}b`;
		mark(nameA);
		mark(nameB);

		clearMarks(nameA);

		const remaining = getMarks().filter(m => m.name.startsWith(prefix));
		assert.deepStrictEqual(remaining.map(m => m.name), [nameB]);
	});

	test('does not clear marks with a different name', () => {
		const name1 = `${prefix}a`;
		const name2 = `${uniquePrefix()}b`;
		mark(name1);
		mark(name2);

		clearMarks(name1);

		assert.strictEqual(getMarks().filter(m => m.name === name1).length, 0);
		assert.strictEqual(getMarks().filter(m => m.name === name2).length, 1);
	});
});
