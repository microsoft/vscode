/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import type { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { NullLoggerService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITunnelHostInfo, TunnelHostStatus } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { TestSharedProcessService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { TUNNEL_HOST_SHARING_PREFERENCE_KEY, TunnelHostService } from '../../electron-browser/tunnelHostService.js';

class TestTunnelHostChannel implements IChannel {

	readonly calls: Array<{ command: string; args: unknown[] }> = [];
	failStop = false;

	constructor(private readonly _status: TunnelHostStatus = { active: false }) {
	}

	call<T>(command: string, args: unknown[] = []): Promise<T> {
		this.calls.push({ command, args });
		switch (command) {
			case 'getStatus':
				return Promise.resolve(this._status as T);
			case 'startHosting':
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

	function createService(storageService: InMemoryStorageService, channel: TestTunnelHostChannel): TunnelHostService {
		const sharedProcessService = new class extends TestSharedProcessService {
			override getChannel(): IChannel {
				return channel;
			}
		};
		const authenticationService = new class extends mock<IAuthenticationService>() {
			override getSessions(): Promise<AuthenticationSession[]> {
				return Promise.resolve([{
					id: 'test-session',
					accessToken: 'test-token',
					account: { label: 'test', id: 'test' },
					scopes: ['tunnel'],
				}]);
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

		return disposables.add(new TunnelHostService(
			sharedProcessService,
			authenticationService,
			productService,
			new TestConfigurationService(),
			disposables.add(new NullLoggerService()),
			{ logsHome: URI.file('/logs') } as IEnvironmentService,
			storageService,
		));
	}

	test('restores sharing enabled by the user and clears it before stopping', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const initiallyDisabledChannel = new TestTunnelHostChannel();
		const initiallyDisabledService = createService(storageService, initiallyDisabledChannel);

		await initiallyDisabledService.startSharing();

		const restoredChannel = new TestTunnelHostChannel();
		const restoredService = createService(storageService, restoredChannel);
		await Event.toPromise(Event.filter(restoredService.onDidChangeStatus, () => restoredService.isSharing));

		restoredChannel.failStop = true;
		await assert.rejects(restoredService.stopSharing(), /Unable to stop hosting/);

		assert.deepStrictEqual({
			initialStartCalls: initiallyDisabledChannel.calls.filter(call => call.command === 'startHosting').length,
			restoredStartCalls: restoredChannel.calls.filter(call => call.command === 'startHosting').length,
			isSharing: restoredService.isSharing,
			preference: storageService.getBoolean(TUNNEL_HOST_SHARING_PREFERENCE_KEY, StorageScope.APPLICATION, false),
		}, {
			initialStartCalls: 1,
			restoredStartCalls: 1,
			isSharing: true,
			preference: false,
		});
	});
});
