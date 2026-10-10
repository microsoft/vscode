/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { assertExpectedFailure } from './e2e/harness/expectedFailure.js';

suite('Agent Host E2E expected failures', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts the specified synchronous failure', async () => {
		await assertExpectedFailure('test-issue', /^known failure$/, () => {
			throw new Error('known failure');
		});
	});

	test('accepts the specified asynchronous failure', async () => {
		await assertExpectedFailure('test-issue', /^known failure$/, async () => {
			throw new Error('known failure');
		});
	});

	test('fails on an unexpected pass and identifies the marker to remove', async () => {
		await assert.rejects(assertExpectedFailure('test-issue', /^known failure$/, async () => { }), {
			message: 'Unexpected pass for test-issue. Remove the expected-failure marker and keep the desired-behavior assertions.',
		});
	});

	test('preserves unrelated errors', async () => {
		const error = new Error('fixture setup failed');
		await assert.rejects(assertExpectedFailure('test-issue', /^known failure$/, async () => {
			throw error;
		}), actual => actual === error);
	});

	test('does not accept non-Error rejections with a matching message', async () => {
		const error = { message: 'known failure' };
		await assert.rejects(assertExpectedFailure('test-issue', /^known failure$/, () => Promise.reject(error)), actual => actual === error);
	});

	test('does not retain regular-expression match state between runs', async () => {
		const pattern = /^known failure$/g;
		for (let index = 0; index < 2; index++) {
			await assertExpectedFailure('test-issue', pattern, async () => {
				throw new Error('known failure');
			});
		}
		assert.strictEqual(pattern.lastIndex, 0);
	});
});
