/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { McpToolCallUI } from '../../browser/mcpToolCallUI.js';

suite('McpToolCallUI', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('routes Agent Host requests through the connection authority', async () => {
		const calls: Array<{ connection: string; channel: string; method: string; params: Record<string, unknown> | undefined }> = [];
		const connection = (name: string) => {
			const onMcpNotification = store.add(new Emitter<{ channel: string; method: string; params?: Record<string, unknown> }>());
			return {
				value: upcastPartial<IAgentConnection>({
					onMcpNotification: onMcpNotification.event,
					handleMcpRequest: async (channel, method, params) => {
						calls.push({ connection: name, channel, method, params });
						return {
							contents: [{
								uri: 'ui://github-mcp-server/get-me',
								mimeType: 'text/html',
								text: `<html>${name}</html>`,
							}],
						};
					},
				}),
				notify: (channel: string, method: string) => onMcpNotification.fire({ channel, method }),
			};
		};
		const ambient = connection('ambient');
		const originalRemote = connection('remote-1');
		let remote = originalRemote;
		const onDidChangeConnections = store.add(new Emitter<void>());
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: onDidChangeConnections.event,
			getConnectionByAuthority: authority => authority === 'remote-host' ? remote.value : authority === 'local' ? ambient.value : undefined,
		});
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IAgentHostConnectionsService, connectionsService],
			[IThemeService, new TestThemeService()],
		)));
		const channel = 'mcp://copilotcli/ahp-chat%3A%2F%2Fdefault%2Fsession/GitHub';
		const ui = store.add(instantiationService.createInstance(McpToolCallUI, {
			kind: 'agentHost',
			resourceUri: 'ui://github-mcp-server/get-me',
			connectionAuthority: 'remote-host',
			channel,
			serverId: 'github',
		}));
		const notifications: Array<{ method: string; params?: unknown }> = [];
		store.add(ui.onNotification(notification => notifications.push(notification)));

		const first = await ui.loadResource(CancellationToken.None);
		originalRemote.notify(channel, 'notifications/first');
		remote = connection('remote-2');
		onDidChangeConnections.fire();
		originalRemote.notify(channel, 'notifications/stale');
		remote.notify('mcp://other', 'notifications/wrong-channel');
		remote.notify(channel, 'notifications/second');
		const second = await ui.readResource('ui://github-mcp-server/details', CancellationToken.None);

		assert.deepStrictEqual({
			first: first.html,
			second: second.contents[0],
			calls,
			notifications,
		}, {
			first: '<html>remote-1</html>',
			second: {
				uri: 'ui://github-mcp-server/get-me',
				mimeType: 'text/html',
				text: '<html>remote-2</html>',
			},
			calls: [
				{
					connection: 'remote-1',
					channel,
					method: 'resources/read',
					params: { uri: 'ui://github-mcp-server/get-me' },
				},
				{
					connection: 'remote-2',
					channel,
					method: 'resources/read',
					params: { uri: 'ui://github-mcp-server/details' },
				},
			],
			notifications: [
				{ method: 'notifications/first', params: undefined },
				{ method: 'notifications/second', params: undefined },
			],
		});
	});
});
