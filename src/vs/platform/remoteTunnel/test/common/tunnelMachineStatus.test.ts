/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isTunnelHostTokenUnauthorizedError, parseTunnelMachineStatus, TUNNEL_MACHINE_STATUS_PREFIX } from '../../common/tunnelMachineStatus.js';

suite('Tunnel machine status', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses valid status lines and ignores invalid output', () => {
		assert.deepStrictEqual([
			parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"connected","tunnelName":"desktop-oss","isAttached":false,"link":"https://insiders.vscode.dev/tunnel/desktop-oss/c:/dir","domain":"insiders.vscode.dev"}`),
			parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"connected","tunnelName":"desktop-oss","tunnelId":"tunnel-id","isAttached":false}`),
			parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"connected","tunnelName":"desktop-oss","isAttached":true}`),
			parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"tokenError","message":"token expired"}`),
			parseTunnelMachineStatus(`\u001b[32m${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"connected","tunnelName":"desktop-oss","isAttached":false}\u001b[0m`),
			parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{invalid}`),
			parseTunnelMachineStatus(`${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"connected","tunnelName":"desktop-oss","tunnelId":1,"isAttached":false}`),
			parseTunnelMachineStatus(`noise ${TUNNEL_MACHINE_STATUS_PREFIX}{"type":"tokenError","message":"token expired"}`),
			parseTunnelMachineStatus('unrelated noise'),
		], [
			{
				type: 'connected',
				tunnelName: 'desktop-oss',
				isAttached: false,
				link: 'https://insiders.vscode.dev/tunnel/desktop-oss/c:/dir',
				domain: 'insiders.vscode.dev',
			},
			{
				type: 'connected',
				tunnelName: 'desktop-oss',
				tunnelId: 'tunnel-id',
				isAttached: false,
			},
			{
				type: 'connected',
				tunnelName: 'desktop-oss',
				isAttached: true,
			},
			{
				type: 'tokenError',
				message: 'token expired',
			},
			{
				type: 'connected',
				tunnelName: 'desktop-oss',
				isAttached: false,
			},
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});

	test('detects host token 401 unauthorized errors from CLI output', () => {
		const unauthorizedMessage = 'warn Error refreshing access token, will retry: failed to lookup tunnel for host token: response error: HTTP status 401 Unauthorized from https://useast.rel.tunnels.api.visualstudio.com/tunnels/test-tunnel?tokenScopes=host&api-version=2023-09-27-preview';
		assert.strictEqual(isTunnelHostTokenUnauthorizedError(unauthorizedMessage), true);
		assert.strictEqual(isTunnelHostTokenUnauthorizedError(`\u001b[33m${unauthorizedMessage}\u001b[0m`), true);
		assert.strictEqual(isTunnelHostTokenUnauthorizedError('warn connection error: error sending request for url'), false);
		assert.strictEqual(isTunnelHostTokenUnauthorizedError('unrelated log line'), false);
	});
});
