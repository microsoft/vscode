/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import type { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { NullLoggerService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITunnelHostInfo, TunnelHostStatus } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { TestSharedProcessService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { TUNNEL_HOST_SHARING_PREFERENCE_KEY, TunnelHostService } from '../../electron-browser/tunnelHostService.js';

class TestTunnelHostChannel implements IChannel {

	readonly calls: Array<{ command: string; args: unknown[] }> = [];
	failStop = false;
	failStart = false;
	private readonly _status = new DeferredPromise<TunnelHostStatus>();

	constructor(status: TunnelHostStatus | undefined = { active: false }) {
		if (status) {
			this._status.complete(status);
		}
	}

	resolveStatus(status: TunnelHostStatus): void {
		this._status.complete(status);
	}

	call<T>(command: string, args: unknown[] = []): Promise<T> {
		this.calls.push({ command, args });
		switch (command) {
			case 'getStatus':
				return this._status.p as Promise<T>;
			case 'startHosting':
				if (this.failStart) {
					return Promise.reject(new Error('Unable to start hosting'));
				}
				return Promise.resolve(({ tunnelName: 'test-tunnel' } satisfies ITunnelHostInfo) as T);
			case 'stopHosting':
				if (this.failStop) {
					return Promise.reject(new Error('Unable to stop hosting'));
				}
				return Promise.resolve(undefined as T);
			default:
				throw new Error(`Unexpected command: ${command}`);
		}
	}

	listen<T>(_event: string): Event<T> {
		return Event.None;
	}
}

suite('TunnelHostService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(
		storageService: InMemoryStorageService,
		channel: TestTunnelHostChannel,
		sessions: readonly AuthenticationSession[] = [{
			id: 'test-session',
			accessToken: 'test-token',
			account: { label: 'test', id: 'test' },
			scopes: ['tunnel'],
		}],
	): { service: TunnelHostService; createSessionCalls: () => number } {
		const sharedProcessService = new class extends TestSharedProcessService {
			override getChannel(): IChannel {
				return channel;
			}
		};
		let createSessionCalls = 0;
		const authenticationService = new class extends mock<IAuthenticationService>() {
			override getSessions(): Promise<AuthenticationSession[]> {
				return Promise.resolve([...sessions]);
			}

			override createSession(): Promise<AuthenticationSession> {
				createSessionCalls++;
				return Promise.resolve({
					id: 'created-session',
					accessToken: 'created-token',
					account: { label: 'test', id: 'test' },
					scopes: ['tunnel'],
				});
			}
		};
		const productService = new class extends mock<IProductService>() {
			override readonly tunnelApplicationConfig = {
				authenticationProviders: {
					github: { scopes: ['tunnel'] },
				},
				editorWebUrl: 'https://example.test',
				extension: {
					friendlyName: 'Remote Tunnels',
					extensionId: 'ms-vscode.remote-server',
				},
			};
		};

		return {
			service: disposables.add(new TunnelHostService(
				sharedProcessService,
				authenticationService,
				productService,
				new TestConfigurationService(),
				disposables.add(new NullLoggerService()),
				{ logsHome: URI.file('/logs') } as IEnvironmentService,
				storageService,
			)),
			createSessionCalls: () => createSessionCalls,
		};
	}

	test('restores sharing enabled by the user and clears it before stopping', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const initiallyDisabledChannel = new TestTunnelHostChannel();
		const initiallyDisabledService = createService(storageService, initiallyDisabledChannel);

		await initiallyDisabledService.service.startSharing();
		const initialMachineKeys = storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE);

		const restoredChannel = new TestTunnelHostChannel();
		const restoredService = createService(storageService, restoredChannel);
		await Event.toPromise(Event.filter(restoredService.service.onDidChangeStatus, () => restoredService.service.isSharing));

		restoredChannel.failStop = true;
		await assert.rejects(restoredService.service.stopSharing(), /Unable to stop hosting/);

		assert.deepStrictEqual({
			initialStartCalls: initiallyDisabledChannel.calls.filter(call => call.command === 'startHosting').length,
			restoredStartCalls: restoredChannel.calls.filter(call => call.command === 'startHosting').length,
			isSharing: restoredService.service.isSharing,
			preference: storageService.getBoolean(TUNNEL_HOST_SHARING_PREFERENCE_KEY, StorageScope.APPLICATION, false),
			initialMachineKeys,
			userKeys: storageService.keys(StorageScope.APPLICATION, StorageTarget.USER),
		}, {
			initialStartCalls: 1,
			restoredStartCalls: 1,
			isSharing: true,
			preference: false,
			initialMachineKeys: [TUNNEL_HOST_SHARING_PREFERENCE_KEY],
			userKeys: [],
		});
	});

	test('restores sharing without prompting for authentication', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store(TUNNEL_HOST_SHARING_PREFERENCE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const channel = new TestTunnelHostChannel(undefined);
		const service = createService(storageService, channel, []);
		const initialized = Event.toPromise(Event.filter(service.service.onDidChangeStatus, () => !service.service.isConnecting));

		channel.resolveStatus({ active: false });
		await initialized;

		assert.deepStrictEqual({
			startHostingCalls: channel.calls.filter(call => call.command === 'startHosting').length,
			createSessionCalls: service.createSessionCalls(),
			preference: storageService.getBoolean(TUNNEL_HOST_SHARING_PREFERENCE_KEY, StorageScope.APPLICATION, false),
		}, {
			startHostingCalls: 0,
			createSessionCalls: 0,
			preference: true,
		});
	});

	test('preserves sharing preference when restarting after a configuration change', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const channel = new TestTunnelHostChannel();
		const service = createService(storageService, channel);

		await service.service.startSharing();
		channel.failStart = true;
		await assert.rejects(service.service.restartSharing(), /Unable to start hosting/);

		assert.deepStrictEqual({
			stopHostingCalls: channel.calls.filter(call => call.command === 'stopHosting').length,
			startHostingCalls: channel.calls.filter(call => call.command === 'startHosting').length,
			preference: storageService.getBoolean(TUNNEL_HOST_SHARING_PREFERENCE_KEY, StorageScope.APPLICATION, false),
			machineKeys: storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE),
		}, {
			stopHostingCalls: 1,
			startHostingCalls: 2,
			preference: true,
			machineKeys: [TUNNEL_HOST_SHARING_PREFERENCE_KEY],
		});
	});
});
