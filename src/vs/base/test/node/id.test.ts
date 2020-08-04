/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { getMachineId } from 'vs/base/node/id';
import { getMac } from 'vs/base/node/macAddress';

suite('ID', () => {

	test('getMachineId', function () {
		this.timeout(20000);
		return getMachineId().then(id => {
			assert.ok(id);
		});
	});

	test('getMac', () => {
		return getMac().then(macAddress => {
			assert.ok(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(macAddress), `Expected a MAC address, got: ${macAddress}`);
		});
	});
});