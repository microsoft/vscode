/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toErrorMessage } from '../../common/errorMessage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { transformErrorForSerialization, transformErrorFromSerialization } from '../../common/errors.js';
import { assertType } from '../../common/types.js';

suite('Errors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Get Error Message', function () {
		assert.strictEqual(toErrorMessage('Foo Bar'), 'Foo Bar');
		assert.strictEqual(toErrorMessage(new Error('Foo Bar')), 'Foo Bar');

		let error: any = new Error();
		error = new Error();
		error.detail = {};
		error.detail.exception = {};
		error.detail.exception.message = 'Foo Bar';
		assert.strictEqual(toErrorMessage(error), 'Foo Bar');
		assert.strictEqual(toErrorMessage(error, true), 'Foo Bar');

		assert(toErrorMessage());
		assert(toErrorMessage(null));
		assert(toErrorMessage({}));

		try {
			throw new Error();
		} catch (error) {
			assert.strictEqual(toErrorMessage(error), 'An unknown error occurred. Please consult the log for more details.');
			assert.ok(toErrorMessage(error, true).length > 'An unknown error occurred. Please consult the log for more details.'.length);
		}
	});

	test('Transform Error for Serialization', function () {
		const error = new Error('Test error');
		const serializedError = transformErrorForSerialization(error);
		assert.strictEqual(serializedError.name, 'Error');
		assert.strictEqual(serializedError.message, 'Test error');
		assert.strictEqual(serializedError.stack, error.stack);
		assert.strictEqual(serializedError.noTelemetry, false);
		assert.strictEqual(serializedError.cause, undefined);
	});

	test('Transform Error with Cause for Serialization', function () {
		const cause = new Error('Cause error');
		const error = new Error('Test error', { cause });
		const serializedError = transformErrorForSerialization(error);
		assert.strictEqual(serializedError.name, 'Error');
		assert.strictEqual(serializedError.message, 'Test error');
		assert.strictEqual(serializedError.stack, error.stack);
		assert.strictEqual(serializedError.noTelemetry, false);
		assert.ok(serializedError.cause);
		assert.strictEqual(serializedError.cause?.name, 'Error');
		assert.strictEqual(serializedError.cause?.message, 'Cause error');
		assert.strictEqual(serializedError.cause?.stack, cause.stack);
	});

	test('Transform Error from Serialization', function () {
		const serializedError = transformErrorForSerialization(new Error('Test error'));
		const error = transformErrorFromSerialization(serializedError);
		assert.strictEqual(error.name, 'Error');
		assert.strictEqual(error.message, 'Test error');
		assert.strictEqual(error.stack, serializedError.stack);
		assert.strictEqual(error.cause, undefined);
	});

	test('Transform Error with Cause from Serialization', function () {
		const cause = new Error('Cause error');
		const serializedCause = transformErrorForSerialization(cause);
		const error = new Error('Test error', { cause });
		const serializedError = transformErrorForSerialization(error);
		const deserializedError = transformErrorFromSerialization(serializedError);
		assert.strictEqual(deserializedError.name, 'Error');
		assert.strictEqual(deserializedError.message, 'Test error');
		assert.strictEqual(deserializedError.stack, serializedError.stack);
		assert.ok(deserializedError.cause);
		assertType(deserializedError.cause instanceof Error);
		assert.strictEqual(deserializedError.cause?.name, 'Error');
		assert.strictEqual(deserializedError.cause?.message, 'Cause error');
		assert.strictEqual(deserializedError.cause?.stack, serializedCause.stack);
	});
});
