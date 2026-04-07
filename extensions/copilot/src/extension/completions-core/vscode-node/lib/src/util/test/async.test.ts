/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Deferred } from '../async';

suite('Deferred', function () {
	test('should resolve with the provided value', async function () {
		const deferred = new Deferred<number>();
		const value = 42;

		deferred.resolve(value);

		assert.strictEqual(await deferred.promise, value);
	});

	test('should reject with the provided reason', async function () {
		const deferred = new Deferred<string>();
		const reason = 'Error occurred';

		deferred.reject(new Error(reason));

		await assert.rejects(deferred.promise, { message: reason });
	});
});
