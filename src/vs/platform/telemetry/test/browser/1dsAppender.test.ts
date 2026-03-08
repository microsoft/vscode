/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OneDataSystemWebAppender } from '../../browser/1dsAppender.js';

// Son of Anton: 1DS telemetry has been removed and the appender is a no-op.
// These tests verify that the no-op appender works correctly without errors.

suite('AIAdapter', () => {
	let adapter: OneDataSystemWebAppender;
	const prefix = 'prefix';

	teardown(() => {
		adapter.flush();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		adapter = new OneDataSystemWebAppender(false, prefix, undefined!, 'test-key');
	});

	test('No-op log does not throw', () => {
		adapter.log('testEvent');
		// No-op: no events are sent
	});

	test('No-op flush resolves', async () => {
		adapter.log('testEvent');
		await adapter.flush();
		assert.ok(true, 'flush resolved without error');
	});

	test('No-op log with data does not throw', () => {
		adapter.log('testEvent', { favoriteColor: 'blue', favoriteNumber: 1 });
		// No-op: no events are sent
	});
});
