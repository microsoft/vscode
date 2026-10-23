/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ChangeTracker } from '../changeTracker';
import { createLibTestingContext } from './context';
import { createTextDocument } from './textDocument';

suite('ChangeTracker test suite', function () {
	const accessor = createLibTestingContext().createTestingAccessor();
	let clock: sinon.SinonFakeTimers;
	setup(function () {
		clock = sinon.useFakeTimers();
	});
	teardown(function () {
		clock.restore();
	});
	test('It calls pushed actions after the timeout', async function () {
		const document = createTextDocument('file:///foo.ts', 'typescript', 0, '');
		const tracker = accessor.get(IInstantiationService).createInstance(ChangeTracker, document.uri, 100);
		let called = false;
		tracker.push(() => {
			called = true;
		}, 10);
		assert.strictEqual(called, false);
		await clock.tickAsync(30);
		assert.strictEqual(called, true);
	});

	test('It refuses new actions if already disposed', async function () {
		const document = createTextDocument('file:///foo.ts', 'typescript', 0, '');
		const tracker = accessor.get(IInstantiationService).createInstance(ChangeTracker, document.uri, 100);
		let called = 0;
		tracker.push(() => {
			called = 1;
		}, 10);
		await clock.tickAsync(30);
		assert.throws(() => {
			tracker.push(() => {
				called = 2;
			}, 100);
		});
		assert.strictEqual(called, 1);
	});
});
