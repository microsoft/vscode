/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IntervalTimer } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { asProgressiveEdit } from '../../browser/utils.js';
import assert from 'assert';


suite('AsyncEdit', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('asProgressiveEdit', async () => {
		const interval = new IntervalTimer();
		const edit = {
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			text: 'Hello, world!'
		};

		const cts = new CancellationTokenSource();
		const result = asProgressiveEdit(interval, edit, 5, cts.token);

		// Verify the range
		assert.deepStrictEqual(result.range, edit.range);

		const iter = result.newText[Symbol.asyncIterator]();

		// Verify the newText
		const a = await iter.next();
		assert.strictEqual(a.value, 'Hello,');
		assert.strictEqual(a.done, false);

		// Verify the next word
		const b = await iter.next();
		assert.strictEqual(b.value, ' world!');
		assert.strictEqual(b.done, false);

		const c = await iter.next();
		assert.strictEqual(c.value, undefined);
		assert.strictEqual(c.done, true);

		cts.dispose();
	});

	test('asProgressiveEdit - cancellation', async () => {
		const interval = new IntervalTimer();
		const edit = {
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			text: 'Hello, world!'
		};

		const cts = new CancellationTokenSource();
		const result = asProgressiveEdit(interval, edit, 5, cts.token);

		// Verify the range
		assert.deepStrictEqual(result.range, edit.range);

		const iter = result.newText[Symbol.asyncIterator]();

		// Verify the newText
		const a = await iter.next();
		assert.strictEqual(a.value, 'Hello,');
		assert.strictEqual(a.done, false);

		cts.dispose(true);

		const c = await iter.next();
		assert.strictEqual(c.value, undefined);
		assert.strictEqual(c.done, true);
	});
});
