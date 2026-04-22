/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as sinon from 'sinon';
import { getMac } from '../../node/macAddress.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('MacAddress', () => {

	let networkInterfacesStub: sinon.SinonStub;

	setup(() => {
		networkInterfacesStub = sinon.stub(os, 'networkInterfaces');
	});

	teardown(() => {
		networkInterfacesStub.restore();
	});

	test('getMac returns mac address when available', () => {
		networkInterfacesStub.returns({
			'eth0': [{
				mac: '00:11:22:33:44:55',
				family: 'IPv4',
				address: '127.0.0.1',
				internal: false,
				netmask: '',
				cidr: null
			}]
		});

		const mac = getMac();
		assert.strictEqual(mac, '00:11:22:33:44:55');
	});

	test('getMac ignores invalid mac addresses', () => {
		networkInterfacesStub.returns({
			'eth0': [{
				mac: '00:00:00:00:00:00',
				family: 'IPv4',
				address: '127.0.0.1',
				internal: false,
				netmask: '',
				cidr: null
			}],
			'eth1': [{
				mac: '00:11:22:33:44:55',
				family: 'IPv4',
				address: '127.0.0.1',
				internal: false,
				netmask: '',
				cidr: null
			}]
		});

		const mac = getMac();
		assert.strictEqual(mac, '00:11:22:33:44:55');
	});

	test('getMac throws error when no valid mac address is found', () => {
		networkInterfacesStub.returns({
			'eth0': [{
				mac: '00:00:00:00:00:00',
				family: 'IPv4',
				address: '127.0.0.1',
				internal: false,
				netmask: '',
				cidr: null
			}]
		});

		assert.throws(() => getMac(), /Unable to retrieve mac address/);
	});

	test('getMac handles multiple interfaces properly', () => {
		networkInterfacesStub.returns({
			'lo': [{
				mac: '00:00:00:00:00:00',
				family: 'IPv4',
				address: '127.0.0.1',
				internal: true,
				netmask: '',
				cidr: null
			}],
			'docker0': [{
				mac: '02:42:1a:2b:3c:4d',
				family: 'IPv4',
				address: '172.17.0.1',
				internal: false,
				netmask: '',
				cidr: null
			}]
		});

		const mac = getMac();
		assert.strictEqual(mac, '02:42:1a:2b:3c:4d');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
