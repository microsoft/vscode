/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ChatDebugServiceImpl } from '../../../contrib/chat/common/chatDebugServiceImpl.js';
import { IChatService } from '../../../contrib/chat/common/chatService/chatService.js';
import { MainThreadChatDebug } from '../../browser/mainThreadChatDebug.js';
import { ExtHostChatDebugShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadChatDebug', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('vscode-chat-session://local/customer-disposal');
	function createService(): ChatDebugServiceImpl {
		return store.add(new ChatDebugServiceImpl(new TestConfigurationService(), store.add(new MockContextKeyService())));
	}

	function createCustomer(service = createService()) {
		let requests = 0;
		let fetches = 0;
		const proxy = new class extends mock<ExtHostChatDebugShape>() {
			override async $provideChatDebugLog() { requests++; return []; }
			override async $getAvailableDebugSessionResources() { fetches++; return []; }
		};
		const customer = store.add(new MainThreadChatDebug(SingleProxyRPCProtocol(proxy), service, new class extends mock<IChatService>() { }));
		const registrations: Map<number, DisposableStore> = Reflect.get(customer, '_providerDisposables');
		const resources: Map<number, URI> = Reflect.get(customer, '_activeSessionResources');
		const providers: Set<object> = Reflect.get(service, '_providers');
		const fetchers: Set<object> = Reflect.get(service, '_availableSessionsFetchers');
		// Release unfixed diagnostic allocations only after each test has asserted their lifetime.
		store.add(toDisposable(() => {
			for (const handle of registrations.keys()) {
				customer.$unregisterChatDebugLogProvider(handle);
			}
		}));
		return { customer, service, registrations, resources, providers, fetchers, calls: () => ({ requests, fetches }) };
	}

	test('live registrations forward provider requests and historical-session fetching', async () => {
		const fixture = createCustomer();
		fixture.customer.$registerChatDebugLogProvider(1);
		await fixture.service.invokeProviders(session);
		fixture.service.getAvailableSessionResources();
		await Promise.resolve();
		assert.deepStrictEqual({ ...fixture.calls(), providers: fixture.providers.size, fetchers: fixture.fetchers.size, resource: fixture.resources.get(1)?.toString() }, { requests: 1, fetches: 1, providers: 1, fetchers: 1, resource: session.toString() });
	});

	test('normal unregister releases both registrations and session resources', async () => {
		const fixture = createCustomer();
		fixture.customer.$registerChatDebugLogProvider(1);
		await fixture.service.invokeProviders(session);
		fixture.customer.$unregisterChatDebugLogProvider(1);
		assert.deepStrictEqual([fixture.providers.size, fixture.fetchers.size, fixture.registrations.size, fixture.resources.size], [0, 0, 0, 0]);
	});

	test('customer disposal releases provider and fetcher registrations', () => {
		const fixture = createCustomer();
		fixture.customer.$registerChatDebugLogProvider(1);
		fixture.customer.dispose();
		assert.deepStrictEqual([fixture.providers.size, fixture.fetchers.size, fixture.registrations.size], [0, 0, 0]);
	});

	test('customer disposal releases active session resources', async () => {
		const fixture = createCustomer();
		fixture.customer.$registerChatDebugLogProvider(1);
		await fixture.service.invokeProviders(session);
		fixture.customer.dispose();
		assert.strictEqual(fixture.resources.size, 0);
	});

	test('customer disposal stops requests to the departed host', async () => {
		const fixture = createCustomer();
		fixture.customer.$registerChatDebugLogProvider(1);
		fixture.customer.dispose();
		await fixture.service.invokeProviders(session);
		fixture.service.getAvailableSessionResources();
		await Promise.resolve();
		assert.deepStrictEqual(fixture.calls(), { requests: 0, fetches: 0 });
	});

	test('repeated disposal and later unregister are idempotent', () => {
		const fixture = createCustomer();
		fixture.customer.$registerChatDebugLogProvider(1);
		fixture.customer.dispose();
		fixture.customer.dispose();
		fixture.customer.$unregisterChatDebugLogProvider(1);
		assert.deepStrictEqual([fixture.providers.size, fixture.fetchers.size, fixture.registrations.size], [0, 0, 0]);
	});

	test('successive customer lifetimes do not accumulate retired registrations', () => {
		const service = createService();
		const fixture = createCustomer(service);
		for (let index = 0; index < 37; index++) {
			const retired = createCustomer(service);
			retired.customer.$registerChatDebugLogProvider(1);
			retired.customer.dispose();
		}
		assert.deepStrictEqual([fixture.providers.size, fixture.fetchers.size], [0, 0]);
	});

	test('customer disposal preserves registrations from another live customer', async () => {
		const fixture = createCustomer();
		const other = createCustomer(fixture.service);
		fixture.customer.$registerChatDebugLogProvider(1);
		other.customer.$registerChatDebugLogProvider(1);
		fixture.customer.dispose();
		await fixture.service.invokeProviders(session);
		fixture.service.getAvailableSessionResources();
		await Promise.resolve();
		assert.deepStrictEqual({ retired: fixture.calls(), live: other.calls(), providers: fixture.providers.size, fetchers: fixture.fetchers.size }, { retired: { requests: 0, fetches: 0 }, live: { requests: 1, fetches: 1 }, providers: 1, fetchers: 1 });
	});

	test('empty customer disposal preserves unrelated service registrations', () => {
		const fixture = createCustomer();
		store.add(fixture.service.registerProvider({ provideChatDebugLog: async () => [] }));
		store.add(fixture.service.registerAvailableSessionsFetcher(async () => []));
		fixture.customer.dispose();
		assert.deepStrictEqual([fixture.providers.size, fixture.fetchers.size], [1, 1]);
	});
});
