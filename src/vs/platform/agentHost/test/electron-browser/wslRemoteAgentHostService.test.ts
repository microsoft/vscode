/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ISharedProcessService } from '../../../ipc/electron-browser/services.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../storage/common/storage.js';
import { IRemoteAgentHostService, type IRemoteAgentHostConnectionFactory } from '../../common/remoteAgentHostService.js';
import { IWSLRelayClientFactory, WSLRemoteAgentHostService } from '../../electron-browser/wslRemoteAgentHostServiceImpl.js';

class MockWSLMainService {
	readonly onDidCloseConnection = Event.None;
	readonly onDidReportConnectProgress = Event.None;
}

class MockRemoteAgentHostService {
	readonly reconnectCalls: Array<{ readonly address: string; readonly userInitiated: boolean }> = [];

	registerConnectionFactory(_factory: IRemoteAgentHostConnectionFactory) {
		return toDisposable(() => undefined);
	}

	reconnect(address: string, userInitiated = true): void {
		this.reconnectCalls.push({ address, userInitiated });
	}

	async waitForConnection(_address: string): Promise<never> {
		throw new Error('Connection was not established in this forwarding test.');
	}
}

function asChannel(target: object): IChannel {
	return {
		call: async <T>(method: string, args?: unknown): Promise<T> => {
			const fn = (target as Record<string, unknown>)[method];
			if (typeof fn !== 'function') {
				throw new Error(`MockChannel: no method ${method}`);
			}
			return (fn as (...a: unknown[]) => Promise<T>).apply(target, (args as unknown[]) ?? []);
		},
		listen: <T>(event: string): Event<T> => {
			const value = (target as Record<string, unknown>)[event];
			if (typeof value !== 'function') {
				throw new Error(`MockChannel: no event ${event}`);
			}
			return value as Event<T>;
		},
	};
}

suite('WSLRemoteAgentHostService (renderer)', () => {
	const disposables = new DisposableStore();
	let remoteAgentHostService: MockRemoteAgentHostService;
	let service: WSLRemoteAgentHostService;

	setup(() => {
		const mainService = new MockWSLMainService();
		remoteAgentHostService = new MockRemoteAgentHostService();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, {
			getValue: () => true,
		} as Partial<IConfigurationService>);
		instantiationService.stub(ISharedProcessService, {
			getChannel: () => asChannel(mainService),
		} as Partial<ISharedProcessService>);
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IRemoteAgentHostService, remoteAgentHostService as Partial<IRemoteAgentHostService>);
		instantiationService.stub(IWSLRelayClientFactory, {
			createClient: () => { throw new Error('Unexpected relay client creation.'); },
		} as Partial<IWSLRelayClientFactory>);
		service = disposables.add(instantiationService.createInstance(WSLRemoteAgentHostService));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards whether reconnect was user-initiated', async () => {
		await assert.rejects(() => service.reconnect('Ubuntu', 'Ubuntu'), /not established/);
		await assert.rejects(() => service.reconnect('Ubuntu', 'Ubuntu', false), /not established/);

		assert.deepStrictEqual(remoteAgentHostService.reconnectCalls, [
			{ address: 'wsl:Ubuntu', userInitiated: true },
			{ address: 'wsl:Ubuntu', userInitiated: false },
		]);
	});
});
