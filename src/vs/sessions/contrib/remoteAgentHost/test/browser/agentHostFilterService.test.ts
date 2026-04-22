/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { AgentHostFilterService } from '../../browser/agentHostFilterService.js';
import { AgentHostFilterConnectionStatus } from '../../common/agentHostFilter.js';

class StubRemoteProvider {
	readonly id: string;
	readonly label: string;
	readonly remoteAddress: string;
	private readonly _status;
	readonly connectionStatus: IObservable<RemoteAgentHostConnectionStatus>;

	constructor(address: string, label: string, status = RemoteAgentHostConnectionStatus.Connected) {
		this.id = `agenthost-${address}`;
		this.label = label;
		this.remoteAddress = address;
		this._status = observableValue<RemoteAgentHostConnectionStatus>('status', status);
		this.connectionStatus = this._status;
	}

	setStatus(status: RemoteAgentHostConnectionStatus): void {
		this._status.set(status, undefined);
	}
}

class StubSessionsProvidersService implements Partial<ISessionsProvidersService> {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, ISessionsProvider>();
	private readonly _onDidChangeProviders = new Emitter<ISessionsProvidersChangeEvent>();
	readonly onDidChangeProviders = this._onDidChangeProviders.event;

	registerProvider(provider: ISessionsProvider): IDisposable {
		this._providers.set(provider.id, provider);
		this._onDidChangeProviders.fire({ added: [provider], removed: [] });
		return toDisposable(() => {
			if (this._providers.delete(provider.id)) {
				this._onDidChangeProviders.fire({ added: [], removed: [provider] });
			}
		});
	}

	getProviders(): ISessionsProvider[] {
		return Array.from(this._providers.values());
	}

	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this._providers.get(providerId) as T | undefined;
	}
}

class StubRemoteAgentHostService implements Partial<IRemoteAgentHostService> {
	declare readonly _serviceBrand: undefined;
	reconnect(_address: string): void { /* noop */ }
}

function pid(address: string): string {
	return `agenthost-${address}`;
}

suite('AgentHostFilterService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(providers: StubSessionsProvidersService, storage = store.add(new InMemoryStorageService())) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsProvidersService, providers as unknown as ISessionsProvidersService);
		instantiationService.stub(IRemoteAgentHostService, new StubRemoteAgentHostService() as unknown as IRemoteAgentHostService);
		instantiationService.stub(IStorageService, storage);
		return store.add(instantiationService.createInstance(AgentHostFilterService));
	}

	test('defaults to undefined when no selection persisted and no hosts', () => {
		const providers = new StubSessionsProvidersService();
		const service = createService(providers);
		assert.strictEqual(service.selectedProviderId, undefined);
		assert.deepStrictEqual([...service.hosts], []);
	});

	test('defaults based on platform when none persisted', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:9999', 'Host B') as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A', RemoteAgentHostConnectionStatus.Disconnected) as unknown as ISessionsProvider));
		const service = createService(providers);
		assert.strictEqual(service.selectedProviderId, isWeb ? pid('localhost:4321') : undefined);
	});

	test('surfaces registered remote providers with their connection status', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:9999', 'Host B', RemoteAgentHostConnectionStatus.Disconnected) as unknown as ISessionsProvider));
		const service = createService(providers);

		const hosts = [...service.hosts].map(h => ({ label: h.label, status: h.status, providerId: h.providerId }));
		assert.deepStrictEqual(hosts, [
			{ label: 'Host A', status: AgentHostFilterConnectionStatus.Connected, providerId: pid('localhost:4321') },
			{ label: 'Host B', status: AgentHostFilterConnectionStatus.Disconnected, providerId: pid('localhost:9999') },
		]);
	});

	test('updates when a provider status changes', () => {
		const providers = new StubSessionsProvidersService();
		const hostA = new StubRemoteProvider('localhost:4321', 'Host A');
		store.add(providers.registerProvider(hostA as unknown as ISessionsProvider));
		const service = createService(providers);

		let events = 0;
		store.add(service.onDidChange(() => events++));

		hostA.setStatus(RemoteAgentHostConnectionStatus.Disconnected);
		assert.strictEqual(service.hosts[0].status, AgentHostFilterConnectionStatus.Disconnected);
		assert.strictEqual(events, 1);
	});

	test('setSelectedProviderId fires change and restores based on platform', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:9999', 'Host B') as unknown as ISessionsProvider));
		const storage = store.add(new InMemoryStorageService());
		const service = createService(providers, storage);

		let events = 0;
		store.add(service.onDidChange(() => events++));

		service.setSelectedProviderId(pid('localhost:9999'));
		assert.strictEqual(service.selectedProviderId, pid('localhost:9999'));
		assert.strictEqual(events, 1);

		// Recreate service with same storage — selection is restored only on web.
		const service2 = createService(providers, storage);
		assert.strictEqual(service2.selectedProviderId, isWeb ? pid('localhost:9999') : undefined);
	});

	test('fallback selection depends on platform when selected host disappears', () => {
		const providers = new StubSessionsProvidersService();
		const hostA = new StubRemoteProvider('localhost:4321', 'Host A');
		const hostB = new StubRemoteProvider('localhost:9999', 'Host B');
		store.add(providers.registerProvider(hostA as unknown as ISessionsProvider));
		const hostBReg = providers.registerProvider(hostB as unknown as ISessionsProvider);
		const service = createService(providers);

		service.setSelectedProviderId(pid('localhost:9999'));
		assert.strictEqual(service.selectedProviderId, pid('localhost:9999'));

		// Remove Host B — selection falls back only on web.
		hostBReg.dispose();
		assert.strictEqual(service.selectedProviderId, isWeb ? pid('localhost:4321') : undefined);
	});

	test('setSelectedProviderId ignores unknown hosts', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		const service = createService(providers);
		service.setSelectedProviderId(pid('localhost:4321'));
		assert.strictEqual(service.selectedProviderId, pid('localhost:4321'));
		service.setSelectedProviderId('agenthost-nonexistent');
		assert.strictEqual(service.selectedProviderId, pid('localhost:4321'));
	});
});
