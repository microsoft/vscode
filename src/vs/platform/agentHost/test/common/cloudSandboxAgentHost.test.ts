/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	buildWpsUrl,
	cloudSandboxAddress,
	ICloudSandboxClientToken,
} from '../../common/cloudSandboxAgentHost.js';

suite('cloudSandbox url/address helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function token(overrides: Partial<ICloudSandboxClientToken>): ICloudSandboxClientToken {
		return {
			access_token: 'tok/with+special=',
			expires_at: '2019-08-24T14:15:22Z',
			wps_endpoint: 'wss://wps.example/client/hubs/h',
			hub: 'h',
			subprotocol: 'json.reliable.webpubsub.azure.v1',
			client_id: 'client 1',
			groups: { broadcast: 'b', to_client: 'tc', to_host: 'th' },
			...overrides,
		};
	}

	test('cloudSandboxAddress prefixes the environment id', () => {
		assert.strictEqual(cloudSandboxAddress('env_42'), 'cloudsandbox:env_42');
	});

	test('buildWpsUrl attaches url-encoded access_token and clientId and forces wss', () => {
		assert.strictEqual(
			buildWpsUrl(token({})),
			'wss://wps.example/client/hubs/h?access_token=tok%2Fwith%2Bspecial%3D&clientId=client%201',
		);
	});

	test('buildWpsUrl upgrades ws/https endpoints to wss and respects existing query', () => {
		assert.strictEqual(
			buildWpsUrl(token({ wps_endpoint: 'https://wps.example/hubs/h?x=1', access_token: 't', client_id: 'c' })),
			'wss://wps.example/hubs/h?x=1&access_token=t&clientId=c',
		);
		assert.strictEqual(
			buildWpsUrl(token({ wps_endpoint: 'ws://wps.example/hubs/h', access_token: 't', client_id: 'c' })),
			'wss://wps.example/hubs/h?access_token=t&clientId=c',
		);
	});
});
