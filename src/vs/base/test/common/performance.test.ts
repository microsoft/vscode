/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { clearMarks, getMarks, mark, PerformanceMark } from '../../common/performance.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

function marksFor(prefix: string): PerformanceMark[] {
	return getMarks().filter(m => m.name.startsWith(prefix));
}

function detailOf(m: PerformanceMark): Record<string, unknown> {
	return m.detail as Record<string, unknown>;
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

	test('clears all marks with matching prefix when no details filter', () => {
		mark(`${prefix}a`);
		mark(`${prefix}b`);
		mark(`${prefix}c`);

		clearMarks(prefix);
		assert.strictEqual(marksFor(prefix).length, 0);
	});

	test('clears only marks matching details filter', () => {
		mark(`${prefix}a`, { detail: { id: '1' } });
		mark(`${prefix}b`, { detail: { id: '2' } });
		mark(`${prefix}c`, { detail: { id: '3' } });

		clearMarks(prefix, [{ id: '1' }, { id: '3' }]);

		const remaining = marksFor(prefix);
		assert.strictEqual(remaining.length, 1);
		assert.strictEqual(detailOf(remaining[0]).id, '2');
	});

	test('clears marks with no detail only when no filter is provided', () => {
		mark(`${prefix}noDetail`);
		mark(`${prefix}withDetail`, { detail: { id: '1' } });

		clearMarks(prefix, [{ id: '1' }]);

		const remaining = marksFor(prefix);
		assert.strictEqual(remaining.length, 1);
		assert.strictEqual(remaining[0].name, `${prefix}noDetail`);
		clearMarks(prefix);
	});

	test('does not clear marks whose detail does not match any filter', () => {
		mark(`${prefix}a`, { detail: { id: '1' } });
		mark(`${prefix}b`, { detail: { id: '2' } });

		clearMarks(prefix, [{ id: '999' }]);

		assert.strictEqual(marksFor(prefix).length, 2);
	});

	test('detail filter matches on multiple keys', () => {
		mark(`${prefix}a`, { detail: { type: 'request', id: '1' } });
		mark(`${prefix}b`, { detail: { type: 'request', id: '2' } });
		mark(`${prefix}c`, { detail: { type: 'response', id: '1' } });

		clearMarks(prefix, [{ type: 'request', id: '1' }]);

		const remaining = marksFor(prefix);
		assert.strictEqual(remaining.length, 2);
		const names = remaining.map(m => m.name);
		assert.ok(names.includes(`${prefix}b`));
		assert.ok(names.includes(`${prefix}c`));
	});
});
