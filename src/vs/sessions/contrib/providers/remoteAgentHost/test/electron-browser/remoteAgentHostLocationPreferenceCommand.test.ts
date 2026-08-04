/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IRemoteAgentHostEntry, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICachedTunnel } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { collectRemoteAgentHostLocationTargets, pickRemoteAgentHostLocationTarget } from '../../electron-browser/remoteAgentHostLocationPreferenceCommand.js';

function sshEntry(name: string, address: string): IRemoteAgentHostEntry {
	return { name, connection: { type: RemoteAgentHostEntryType.SSH, address, hostName: address } };
}

function webSocketEntry(name: string, address: string): IRemoteAgentHostEntry {
	return { name, connection: { type: RemoteAgentHostEntryType.WebSocket, address } };
}

function tunnel(tunnelId: string, name: string): ICachedTunnel {
	return { tunnelId, clusterId: 'cluster', name };
}

suite('collectRemoteAgentHostLocationTargets', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns an empty list when there are no SSH entries and no cached tunnels', () => {
		assert.deepStrictEqual(collectRemoteAgentHostLocationTargets([], []), []);
	});

	test('includes one target per SSH entry, keyed by its address', () => {
		const targets = collectRemoteAgentHostLocationTargets([sshEntry('My Server', 'localhost:4321')], []);
		assert.deepStrictEqual(targets, [{ key: 'localhost:4321', label: 'My Server' }]);
	});

	test('includes one target per cached tunnel, keyed with the tunnel address prefix', () => {
		const targets = collectRemoteAgentHostLocationTargets([], [tunnel('abc123', 'My Tunnel')]);
		assert.deepStrictEqual(targets, [{ key: 'tunnel:abc123', label: 'My Tunnel' }]);
	});

	test('excludes non-SSH configured entries (e.g. WebSocket)', () => {
		const targets = collectRemoteAgentHostLocationTargets([webSocketEntry('WS Host', 'ws.example.com:1234')], []);
		assert.deepStrictEqual(targets, []);
	});

	test('deduplicates SSH entries that resolve to the same address, keeping only one target', () => {
		const targets = collectRemoteAgentHostLocationTargets(
			[sshEntry('First Name', 'localhost:4321'), sshEntry('Second Name', 'localhost:4321')],
			[],
		);
		assert.deepStrictEqual(targets, [{ key: 'localhost:4321', label: 'First Name' }]);
	});

	test('deduplicates cached tunnels with the same tunnel id', () => {
		const targets = collectRemoteAgentHostLocationTargets([], [tunnel('abc123', 'First'), tunnel('abc123', 'Second')]);
		assert.deepStrictEqual(targets, [{ key: 'tunnel:abc123', label: 'First' }]);
	});

	test('combines SSH and tunnel targets together', () => {
		const targets = collectRemoteAgentHostLocationTargets(
			[sshEntry('SSH Host', 'localhost:4321')],
			[tunnel('abc123', 'My Tunnel')],
		);
		assert.deepStrictEqual(targets, [
			{ key: 'localhost:4321', label: 'SSH Host' },
			{ key: 'tunnel:abc123', label: 'My Tunnel' },
		]);
	});
});

suite('pickRemoteAgentHostLocationTarget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined without prompting when there are no targets', async () => {
		let pickCalled = false;
		const quickInputService = { pick: async () => { pickCalled = true; return undefined; } } as unknown as IQuickInputService;

		const target = await pickRemoteAgentHostLocationTarget(quickInputService, []);
		assert.strictEqual(target, undefined);
		assert.strictEqual(pickCalled, false);
	});

	test('returns the sole target directly without prompting when there is exactly one', async () => {
		let pickCalled = false;
		const quickInputService = { pick: async () => { pickCalled = true; return undefined; } } as unknown as IQuickInputService;
		const sole = { key: 'localhost:4321', label: 'My Server' };

		const target = await pickRemoteAgentHostLocationTarget(quickInputService, [sole]);
		assert.deepStrictEqual(target, sole);
		assert.strictEqual(pickCalled, false, 'must not prompt when there is nothing to disambiguate');
	});

	test('prompts with every target when there are several, and returns the chosen one', async () => {
		const a = { key: 'localhost:4321', label: 'Host A' };
		const b = { key: 'tunnel:abc123', label: 'Tunnel B' };
		let offeredItems: readonly IQuickPickItem[] | undefined;
		const quickInputService = {
			pick: async (picks: readonly IQuickPickItem[]) => {
				offeredItems = picks;
				return picks[1];
			},
		} as unknown as IQuickInputService;

		const target = await pickRemoteAgentHostLocationTarget(quickInputService, [a, b]);
		assert.deepStrictEqual(target, b);
		assert.strictEqual(offeredItems?.length, 2);
	});

	test('returns undefined when the user cancels the picker', async () => {
		const quickInputService = { pick: async () => undefined } as unknown as IQuickInputService;

		const target = await pickRemoteAgentHostLocationTarget(quickInputService, [
			{ key: 'localhost:4321', label: 'Host A' },
			{ key: 'tunnel:abc123', label: 'Tunnel B' },
		]);
		assert.strictEqual(target, undefined);
	});
});
