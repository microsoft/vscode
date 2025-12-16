/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ok, assert as commonAssert } from '../../common/assert.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { CancellationError, ReadonlyError } from '../../common/errors.js';

suite('Assert', () => {
	test('ok', () => {
		assert.throws(function () {
			ok(false);
		});

		assert.throws(function () {
			ok(null);
		});

		assert.throws(function () {
			ok();
		});

		assert.throws(function () {
			ok(null, 'Foo Bar');
		}, function (e: Error) {
			return e.message.indexOf('Foo Bar') >= 0;
		});

		ok(true);
		ok('foo');
		ok({});
		ok(5);
	});

	suite('throws a provided error object', () => {
		test('generic error', () => {
			const originalError = new Error('Oh no!');

			try {
				commonAssert(
					false,
					originalError,
				);
			} catch (thrownError) {
				assert.strictEqual(
					thrownError,
					originalError,
					'Must throw the provided error instance.',
				);

				assert.strictEqual(
					thrownError.message,
					'Oh no!',
					'Must throw the provided error instance.',
				);
			}
		});

		test('cancellation error', () => {
			const originalError = new CancellationError();

			try {
				commonAssert(
					false,
					originalError,
				);
			} catch (thrownError) {
				assert.strictEqual(
					thrownError,
					originalError,
					'Must throw the provided error instance.',
				);
			}
		});

		test('readonly error', () => {
			const originalError = new ReadonlyError('World');

			try {
				commonAssert(
					false,
					originalError,
				);
			} catch (thrownError) {
				assert.strictEqual(
					thrownError,
					originalError,
					'Must throw the provided error instance.',
				);

				assert.strictEqual(
					thrownError.message,
					'World is read-only and cannot be changed',
					'Must throw the provided error instance.',
				);
			}
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
