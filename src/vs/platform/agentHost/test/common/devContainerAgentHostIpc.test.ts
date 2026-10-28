/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IDevContainerAgentHostMainService, IDevContainerAgentHostSandboxSupport, IDiscoveredDevContainer } from '../../common/devContainerAgentHost.js';
import { createDevContainerAgentHostChannel } from '../../common/devContainerAgentHostIpc.js';

suite('Dev Container Agent Host IPC', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards discovery cancellation through the channel instead of serialized arguments', async () => {
		const source = store.add(new CancellationTokenSource());
		let observedToken: CancellationToken | undefined;
		const service = new class extends mock<IDevContainerAgentHostMainService>() {
			override readonly onDidCloseConnection = Event.None;
			override readonly onDidOutput = Event.None;
			override async listDevContainers(token: CancellationToken): Promise<readonly IDiscoveredDevContainer[]> {
				observedToken = token;
				return [{ id: 'test', name: 'Project', workspaceFolder: '/project' }];
			}
			override async isDockerAvailable() { return true; }
		}();
		const channel = createDevContainerAgentHostChannel(service, store.add(new DisposableStore()));
		const containers = await channel.call('', 'listDevContainers', undefined, source.token);
		source.cancel();
		assert.deepStrictEqual({
			containers, canceled: observedToken?.isCancellationRequested,
			sameToken: observedToken === source.token, available: await channel.call('', 'isDockerAvailable', []),
		}, {
			containers: [{ id: 'test', name: 'Project', workspaceFolder: '/project' }],
			canceled: true, sameToken: true, available: true,
		});
	});

	test('preserves unbuffered sandbox support events', () => {
		const events = store.add(new Emitter<{ connectionId: string; supported: boolean }>());
		const service = new class extends mock<IDevContainerAgentHostMainService>() {
			override readonly onDidChangeSandboxSupport = events.event;
		}();
		const channel = createDevContainerAgentHostChannel(service, store.add(new DisposableStore()));
		events.fire({ connectionId: 'before', supported: false });
		const seen: IDevContainerAgentHostSandboxSupport[] = [];
		store.add(channel.listen<IDevContainerAgentHostSandboxSupport>('', 'onDidChangeSandboxSupport')(event => seen.push(event)));
		events.fire({ connectionId: 'after', supported: true });
		assert.deepStrictEqual(seen, [{ connectionId: 'after', supported: true }]);
	});
});
