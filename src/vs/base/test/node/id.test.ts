/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getMachineId, getSqmMachineId, getdevDeviceId } from 'vs/base/node/id';
import { getMac } from 'vs/base/node/macAddress';
import { flakySuite } from 'vs/base/test/node/testUtils';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

flakySuite('ID', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getMachineId', async function () {
		const errors = [];
		const id = await getMachineId(err => errors.push(err));
		assert.ok(id);
		assert.strictEqual(errors.length, 0);
	});

	test('getSqmId', async function () {
		const errors = [];
		const id = await getSqmMachineId(err => errors.push(err));
		assert.ok(typeof id === 'string');
		assert.strictEqual(errors.length, 0);
	});

	test('getdevDeviceId', async function () {
		const errors = [];
		const id = await getdevDeviceId(err => errors.push(err));
		assert.ok(typeof id === 'string');
		assert.strictEqual(errors.length, 0);
	});

	test('getMac', async () => {
		const macAddress = getMac();
		assert.ok(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(macAddress), `Expected a MAC address, got: ${macAddress}`);
	});
});
