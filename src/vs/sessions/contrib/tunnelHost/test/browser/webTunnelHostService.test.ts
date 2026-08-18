/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isTunnelHosted } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { WebTunnelHostService } from '../../browser/webTunnelHostService.js';

suite('Sessions - Web Tunnel Host Service', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports a permanently inactive sharing state', async () => {
		const service = new WebTunnelHostService();
		const tunnel = { tunnelId: 'tunnel-1', name: 'my-host' };

		let startError: string | undefined;
		try {
			await service.startSharing();
		} catch (err) {
			startError = err instanceof Error ? err.message : String(err);
		}

		// Stopping is a no-op rather than an error so generic teardown paths
		// can call it unconditionally.
		await service.stopSharing();

		assert.deepStrictEqual({
			isSharing: service.isSharing,
			isConnecting: service.isConnecting,
			sharingInfo: service.sharingInfo,
			// No tunnel is ever the locally hosted one on web, so discovered
			// tunnels must never be filtered out of the picker.
			hostedTunnel: isTunnelHosted(service.sharingInfo, tunnel),
			startError,
		}, {
			isSharing: false,
			isConnecting: false,
			sharingInfo: undefined,
			hostedTunnel: false,
			startError: 'Sharing the agent host via a dev tunnel is not supported on web.',
		});
	});
});
