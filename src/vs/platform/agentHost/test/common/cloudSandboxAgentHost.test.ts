/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	buildWpsUrl,
	cloudSandboxAddress,
	CloudSandboxAuthenticationRequiredError,
	CloudSandboxRequestError,
	ICloudSandboxClientToken,
	isRetryableCloudSandboxError,
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

suite('isRetryableCloudSandboxError', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('only statuses that can change on their own are retryable', () => {
		const statuses = [200, 400, 401, 403, 404, 408, 409, 410, 422, 429, 500, 502, 503];
		const retryable = statuses.filter(status => isRetryableCloudSandboxError(new CloudSandboxRequestError(status, `HTTP ${status}`)));

		assert.deepStrictEqual(retryable, [200, 408, 429, 500, 502, 503]);
	});

	test('errors without a status are retryable, including a not-yet-available sign-in', () => {
		assert.deepStrictEqual(
			{
				transport: isRetryableCloudSandboxError(new Error('socket hang up')),
				statusless: isRetryableCloudSandboxError(new CloudSandboxRequestError(undefined, 'no status')),
				// Raised before any request goes out, and covers the auth provider not having
				// registered yet — so callers bound it with their own ceiling rather than here.
				authNotReady: isRetryableCloudSandboxError(new CloudSandboxAuthenticationRequiredError()),
			},
			{ transport: true, statusless: true, authNotReady: true },
		);
	});

	test('an answered request is distinguishable from an unanswered one', () => {
		// `_throwForStatus` is the sole source of CloudSandboxRequestError and always carries the
		// replied status, so the type alone separates "Mission Control refused" from "no answer" —
		// which is what lets a caller report a refusal rather than an inconclusive timeout.
		assert.deepStrictEqual(
			{
				refused: new CloudSandboxRequestError(500, 'HTTP 500') instanceof CloudSandboxRequestError,
				transport: new Error('Fetch timeout: 10000ms') instanceof CloudSandboxRequestError,
			},
			{ refused: true, transport: false },
		);
	});
});
