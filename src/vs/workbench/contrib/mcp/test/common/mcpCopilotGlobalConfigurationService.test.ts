/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { Platform } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeMcpDiscoveryData } from '../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { IRemoteAgentConnection, IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { McpCopilotGlobalConfigurationService } from '../../common/mcpCopilotGlobalConfigurationService.js';

suite('McpCopilotGlobalConfigurationService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const remoteHome = URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+test', path: '/home/remote' });
	const localData: INativeMcpDiscoveryData = { platform: Platform.Linux, homedir: URI.file('/home/local') };

	async function resolve({ enabled = true, remote, local }: {
		enabled?: boolean;
		remote?: INativeMcpDiscoveryData;
		local?: () => Promise<INativeMcpDiscoveryData | undefined>;
	}) {
		const calls: string[] = [];
		const channel: IChannel = {
			call: async <T>(command: string): Promise<T> => {
				calls.push(`remote:${command}`);
				return JSON.parse(JSON.stringify(remote)) as T;
			},
			listen: () => Event.None,
		};
		const connection = remote && upcastPartial<IRemoteAgentConnection>({
			withChannel: async <T extends IChannel, R>(channelName: string, callback: (channel: T) => Promise<R>): Promise<R> => {
				calls.push(`channel:${channelName}`);
				return callback(channel as T);
			},
		});
		class TestService extends McpCopilotGlobalConfigurationService {
			protected override loadLocalDiscoveryData(): Promise<INativeMcpDiscoveryData | undefined> {
				calls.push('local');
				return local ? local() : super.loadLocalDiscoveryData();
			}
		}
		class TestLogService extends NullLogService {
			override warn() { calls.push('warn'); }
		}
		const service = new TestService(
			upcastPartial<IAgentHostEnablementService>({ enabled: constObservable(enabled) }),
			upcastPartial<IRemoteAgentService>({ getConnection: () => connection ?? null }),
			new TestLogService(),
		);
		const resource = await service.getConfigurationResource();
		return { resource: resource?.toString(true), calls };
	}

	test('resolves only on the window host and respects enablement', async () => {
		assert.deepStrictEqual(await Promise.all([
			resolve({ enabled: false, remote: { platform: Platform.Linux, homedir: remoteHome } }),
			resolve({ remote: { platform: Platform.Linux, homedir: remoteHome } }),
			resolve({ remote: { platform: Platform.Linux, homedir: remoteHome, copilotHome: URI.joinPath(remoteHome, 'custom-copilot') } }),
			resolve({ local: async () => localData }),
			resolve({}),
		]), [
			{ resource: undefined, calls: [] },
			{ resource: 'vscode-remote://ssh-remote+test/home/remote/.copilot/mcp-config.json', calls: ['channel:NativeMcpDiscoveryHelper', 'remote:load'] },
			{ resource: 'vscode-remote://ssh-remote+test/home/remote/custom-copilot/mcp-config.json', calls: ['channel:NativeMcpDiscoveryHelper', 'remote:load'] },
			{ resource: 'file:///home/local/.copilot/mcp-config.json', calls: ['local'] },
			{ resource: undefined, calls: ['local'] },
		]);
	});

	test('logs and falls back on errors or a five-second timeout', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const start = Date.now();
		const results = await Promise.all([
			resolve({ local: () => Promise.reject(new Error('unavailable')) }),
			resolve({ local: () => new Promise<never>(() => { }) }),
		]);
		assert.deepStrictEqual({ results, elapsed: Date.now() - start }, {
			results: [
				{ resource: undefined, calls: ['local', 'warn'] },
				{ resource: undefined, calls: ['local', 'warn'] },
			],
			elapsed: 5000,
		});
	}));
});
