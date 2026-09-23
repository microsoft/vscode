/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { McpServerStatus } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { ChatMcpAuthenticationContentPart } from '../../../../browser/widget/chatContentParts/chatMcpAuthenticationContentPart.js';
import { IChatMcpAuthenticationRequired, IChatMcpAuthenticationRequiredServer } from '../../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../../common/model/chatViewModel.js';

suite('ChatMcpAuthenticationContentPart', () => {
	type McpServer = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, disposables);
	});

	function server(id: string, name: string, status: McpServerStatus): McpServer {
		return new class extends mock<McpServer>() {
			override readonly id = id;
			override readonly name = name;
			override readonly status = status;
		}();
	}

	function createPart(dataServers: readonly IChatMcpAuthenticationRequiredServer[], liveServers: readonly McpServer[], authenticate = async (_serverId: string) => true, onDidAuthenticate = () => { }) {
		const changed = disposables.add(new Emitter<void>());
		let currentServers = liveServers;
		const authenticated: string[] = [];
		instantiationService.stub(IAgentHostCustomizationService, new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = changed.event;
			override getMcpServers() { return currentServers; }
			override async authenticateMcpServer(_sessionResource: URI, serverId: string) {
				authenticated.push(serverId);
				return authenticate(serverId);
			}
		}());
		const servers = observableValue('servers', dataServers);
		const data: IChatMcpAuthenticationRequired = {
			kind: 'mcpAuthenticationRequired',
			sessionResource: URI.parse('chat-session://test/session1'),
			servers,
			isUsed: false,
		};
		const part = disposables.add(instantiationService.createInstance(ChatMcpAuthenticationContentPart, data, { onDidAuthenticate }));
		return {
			part,
			data,
			authenticated,
			servers,
			setLiveServers: (servers: readonly McpServer[]) => {
				currentServers = servers;
				changed.fire();
			},
		};
	}

	test('updates stale server names and authentication targets from live pending servers', async () => {
		const { part, data, authenticated, setLiveServers } = createPart(
			[
				{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' },
				{ id: 'slack-gh', name: 'Slack GitHub', resource: 'https://slack.example.com' },
			],
			[
				server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired),
				server('slack-gh', 'Slack GitHub', McpServerStatus.AuthRequired),
				server('slack', 'Slack', McpServerStatus.Ready),
			],
		);

		const initialText = part.domNode.textContent;
		const initialAction = part.domNode.querySelector<HTMLElement>('[role="button"]');
		assert.ok(initialAction);
		setLiveServers([
			server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired),
			server('slack-gh', 'Slack GitHub', McpServerStatus.AuthRequired),
			server('slack', 'Slack', McpServerStatus.Ready),
		]);
		const actionAfterNoEffectiveChange = part.domNode.querySelector<HTMLElement>('[role="button"]');
		setLiveServers([
			server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired),
			server('slack-gh', 'Slack GitHub', McpServerStatus.Ready),
			server('slack', 'Slack', McpServerStatus.Ready),
		]);
		const singularText = part.domNode.textContent;
		const action = part.domNode.querySelector<HTMLElement>('[role="button"]');
		assert.ok(action);
		action.click();
		await timeout(0);
		setLiveServers([]);

		assert.deepStrictEqual({
			initialText,
			singularText,
			initialActionIsRetained: initialAction === actionAfterNoEffectiveChange,
			text: part.domNode.textContent,
			authenticated,
			hidden: part.domNode.style.display === 'none',
			isUsed: data.isUsed,
		}, {
			initialText: 'The MCP servers Azure ExP, Slack GitHub require authentication. Authenticate?',
			singularText: 'The MCP server Azure ExP requires authentication. Authenticate?',
			initialActionIsRetained: true,
			text: '',
			authenticated: ['azure-exp'],
			hidden: true,
			isUsed: true,
		});
	});

	test('remains unused initially and completes once when servers are populated then resolved', () => {
		let completionCount = 0;
		const { part, data, servers, setLiveServers } = createPart([], [], undefined, () => completionCount++);
		const initial = {
			hidden: part.domNode.style.display === 'none',
			isUsed: data.isUsed,
		};
		servers.set([{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' }], undefined);
		setLiveServers([server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired)]);
		setLiveServers([]);
		setLiveServers([]);

		assert.deepStrictEqual({
			initial,
			text: part.domNode.textContent,
			hidden: part.domNode.style.display === 'none',
			isUsed: data.isUsed,
			completionCount,
		}, {
			initial: { hidden: true, isUsed: false },
			text: '',
			hidden: true,
			isUsed: true,
			completionCount: 1,
		});
	});

	test('skips a queued server that no longer requires authentication', async () => {
		const { part, authenticated, setLiveServers } = createPart(
			[
				{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' },
				{ id: 'slack-gh', name: 'Slack GitHub', resource: 'https://slack.example.com' },
			],
			[
				server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired),
				server('slack-gh', 'Slack GitHub', McpServerStatus.AuthRequired),
			],
			async serverId => {
				if (serverId === 'azure-exp') {
					setLiveServers([
						server('azure-exp', 'Azure ExP', McpServerStatus.Ready),
						server('slack-gh', 'Slack GitHub', McpServerStatus.Ready),
					]);
				}
				return true;
			},
		);
		const action = part.domNode.querySelector<HTMLElement>('[role="button"]');
		assert.ok(action);
		action.click();
		await timeout(0);

		assert.deepStrictEqual(authenticated, ['azure-exp']);
	});

	test('keeps the authenticating progress message while live state changes', async () => {
		const authentication = new DeferredPromise<boolean>();
		const { part, data, setLiveServers } = createPart(
			[{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' }],
			[server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired)],
			() => authentication.p,
		);

		const action = part.domNode.querySelector<HTMLElement>('[role="button"]');
		assert.ok(action);
		action.click();
		setLiveServers([]);

		const duringAuthentication = {
			text: part.domNode.textContent,
			hidden: part.domNode.style.display === 'none',
			isUsed: data.isUsed,
		};
		authentication.complete(true);
		await timeout(0);

		assert.deepStrictEqual({
			duringAuthentication,
			afterAuthentication: {
				text: part.domNode.textContent,
				hidden: part.domNode.style.display === 'none',
				isUsed: data.isUsed,
			},
		}, {
			duringAuthentication: {
				text: 'Authenticating Azure ExP...',
				hidden: false,
				isUsed: false,
			},
			afterAuthentication: {
				text: '',
				hidden: true,
				isUsed: true,
			},
		});
	});

	test('hasSameContent matches only the same kind', () => {
		const { part } = createPart([], []);

		assert.deepStrictEqual(
			[
				part.hasSameContent({ kind: 'mcpAuthenticationRequired' } as IChatRendererContent, [], null!),
				part.hasSameContent({ kind: 'mcpServersStartingSlow' } as IChatRendererContent, [], null!),
			],
			[true, false],
		);
	});
});
