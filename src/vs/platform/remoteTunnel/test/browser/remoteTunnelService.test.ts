/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getSingletonServiceDescriptors } from '../../../instantiation/common/extensions.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService } from '../../common/remoteTunnel.js';
import { BrowserRemoteTunnelService } from '../../browser/remoteTunnelService.js';

suite('BrowserRemoteTunnelService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('provides inactive remote tunnel state without requiring CLI hosting', async () => {
		const service = new BrowserRemoteTunnelService();
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IRemoteTunnelService)?.[1];

		assert.deepStrictEqual({
			registeredConstructor: descriptor?.ctor,
			mode: await service.getMode(),
			status: await service.getTunnelStatus(),
			startStatus: await service.startTunnel({
				active: true,
				asService: false,
				session: { providerId: 'github', sessionId: 'session', accountLabel: 'account' },
			}),
			name: await service.getTunnelName(),
		}, {
			registeredConstructor: BrowserRemoteTunnelService,
			mode: INACTIVE_TUNNEL_MODE,
			status: { type: 'uninitialized' },
			startStatus: { type: 'uninitialized' },
			name: undefined,
		});
	});
});
