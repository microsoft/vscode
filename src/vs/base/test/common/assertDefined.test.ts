/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { assertDefined } from '../../common/assertDefined.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('assertDefined', () => {
	test('should not throw if `value` is defined (bool)', async () => {
		assert.doesNotThrow(function () {
			assertDefined(true, 'Oops something happened.');
		});
	});

	test('should not throw if `value` is defined (number)', async () => {
		assert.doesNotThrow(function () {
			assertDefined(5, 'Oops something happened.');
		});
	});

	test('should not throw if `value` is defined (zero)', async () => {
		assert.doesNotThrow(function () {
			assertDefined(0, 'Oops something happened.');
		});
	});

	test('should not throw if `value` is defined (string)', async () => {
		assert.doesNotThrow(function () {
			assertDefined('some string', 'Oops something happened.');
		});
	});

	test('should not throw if `value` is defined (empty string)', async () => {
		assert.doesNotThrow(function () {
			assertDefined('', 'Oops something happened.');
		});
	});

	test('should throw if `value` is `null`', async () => {
		const errorMessage = 'Oops something happened.';
		assert.throws(function () {
			assertDefined(null, errorMessage);
		}, new Error(errorMessage));
	});

	test('should throw if `value` is `undefined`', async () => {
		const errorMessage = 'Oops something happened.';
		assert.throws(function () {
			assertDefined(undefined, errorMessage);
		}, new Error(errorMessage));
	});

	test('should throw assertion error by default', async () => {
		const errorMessage = 'Uggh ohh!';
		let thrownError: Error | undefined;
		try {
			assertDefined(null, errorMessage);
		} catch (e) {
			thrownError = e as Error;
		}

		assertDefined(thrownError, 'Must throw an error.');

		assert(
			thrownError instanceof Error,
			'Error must be an instance of `Error`.',
		);

		assert.strictEqual(
			thrownError.message,
			errorMessage,
			'Error must have correct message.',
		);
	});

	test('should throw provided error instance', async () => {
		class TestError extends Error {
			constructor(...args: ConstructorParameters<typeof Error>) {
				super(...args);

				this.name = 'TestError';
			}
		}

		const errorMessage = 'Oops something hapenned.';
		const error = new TestError(errorMessage);

		let thrownError;
		try {
			assertDefined(null, error);
		} catch (e) {
			thrownError = e;
		}

		assert(
			thrownError instanceof TestError,
			'Error must be an instance of `TestError`.',
		);
		assert.strictEqual(
			thrownError.message,
			errorMessage,
			'Error must have correct message.',
		);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
