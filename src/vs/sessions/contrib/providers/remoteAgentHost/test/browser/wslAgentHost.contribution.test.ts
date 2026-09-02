/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { shouldPauseWSLReconnectAfterFailure, WSLAgentHostContribution } from '../../browser/wslAgentHost.contribution.js';

suite('shouldPauseWSLReconnectAfterFailure', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('pauses reconnect after cancellation but not after regular failures', () => {
		assert.deepStrictEqual({
			cancellation: shouldPauseWSLReconnectAfterFailure(new CancellationError()),
			regularError: shouldPauseWSLReconnectAfterFailure(new Error('boom')),
		}, {
			cancellation: true,
			regularError: false,
		});
	});
});

interface IWSLDisconnectHarness {
	_reconnectStates: { deleteAndDispose(key: string): void };
	_wslService: { disconnect(distro: string): Promise<void> };
	_remoteAgentHostService: { removeRemoteAgentHost(address: string): Promise<void> };
	_reconcile(): void;
	_disconnectWSLOnDemand(distro: string, address: string): Promise<void>;
}

suite('WSLAgentHostContribution disconnect', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('drops the cached distro before tearing down the connection', async () => {
		const calls: string[] = [];
		const disconnected = new DeferredPromise<void>();
		const contribution = Object.create(WSLAgentHostContribution.prototype) as IWSLDisconnectHarness;
		contribution._reconnectStates = { deleteAndDispose: key => { calls.push(`state:${key}`); } };
		// `disconnect` is what removes the cached distro. It has to land before
		// the connection is torn down, or reconciliation still sees the host as
		// desired and re-dials it.
		contribution._wslService = {
			disconnect: async distro => {
				calls.push(`wsl:${distro}`);
				await disconnected.p;
			},
		};
		contribution._remoteAgentHostService = {
			removeRemoteAgentHost: async address => { calls.push(`remove:${address}`); },
		};
		contribution._reconcile = () => { calls.push('reconcile'); };

		const pending = contribution._disconnectWSLOnDemand('Ubuntu', 'wsl:Ubuntu');
		await timeout(0);
		assert.deepStrictEqual(calls, ['state:Ubuntu', 'wsl:Ubuntu']);

		disconnected.complete();
		await pending;
		assert.deepStrictEqual(calls, ['state:Ubuntu', 'wsl:Ubuntu', 'remove:wsl:Ubuntu', 'reconcile']);
	});
});
