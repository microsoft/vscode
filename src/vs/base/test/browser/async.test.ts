/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { disposableWindowInterval } from 'vs/base/browser/async';
import { mainWindow } from 'vs/base/browser/window';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Async', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('disposableWindowInterval', () => {
		test('basics', async () => {
			let count = 0;
			const promise = new DeferredPromise<void>();
			const interval = disposableWindowInterval(mainWindow, () => {
				count++;
				if (count === 3) {
					promise.complete(undefined);
					return true;
				} else {
					return false;
				}
			}, 0, 10);

			await promise.p;
			assert.strictEqual(count, 3);
			interval.dispose();
		});

		test('iterations', async () => {
			let count = 0;
			const interval = disposableWindowInterval(mainWindow, () => {
				count++;

				return false;
			}, 0, 0);

			await timeout(5);
			assert.strictEqual(count, 0);
			interval.dispose();
		});

		test('dispose', async () => {
			let count = 0;
			const interval = disposableWindowInterval(mainWindow, () => {
				count++;

				return false;
			}, 0, 10);

			interval.dispose();
			await timeout(5);
			assert.strictEqual(count, 0);
		});
	});
});
