/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
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
import type { ChatResponseModelChangeReason, IChatChangeEvent, IChatModel, IChatRequestModel, IChatResponseModel, IResponse } from '../../../common/model/chatModel.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';

suite('AgentHostMcpAppToolsService lifetime', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('agent-host-copilotcli://remote-host/session');
	const tool: MCP.Tool = { name: 'app_tool', inputSchema: { type: 'object' } };

	function createFixture(initialRequests: readonly (readonly string[])[] = [['call']], chatExists = true) {
		const onDidChange = store.add(new Emitter<IChatChangeEvent>());
		const onDidChangeResponse = store.add(new Emitter<ChatResponseModelChangeReason>());
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
					onDidChange: onDidChangeResponse.event,
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
		const service = store.add(new AgentHostMcpAppToolsService(upcastPartial<ILanguageModelToolsService>({ registerTool: () => Disposable.None }), new NullLogService(), chatService, upcastPartial<IAgentHostConnectionsService>({
			onDidChangeSessionResolution: Event.None,
			resolveSessionResourceIdentity: () => undefined,
		})));
		const renderData: IMcpAppRenderData = { ...mcpAppData, sessionResource, input: '{}' };
		return {
			service, renderData,
			setRequests(updatedRequests: readonly (readonly string[])[]) {
				requests = updatedRequests;
				onDidChange.fire({ kind: 'setSessionCost' });
			},
			setResponseApps(updatedRequests: readonly (readonly string[])[]) {
				requests = updatedRequests;
				onDidChangeResponse.fire({ reason: 'other' });
			},
			disposeChat: () => onDidDispose.fire(),
		};
	}

	function createModel(initialTools: readonly MCP.Tool[] = [tool]) {
		const tools = observableValue<readonly MCP.Tool[]>('appTools', initialTools);
		let disposals = 0;
		let visible = true;
		let hiddenRetentionEnabled = true;
		const releaseHiddenContext = () => {
			if (!visible && !hiddenRetentionEnabled && tools.get().length > 0) {
				tools.set([], undefined);
			}
		};
		const model = upcastPartial<ChatMcpAppModel>({
			tools,
			setHiddenRetentionEnabled: enabled => {
				hiddenRetentionEnabled = enabled;
				releaseHiddenContext();
			},
			dispose: () => { disposals++; },
		});
		return {
			model, tools,
			get disposals() { return disposals; },
			get hiddenRetentionEnabled() { return hiddenRetentionEnabled; },
			setVisible(value: boolean) {
				visible = value;
				releaseHiddenContext();
			},
		};
	}

	test('reacquires the same retained model without disposing referenced views on retention changes', () => {
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

	test('evicts hidden tool contexts while views remain referenced and preserves their reappearance', () => {
		const fixture = createFixture([['a', 'b', 'c', 'd']]);
		const apps = ['a', 'b', 'c', 'd'].map(toolCallId => {
			const app = createModel([{ ...tool, name: toolCallId }]);
			const reference = store.add(fixture.service.acquire(fixture.renderData, toolCallId, () => app.model));
			store.add(fixture.service.registerApp(sessionResource, app.model));
			app.setVisible(false);
			return { app, reference };
		});
		const definitions = () => fixture.service.getToolDefinitions(sessionResource).get().map(tool => tool.name);
		const initial = definitions();
		fixture.setRequests([['a', 'b', 'c', 'd'], []]);
		const afterEmptyRequest = { tools: definitions(), disposals: apps.map(({ app }) => app.disposals) };
		const first = apps[0];
		first.app.setVisible(true);
		first.app.tools.set([{ ...tool, name: 'a' }], undefined);
		const reference = store.add(fixture.service.acquire(fixture.renderData, 'a', () => { throw new Error('Unexpected model creation'); }));
		const reappeared = { sameModel: reference.object === first.reference.object, tools: definitions() };
		first.app.setVisible(false);
		reference.dispose();
		first.reference.dispose();
		assert.deepStrictEqual({ initial, afterEmptyRequest, reappeared, hiddenAgain: definitions(), disposals: apps.map(({ app }) => app.disposals) }, {
			initial: ['a', 'b', 'c', 'd'],
			afterEmptyRequest: { tools: ['b', 'c', 'd'], disposals: [0, 0, 0, 0] },
			reappeared: { sameModel: true, tools: ['b', 'c', 'd', 'a'] },
			hiddenAgain: ['b', 'c', 'd'], disposals: [1, 0, 0, 0],
		});
	});

	test('updates referenced apps on streamed response changes and counts tool-less apps in the budget', () => {
		const fixture = createFixture([['a', 'b', 'c', 'd'], []]);
		const apps = ['a', 'b', 'c', 'd'].map(toolCallId => {
			const app = createModel(toolCallId === 'b' || toolCallId === 'd' ? [] : [tool]);
			store.add(fixture.service.acquire(fixture.renderData, toolCallId, () => app.model));
			app.setVisible(false);
			return app;
		});
		const initial = apps.map(app => ({ eligible: app.hiddenRetentionEnabled, tools: app.tools.get().length }));
		fixture.setResponseApps([['a', 'b', 'c', 'd'], ['e', 'f']]);
		const afterStreaming = apps.map(app => ({ eligible: app.hiddenRetentionEnabled, tools: app.tools.get().length, disposals: app.disposals }));
		fixture.setRequests([['a', 'b', 'c', 'd']]);
		assert.deepStrictEqual({ initial, afterStreaming, restoredLatest: apps.map(app => app.hiddenRetentionEnabled) }, {
			initial: [
				{ eligible: false, tools: 0 }, { eligible: true, tools: 0 },
				{ eligible: true, tools: 1 }, { eligible: true, tools: 0 },
			],
			afterStreaming: [
				{ eligible: false, tools: 0, disposals: 0 }, { eligible: false, tools: 0, disposals: 0 },
				{ eligible: false, tools: 0, disposals: 0 }, { eligible: true, tools: 0, disposals: 0 },
			],
			restoredLatest: [true, true, true, true],
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
