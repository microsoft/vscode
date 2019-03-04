/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as getmac from 'getmac';
import { getMachineId } from 'vs/base/node/id';

suite('ID', () => {

	test('getMachineId', () => {
		return getMachineId().then(id => {
			assert.ok(id);
		});
	});

	test('getMac', () => {
		return new Promise<string>((resolve, reject) => {
			getmac.getMac((err, macAddress) => err ? reject(err) : resolve(macAddress));
		}).then(macAddress => {
			assert.ok(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(macAddress), `Expected a MAC address, got: ${macAddress}`);
		});
	});
});