/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { MCP } from '../../../../mcp/common/modelContextProtocol.js';
import { AgentHostMcpAppToolsService, MCP_APP_KEEP_ALIVE_APP_COUNT } from '../../../browser/agentSessions/agentHost/agentHostMcpAppToolsService.js';
import { ChatMcpAppModel } from '../../../browser/widget/chatContentParts/toolInvocationParts/chatMcpAppModel.js';
import { IMcpAppRenderData } from '../../../browser/widget/chatContentParts/toolInvocationParts/chatMcpAppSubPart.js';
import { type ChatMcpAppData, IChatService, type IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import type { IChatChangeEvent, IChatModel, IChatRequestModel, IChatResponseModel, IResponse } from '../../../common/model/chatModel.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';

suite('AgentHostMcpAppToolsService lifetime', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('agent-host-copilotcli://remote-host/session');
	const tool: MCP.Tool = { name: 'app_tool', inputSchema: { type: 'object' } };

	function createFixture(initialRequests: readonly (readonly string[])[] = [['call']], chatExists = true) {
		const onDidChange = store.add(new Emitter<IChatChangeEvent>());
		const onDidDispose = store.add(new Emitter<void>());
		const mcpAppData: ChatMcpAppData = {
			kind: 'agentHost', serverId: 'server', serverName: 'server', channel: 'mcp://channel',
			resourceUri: 'ui://app', connectionAuthority: 'remote-host',
		};
		let requests = initialRequests;
		const chatModel = upcastPartial<IChatModel>({
			getRequests: () => requests.map((toolCallIds, index) => upcastPartial<IChatRequestModel>({
				id: `request${index}`,
				response: upcastPartial<IChatResponseModel>({
					response: upcastPartial<IResponse>({
						value: toolCallIds.map(toolCallId => upcastPartial<IChatToolInvocationSerialized>({
							kind: 'toolInvocationSerialized', toolCallId,
							toolSpecificData: { kind: 'input', rawInput: {}, mcpAppData },
						})),
					}),
				}),
			})),
			onDidChange: onDidChange.event,
			onDidDispose: onDidDispose.event,
		});
		const chatService = upcastPartial<IChatService>({ getSession: () => chatExists ? chatModel : undefined });
		const service = store.add(new AgentHostMcpAppToolsService(upcastPartial<ILanguageModelToolsService>({}), new NullLogService(), chatService, upcastPartial<IAgentHostConnectionsService>({ onDidChangeSessionResolution: Event.None })));
		const renderData: IMcpAppRenderData = { ...mcpAppData, sessionResource, input: '{}' };
		return {
			service, renderData,
			setRequests(updatedRequests: readonly (readonly string[])[]) {
				requests = updatedRequests;
				onDidChange.fire({ kind: 'setSessionCost' });
			},
			disposeChat: () => onDidDispose.fire(),
		};
	}

	function createModel(initialTools: readonly MCP.Tool[] = [tool]) {
		const tools = observableValue<readonly MCP.Tool[]>('appTools', initialTools);
		let disposals = 0;
		const model = upcastPartial<ChatMcpAppModel>({ tools, dispose: () => { disposals++; } });
		return { model, tools, get disposals() { return disposals; } };
	}

	test('reacquires the same retained model and cancels its retention watchers', () => {
		const fixture = createFixture();
		const app = createModel();
		let creations = 0;
		const create = () => { creations++; return app.model; };
		const first = store.add(fixture.service.acquire(fixture.renderData, 'call', create));
		first.dispose();
		const retainedDisposals = app.disposals;
		const second = store.add(fixture.service.acquire(fixture.renderData, 'call', create));
		app.tools.set([], undefined);
		fixture.setRequests([['other']]);
		const activeDisposals = app.disposals;
		second.dispose();
		assert.deepStrictEqual({ sameModel: first.object === second.object, creations, retainedDisposals, activeDisposals, finalDisposals: app.disposals }, {
			sameModel: true, creations: 1, retainedDisposals: 0, activeDisposals: 0, finalDisposals: 1,
		});
	});

	test('keeps models alive until their final reference is released', () => {
		const fixture = createFixture();
		const app = createModel([]);
		const first = store.add(fixture.service.acquire(fixture.renderData, 'call', () => app.model));
		const second = store.add(fixture.service.acquire(fixture.renderData, 'call', () => { throw new Error('Unexpected model creation'); }));
		first.dispose();
		first.dispose();
		const beforeLastRelease = app.disposals;
		second.dispose();
		assert.deepStrictEqual({ beforeLastRelease, afterLastRelease: app.disposals }, { beforeLastRelease: 0, afterLastRelease: 1 });
	});

	test('retains an app across newer requests with no apps', () => {
		const fixture = createFixture([['call'], [], [], []]);
		const app = createModel();
		store.add(fixture.service.acquire(fixture.renderData, 'call', () => app.model)).dispose();
		assert.deepStrictEqual({ appCount: MCP_APP_KEEP_ALIVE_APP_COUNT, disposals: app.disposals }, { appCount: 3, disposals: 0 });
	});

	test('counts the three most recent apps before filtering by tools', () => {
		const fixture = createFixture([['a'], ['b'], ['c'], ['d'], ['e']]);
		const apps = ['a', 'b', 'c', 'd', 'e'].map(toolCallId => {
			const app = createModel(toolCallId === 'b' || toolCallId === 'd' ? [] : [tool]);
			store.add(fixture.service.acquire(fixture.renderData, toolCallId, () => app.model)).dispose();
			return app;
		});
		assert.deepStrictEqual(apps.map(app => app.disposals), [1, 1, 0, 1, 0]);
	});

	test('retains all apps in the latest request even beyond three', () => {
		const fixture = createFixture([['a'], ['b', 'c', 'd', 'e']]);
		const apps = ['a', 'b', 'c', 'd', 'e'].map(toolCallId => {
			const app = createModel();
			store.add(fixture.service.acquire(fixture.renderData, toolCallId, () => app.model)).dispose();
			return app;
		});
		assert.deepStrictEqual(apps.map(app => app.disposals), [1, 0, 0, 0, 0]);
	});

	test('retains only the three most recent apps when the latest request has no apps', () => {
		const fixture = createFixture([['a', 'b', 'c', 'd'], []]);
		const apps = ['a', 'b', 'c', 'd'].map(toolCallId => {
			const app = createModel();
			store.add(fixture.service.acquire(fixture.renderData, toolCallId, () => app.model)).dispose();
			return app;
		});
		assert.deepStrictEqual(apps.map(app => app.disposals), [1, 0, 0, 0]);
	});

	test('disposes an app with no tools on release', () => {
		const fixture = createFixture();
		const app = createModel([]);
		store.add(fixture.service.acquire(fixture.renderData, 'call', () => app.model)).dispose();
		assert.strictEqual(app.disposals, 1);
	});

	test('recreates an unretained app on its next acquisition', () => {
		const fixture = createFixture();
		const first = createModel([]);
		const second = createModel([]);
		const firstRef = store.add(fixture.service.acquire(fixture.renderData, 'call', () => first.model));
		firstRef.dispose();
		const secondRef = store.add(fixture.service.acquire(fixture.renderData, 'call', () => second.model));
		assert.deepStrictEqual({ recreated: firstRef.object !== secondRef.object, disposals: [first.disposals, second.disposals] }, {
			recreated: true, disposals: [1, 0],
		});
	});

	test('disposes an app when the chat or its app invocation is missing', () => {
		const missingChat = createFixture([['call']], false);
		const missingInvocation = createFixture([['another']]);
		const first = createModel();
		const second = createModel();
		store.add(missingChat.service.acquire(missingChat.renderData, 'call', () => first.model)).dispose();
		store.add(missingInvocation.service.acquire(missingInvocation.renderData, 'call', () => second.model)).dispose();
		assert.deepStrictEqual([first.disposals, second.disposals], [1, 1]);
	});

	test('evicts retained apps outside both sets even when the new request has no apps', () => {
		const fixture = createFixture([['a', 'b', 'c', 'd']]);
		const apps = ['a', 'b', 'c', 'd'].map(toolCallId => {
			const app = createModel();
			store.add(fixture.service.acquire(fixture.renderData, toolCallId, () => app.model)).dispose();
			return app;
		});
		const initialDisposals = apps.map(app => app.disposals);
		fixture.setRequests([['a', 'b', 'c', 'd'], []]);
		const afterEmptyRequest = apps.map(app => app.disposals);
		fixture.setRequests([['a', 'b', 'c', 'd'], [], ['e']]);
		assert.deepStrictEqual({ initialDisposals, afterEmptyRequest, afterNewApp: apps.map(app => app.disposals) }, {
			initialDisposals: [0, 0, 0, 0], afterEmptyRequest: [1, 0, 0, 0], afterNewApp: [1, 1, 0, 0],
		});
	});

	test('disposes a retained app when its request is removed', () => {
		const fixture = createFixture();
		const app = createModel();
		store.add(fixture.service.acquire(fixture.renderData, 'call', () => app.model)).dispose();
		fixture.setRequests([]);
		assert.strictEqual(app.disposals, 1);
	});

	test('disposes a retained app when it stops providing tools', () => {
		const fixture = createFixture();
		const app = createModel();
		store.add(fixture.service.acquire(fixture.renderData, 'call', () => app.model)).dispose();
		app.tools.set([], undefined);
		fixture.setRequests([['call'], []]);
		assert.strictEqual(app.disposals, 1);
	});

	test('disposes a retained app with its chat session', () => {
		const fixture = createFixture();
		const app = createModel();
		store.add(fixture.service.acquire(fixture.renderData, 'call', () => app.model)).dispose();
		fixture.disposeChat();
		fixture.disposeChat();
		assert.strictEqual(app.disposals, 1);
	});

	test('disposes a referenced app with its chat session without disposing it again on release', () => {
		const fixture = createFixture();
		const app = createModel();
		const reference = store.add(fixture.service.acquire(fixture.renderData, 'call', () => app.model));
		fixture.disposeChat();
		reference.dispose();
		assert.strictEqual(app.disposals, 1);
	});

	test('isolates tool call ids across sessions and different apps within a session', () => {
		const fixture = createFixture([['call', 'different-call']]);
		const first = createModel();
		const second = createModel();
		const otherSession = createModel();
		const firstRef = store.add(fixture.service.acquire(fixture.renderData, 'call', () => first.model));
		const secondRef = store.add(fixture.service.acquire(fixture.renderData, 'different-call', () => second.model));
		const otherRef = store.add(fixture.service.acquire({ ...fixture.renderData, sessionResource: sessionResource.with({ path: '/other-session' }) }, 'call', () => otherSession.model));
		firstRef.dispose();
		secondRef.dispose();
		otherRef.dispose();
		first.tools.set([], undefined);
		assert.deepStrictEqual({ distinctModels: firstRef.object !== secondRef.object && firstRef.object !== otherRef.object, disposals: [first.disposals, second.disposals, otherSession.disposals] }, {
			distinctModels: true, disposals: [1, 0, 0],
		});
	});

	test('disposes active and retained apps when the service is disposed', () => {
		const fixture = createFixture([['active-call', 'retained-call']]);
		const active = createModel();
		const retained = createModel();
		const reference = store.add(fixture.service.acquire(fixture.renderData, 'active-call', () => active.model));
		store.add(fixture.service.acquire(fixture.renderData, 'retained-call', () => retained.model)).dispose();
		fixture.service.dispose();
		reference.dispose();
		assert.deepStrictEqual([active.disposals, retained.disposals], [1, 1]);
	});
});
