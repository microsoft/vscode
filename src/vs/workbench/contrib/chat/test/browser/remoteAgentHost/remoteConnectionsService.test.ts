/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, stub } from 'sinon';
import { runOnChange } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostRemoteConnectionsSettingId } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { RemoteConnectionsService } from '../../../browser/remoteAgentHost/remoteConnectionsService.js';

const backendStorageKey = 'agentHost.remoteConnections.backend';

suite('RemoteConnectionsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());

	function configuration(legacyBackend?: string) {
		const service = new TestConfigurationService({ [AgentHostRemoteConnectionsSettingId]: legacyBackend });
		store.add(service.onDidChangeConfigurationEmitter);
		return service;
	}

	for (const [legacy, expected] of [
		[undefined, 'devTunnel'],
		['devTunnel', 'devTunnel'],
		['githubEnvironment', 'githubEnvironment'],
		['missionControl', 'githubEnvironment'],
		['invalid', 'devTunnel'],
	] as const) {
		test(`initializes machine-local application storage from ${legacy ?? 'an absent setting'}`, () => {
			const storage = store.add(new InMemoryStorageService());
			const config = configuration(legacy);
			const update = stub(config, 'updateValue');
			const connections = store.add(new RemoteConnectionsService(storage, config));
			assert.deepStrictEqual({
				backend: connections.backend.get(),
				stored: storage.get(backendStorageKey, StorageScope.APPLICATION),
				machineKeys: storage.keys(StorageScope.APPLICATION, StorageTarget.MACHINE),
				userKeys: storage.keys(StorageScope.APPLICATION, StorageTarget.USER),
				settingsUpdates: update.callCount,
			}, { backend: expected, stored: expected, machineKeys: [backendStorageKey], userKeys: [], settingsUpdates: 0 });
		});
	}

	test('does not initialize the method from workspace or remote settings', () => {
		const config = configuration();
		stub(config, 'inspect').returns({
			value: 'githubEnvironment',
			workspaceValue: 'githubEnvironment',
			userRemoteValue: 'githubEnvironment',
			defaultValue: undefined,
		});
		const connections = store.add(new RemoteConnectionsService(store.add(new InMemoryStorageService()), config));
		assert.strictEqual(connections.backend.get(), 'devTunnel');
	});

	test('uses the legacy setting only once, including when initially unset', async () => {
		const storage = store.add(new InMemoryStorageService());
		const config = configuration();
		const first = store.add(new RemoteConnectionsService(storage, config));
		await config.setUserConfiguration(AgentHostRemoteConnectionsSettingId, 'githubEnvironment');
		const restored = store.add(new RemoteConnectionsService(storage, config));
		assert.deepStrictEqual([first.backend.get(), restored.backend.get()], ['devTunnel', 'devTunnel']);
	});

	for (const [stored, legacy] of [['devTunnel', 'githubEnvironment'], ['githubEnvironment', 'devTunnel']] as const) {
		test(`retains stored ${stored} instead of legacy ${legacy} on reload`, () => {
			const storage = store.add(new InMemoryStorageService());
			const first = store.add(new RemoteConnectionsService(storage, configuration()));
			first.setBackend(stored);
			const restored = store.add(new RemoteConnectionsService(storage, configuration(legacy)));
			assert.strictEqual(restored.backend.get(), stored);
		});
	}

	test('observes other windows and ignores repeated selection of the current method', () => {
		const storage = store.add(new InMemoryStorageService());
		const first = store.add(new RemoteConnectionsService(storage, configuration()));
		const second = store.add(new RemoteConnectionsService(storage, configuration('githubEnvironment')));
		const changes: string[] = [];
		store.add(runOnChange(second.backend, backend => changes.push(backend)));
		const writes = stub(storage, 'store').callThrough();
		first.setBackend('githubEnvironment');
		second.setBackend('githubEnvironment');
		storage.store(backendStorageKey, 'devTunnel', StorageScope.APPLICATION, StorageTarget.MACHINE, true);
		assert.deepStrictEqual({
			first: first.backend.get(),
			second: second.backend.get(),
			changes,
			writes: writes.args,
		}, {
			first: 'devTunnel',
			second: 'devTunnel',
			changes: ['githubEnvironment', 'devTunnel'],
			writes: [
				[backendStorageKey, 'githubEnvironment', StorageScope.APPLICATION, StorageTarget.MACHINE],
				[backendStorageKey, 'devTunnel', StorageScope.APPLICATION, StorageTarget.MACHINE, true],
			],
		});
	});
});
