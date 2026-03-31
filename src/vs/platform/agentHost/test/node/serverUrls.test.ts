/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { formatWebSocketUrl, resolveServerUrls } from '../../node/serverUrls.js';

suite('serverUrls', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses localhost for default local-only binding', () => {
		assert.deepStrictEqual(resolveServerUrls(undefined, 8081), {
			local: ['ws://localhost:8081'],
			network: [],
		});
	});

	test('formats IPv6 websocket URLs with brackets', () => {
		assert.strictEqual(formatWebSocketUrl('::1', 8081), 'ws://[::1]:8081');
		assert.deepStrictEqual(resolveServerUrls('::1', 8081), {
			local: ['ws://[::1]:8081'],
			network: [],
		});
		assert.deepStrictEqual(resolveServerUrls('0000:0000:0000:0000:0000:0000:0000:0001', 8081), {
			local: ['ws://[0000:0000:0000:0000:0000:0000:0000:0001]:8081'],
			network: [],
		});
	});

	test('treats wildcard binding as localhost plus network urls', () => {
		assert.deepStrictEqual(resolveServerUrls('0.0.0.0', 8081, {
			lo0: [
				{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' },
			],
			en0: [
				{ address: '192.168.1.20', netmask: '255.255.255.0', family: 'IPv4', mac: '11:22:33:44:55:66', internal: false, cidr: '192.168.1.20/24' },
				{ address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '11:22:33:44:55:66', internal: false, cidr: 'fe80::1/64', scopeid: 0 },
			],
		}), {
			local: ['ws://localhost:8081'],
			network: ['ws://192.168.1.20:8081'],
		});

		assert.deepStrictEqual(resolveServerUrls('0000:0000:0000:0000:0000:0000:0000:0000', 8081, {
			lo0: [
				{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' },
			],
			en0: [
				{ address: '192.168.1.20', netmask: '255.255.255.0', family: 'IPv4', mac: '11:22:33:44:55:66', internal: false, cidr: '192.168.1.20/24' },
			],
		}), {
			local: ['ws://localhost:8081'],
			network: ['ws://192.168.1.20:8081'],
		});
	});

	test('treats explicit non-loopback host as a network url', () => {
		assert.deepStrictEqual(resolveServerUrls('example.test', 8081), {
			local: [],
			network: ['ws://example.test:8081'],
		});
	});
});
