/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from 'vs/base/common/async';
import { SaveSequentializer } from 'vs/workbench/services/textfile/common/saveSequenzializer';

suite('Files - SaveSequentializer', () => {

	test('SaveSequentializer - pending basics', async function () {
		const sequentializer = new SaveSequentializer();

		assert.ok(!sequentializer.hasPendingSave());
		assert.ok(!sequentializer.hasPendingSave(2323));
		assert.ok(!sequentializer.pendingSave);

		// pending removes itself after done
		await sequentializer.setPending(1, Promise.resolve());
		assert.ok(!sequentializer.hasPendingSave());
		assert.ok(!sequentializer.hasPendingSave(1));
		assert.ok(!sequentializer.pendingSave);

		// pending removes itself after done (use timeout)
		sequentializer.setPending(2, timeout(1));
		assert.ok(sequentializer.hasPendingSave());
		assert.ok(sequentializer.hasPendingSave(2));
		assert.ok(!sequentializer.hasPendingSave(1));
		assert.ok(sequentializer.pendingSave);

		await timeout(2);
		assert.ok(!sequentializer.hasPendingSave());
		assert.ok(!sequentializer.hasPendingSave(2));
		assert.ok(!sequentializer.pendingSave);
	});

	test('SaveSequentializer - pending and next (finishes instantly)', async function () {
		const sequentializer = new SaveSequentializer();

		let pendingDone = false;
		sequentializer.setPending(1, timeout(1).then(() => { pendingDone = true; return; }));

		// next finishes instantly
		let nextDone = false;
		const res = sequentializer.setNext(() => Promise.resolve(null).then(() => { nextDone = true; return; }));

		await res;
		assert.ok(pendingDone);
		assert.ok(nextDone);
	});

	test('SaveSequentializer - pending and next (finishes after timeout)', async function () {
		const sequentializer = new SaveSequentializer();

		let pendingDone = false;
		sequentializer.setPending(1, timeout(1).then(() => { pendingDone = true; return; }));

		// next finishes after timeout
		let nextDone = false;
		const res = sequentializer.setNext(() => timeout(1).then(() => { nextDone = true; return; }));

		await res;
		assert.ok(pendingDone);
		assert.ok(nextDone);
	});

	test('SaveSequentializer - pending and multiple next (last one wins)', async function () {
		const sequentializer = new SaveSequentializer();

		let pendingDone = false;
		sequentializer.setPending(1, timeout(1).then(() => { pendingDone = true; return; }));

		// next finishes after timeout
		let firstDone = false;
		let firstRes = sequentializer.setNext(() => timeout(2).then(() => { firstDone = true; return; }));

		let secondDone = false;
		let secondRes = sequentializer.setNext(() => timeout(3).then(() => { secondDone = true; return; }));

		let thirdDone = false;
		let thirdRes = sequentializer.setNext(() => timeout(4).then(() => { thirdDone = true; return; }));

		await Promise.all([firstRes, secondRes, thirdRes]);
		assert.ok(pendingDone);
		assert.ok(!firstDone);
		assert.ok(!secondDone);
		assert.ok(thirdDone);
	});
});
