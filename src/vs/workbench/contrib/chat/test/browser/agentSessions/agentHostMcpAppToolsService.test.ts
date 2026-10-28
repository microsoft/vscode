/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostSessionIdentity } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { readAgentToolOrigin } from '../../../../../../platform/agentHost/common/meta/agentToolDefinitionMeta.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentHostMcpAppToolsService, IAgentHostMcpAppToolProvider } from '../../../browser/agentSessions/agentHost/agentHostMcpAppToolsService.js';
import { ILanguageModelToolsService, IToolData, IToolImpl, IToolResult, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { MCP } from '../../../../mcp/common/modelContextProtocol.js';
import { IChatService } from '../../../common/chatService/chatService.js';

type RegisteredTool = { data: IToolData; implementation: IToolImpl };

/** Tracks registrations without invoking unrelated language-model tool services. */
class TestToolsService extends mock<ILanguageModelToolsService>() {
	readonly registered = new Map<string, RegisteredTool>();
	registrationCount = 0;

	override registerTool(data: IToolData, implementation: IToolImpl): IDisposable {
		assert.ok(!this.registered.has(data.id));
		this.registrationCount++;
		this.registered.set(data.id, { data, implementation });
		return toDisposable(() => this.registered.delete(data.id));
	}
}

/** A live app with a mutable tool list and observable calls. */
class TestApp implements IAgentHostMcpAppToolProvider {
	readonly tools;
	readonly calls: { name: string; args: Record<string, unknown>; token: CancellationToken }[] = [];
	result: MCP.CallToolResult = { content: [] };

	constructor(tools: readonly MCP.Tool[], private readonly _callTool?: IAgentHostMcpAppToolProvider['callTool']) {
		this.tools = observableValue(this, tools);
	}

	async callTool(name: string, args: Record<string, unknown>, token: CancellationToken): Promise<MCP.CallToolResult> {
		this.calls.push({ name, args, token });
		return this._callTool ? this._callTool(name, args, token) : this.result;
	}
}

/** Creates an app tool with the required object schema. */
function appTool(name: string, definition: Partial<MCP.Tool> = {}): MCP.Tool {
	return { name, inputSchema: { type: 'object' }, ...definition };
}

/** Invokes the registered implementation through the same shape used by the client-tool pipeline. */
function invoke(tool: RegisteredTool, sessionResource: URI | undefined, parameters: Record<string, unknown> = {}, token = CancellationToken.None): Promise<IToolResult> {
	return tool.implementation.invoke({
		callId: 'app-call',
		toolId: tool.data.id,
		parameters,
		context: sessionResource ? { sessionResource } : undefined,
	}, async () => 0, { report: () => { } }, token);
}

suite('AgentHostMcpAppToolsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('agent-host-test:/session');
	const otherSession = URI.parse('agent-host-test:/other');

	/** Creates an isolated registry for each test. */
	function createService(connectionsService = upcastPartial<IAgentHostConnectionsService>({
		onDidChangeSessionResolution: Event.None,
		resolveSessionResourceIdentity: () => undefined,
		findSessionResource: () => undefined,
	})) {
		const toolsService = new TestToolsService();
		const service = store.add(new AgentHostMcpAppToolsService(toolsService, new NullLogService(), upcastPartial<IChatService>({ getSession: () => undefined }), connectionsService));
		const getTool = (name: string, resource = session): RegisteredTool => {
			const data = service.getTool(resource, name);
			const tool = data && toolsService.registered.get(data.id);
			assert.ok(tool, `Missing registered tool: ${name}`);
			return tool;
		};
		return { service, toolsService, getTool };
	}

	test('publishes original definitions only in their owning session', () => {
		const { service, toolsService } = createService();
		const definitions = service.getToolDefinitions(session);
		const otherDefinitions = service.getToolDefinitions(otherSession);
		store.add(service.registerApp(session, new TestApp([
			appTool('app.lookup', { title: 'Lookup', description: 'Look up an item' }),
			appTool('annotated', { annotations: { title: 'Annotated Tool' } }),
			appTool(''),
		])));
		store.add(service.registerApp(otherSession, new TestApp([appTool('app.lookup', { title: 'Other Lookup' })])));

		assert.deepStrictEqual({
			definitions: definitions.get().map(tool => ({ name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema, origin: readAgentToolOrigin(tool) })),
			otherDefinitions: otherDefinitions.get().map(tool => ({ name: tool.name, title: tool.title })),
			metadata: [...toolsService.registered.values()].map(({ data }) => ({
				internal: data.source.type,
				sessionResource: data.sessionResource?.toString(),
				canRequestPreApproval: data.canRequestPreApproval,
			})),
		}, {
			definitions: [
				{ name: 'app.lookup', title: 'Lookup', description: 'Look up an item', inputSchema: { type: 'object' }, origin: 'mcpApp' },
				{ name: 'annotated', title: 'Annotated Tool', description: 'Annotated Tool', inputSchema: { type: 'object' }, origin: 'mcpApp' },
				{ name: '', title: '', description: '', inputSchema: { type: 'object' }, origin: 'mcpApp' },
			],
			otherDefinitions: [{ name: 'app.lookup', title: 'Other Lookup' }],
			metadata: [session, session, session, otherSession].map(sessionResource => ({ internal: 'internal', sessionResource: sessionResource.toString(), canRequestPreApproval: undefined })),
		});
	});

	test('routes to the newest current provider and falls back without changing identity', async () => {
		const { service, getTool } = createService();
		const first = new TestApp([appTool('shared', { title: 'First' })]);
		const second = new TestApp([appTool('shared', { title: 'Second' })]);
		store.add(service.registerApp(session, first));
		const original = getTool('shared');
		const secondRegistration = store.add(service.registerApp(session, second));
		const titles = [service.getToolDefinitions(session).get()[0].title];
		const ids = [getTool('shared').data.id];
		await invoke(original, session);
		second.tools.set([], undefined);
		titles.push(service.getToolDefinitions(session).get()[0].title);
		ids.push(getTool('shared').data.id);
		await invoke(original, session);
		second.tools.set([appTool('shared', { title: 'Second' })], undefined);
		secondRegistration.dispose();
		titles.push(service.getToolDefinitions(session).get()[0].title);
		ids.push(getTool('shared').data.id);
		await invoke(original, session);

		assert.deepStrictEqual({
			titles,
			stableIds: ids.map(id => id === original.data.id),
			calls: [first, second].map(app => app.calls.map(call => call.name)),
		}, {
			titles: ['Second', 'First', 'First'],
			stableIds: [true, true, true],
			calls: [['shared', 'shared'], ['shared']],
		});
	});

	test('keeps dots, long names and formerly sanitized collisions unchanged without global references', async () => {
		const { service, toolsService, getTool } = createService();
		store.add(toolsService.registerTool({
			id: 'existing', toolReferenceName: 'lookup', displayName: 'Existing', modelDescription: 'Existing', source: ToolDataSource.Internal,
		}, { invoke: async () => ({ content: [] }) }));
		const longName = 'x'.repeat(70);
		const app = new TestApp([
			appTool('lookup'), appTool('app.lookup'), appTool('app/lookup'), appTool(longName), appTool(`${longName}other`),
		]);
		store.add(service.registerApp(session, app));
		store.add(service.registerApp(otherSession, new TestApp([appTool('lookup')])));
		for (const tool of app.tools.get()) {
			await invoke(getTool(tool.name), undefined);
		}

		assert.deepStrictEqual({
			names: service.getToolDefinitions(session).get().map(tool => tool.name),
			otherNames: service.getToolDefinitions(otherSession).get().map(tool => tool.name),
			references: [...toolsService.registered.values()].map(tool => tool.data.toolReferenceName),
			calls: app.calls.map(call => call.name),
		}, {
			names: ['lookup', 'app.lookup', 'app/lookup', longName, `${longName}other`],
			otherNames: ['lookup'],
			references: ['lookup', undefined, undefined, undefined, undefined, undefined, undefined],
			calls: ['lookup', 'app.lookup', 'app/lookup', longName, `${longName}other`],
		});
	});

	test('forwards original names and parameters and preserves text and explicit errors', async () => {
		const { service, getTool } = createService();
		const app = new TestApp([appTool('app.lookup', { title: 'Lookup' })]);
		store.add(service.registerApp(session, app));
		const tool = getTool('app.lookup');
		const parameters = { key: 'item', nested: { count: 2 } };
		app.result = { content: [{ type: 'text', text: '**plain app output**' }] };
		const prepared = await tool.implementation.prepareToolInvocation?.({ toolCallId: 'app-call', parameters, chatSessionResource: session }, CancellationToken.None);
		const success = await invoke(tool, session, parameters);
		app.result = { content: [{ type: 'text', text: 'first error' }, { type: 'text', text: 'second error' }], isError: true };
		const failure = await invoke(tool, session);
		app.result = { content: [], isError: true };
		const emptyFailure = await invoke(tool, session);

		assert.deepStrictEqual({
			prepared,
			calls: app.calls.map(({ name, args }) => ({ name, args })),
			success,
			failure,
			emptyFailure,
		}, {
			prepared: { invocationMessage: 'Running Lookup', pastTenseMessage: 'Ran Lookup' },
			calls: [{ name: 'app.lookup', args: parameters }, { name: 'app.lookup', args: {} }, { name: 'app.lookup', args: {} }],
			success: { content: [{ kind: 'text', value: '**plain app output**' }] },
			failure: { content: [{ kind: 'text', value: 'first error' }, { kind: 'text', value: 'second error' }], toolResultError: 'first error\nsecond error' },
			emptyFailure: { content: [], toolResultError: 'The MCP app tool returned an error.' },
		});
	});

	test('converts binary and resource results alongside structured and text content', async () => {
		const { service, getTool } = createService();
		const app = new TestApp([appTool('result')]);
		store.add(service.registerApp(session, app));
		const data = encodeBase64(VSBuffer.fromString('binary'));
		app.result = {
			content: [
				{ type: 'text', text: 'complementary text' },
				{ type: 'image', mimeType: 'image/png', data },
				{ type: 'audio', mimeType: 'audio/wav', data },
				{ type: 'resource', resource: { uri: 'app:/text', text: 'embedded text' } },
				{ type: 'resource', resource: { uri: 'app:/blob', blob: data } },
				{ type: 'resource_link', name: 'Linked', uri: 'app:/linked' },
			],
			structuredContent: { value: 42 },
		};
		const result = await invoke(getTool('result'), session);

		assert.deepStrictEqual(result.content.map(part => part.kind === 'data'
			? { kind: part.kind, mimeType: part.value.mimeType, data: part.value.data.toString() }
			: part), [
			{ kind: 'text', value: 'complementary text' },
			{ kind: 'data', mimeType: 'image/png', data: 'binary' },
			{ kind: 'data', mimeType: 'audio/wav', data: 'binary' },
			{ kind: 'text', value: 'embedded text' },
			{ kind: 'data', mimeType: 'application/octet-stream', data: 'binary' },
			{ kind: 'text', value: 'app:/linked' },
			{ kind: 'text', value: '{"value":42}' },
		]);
	});

	test('routes equal original names independently with headless and subagent rendering contexts', async () => {
		const { service, getTool } = createService();
		const first = new TestApp([appTool('shared')]);
		const second = new TestApp([appTool('shared')]);
		first.result = { content: [{ type: 'text', text: 'first' }] };
		second.result = { content: [{ type: 'text', text: 'second' }] };
		store.add(service.registerApp(session, first));
		store.add(service.registerApp(otherSession, second));
		const firstTool = getTool('shared');
		const secondTool = getTool('shared', otherSession);
		const headless = await invoke(firstTool, undefined);
		const subagent = await invoke(firstTool, session.with({ fragment: 'subagent' }));
		const otherHeadless = await invoke(secondTool, undefined);

		assert.deepStrictEqual({
			results: [headless.content, subagent.content, otherHeadless.content],
			calls: [first, second].map(app => app.calls.map(call => call.name)),
		}, {
			results: [[{ kind: 'text', value: 'first' }], [{ kind: 'text', value: 'first' }], [{ kind: 'text', value: 'second' }]],
			calls: [['shared', 'shared'], ['shared']],
		});
	});

	test('shares app publication and newest-provider routing across authoritative sibling and alias mappings', async () => {
		const backend = URI.parse('vendor-session://host/opaque-session?identity=one');
		const alias = URI.parse('agent-host-alias:/different-frontend-address');
		const { service, getTool } = createService(upcastPartial<IAgentHostConnectionsService>({
			onDidChangeSessionResolution: Event.None,
			resolveSessionResourceIdentity: resource => isEqual(resource, session) || isEqual(resource, alias)
				? upcastPartial<IAgentHostSessionIdentity>({ backendSession: backend, connectionAuthority: 'remote', backendSessionIsAdvertised: true })
				: undefined,
			findSessionResource: (resource, authority) => isEqual(resource, backend) && authority === 'remote' ? session : undefined,
		}));
		const first = new TestApp([appTool('shared', { title: 'First' })]);
		const second = new TestApp([appTool('shared', { title: 'Second' })]);
		store.add(service.registerApp(session, first));
		const original = getTool('shared');
		store.add(service.registerApp(alias.with({ fragment: 'peer-chat' }), second));
		store.add(service.registerApp(otherSession, new TestApp([appTool('shared', { title: 'Other Session' })])));
		await invoke(original, undefined);
		await invoke(getTool('shared', alias), otherSession);
		assert.deepStrictEqual({
			titles: [session, alias, alias.with({ fragment: 'peer-chat' }), otherSession].map(resource => service.getToolDefinitions(resource).get()[0].title),
			scopes: [session, alias, alias.with({ fragment: 'peer-chat' }), otherSession].map(resource => service.getToolSessionResource(resource).toString()),
			stableId: service.getTool(alias, 'shared')?.id === original.data.id,
			calls: [first, second].map(app => app.calls.map(call => call.name)),
		}, {
			titles: ['Second', 'Second', 'Second', 'Other Session'],
			scopes: [session, session, session, otherSession].map(resource => resource.toString()),
			stableId: true, calls: [[], ['shared', 'shared']],
		});
	});

	test('removes registrations and prevents stale implementations from reaching a replacement app', async () => {
		const { service, toolsService, getTool } = createService();
		const definitions = service.getToolDefinitions(session);
		const registration = store.add(service.registerApp(session, new TestApp([appTool('lookup')])));
		const original = getTool('lookup');
		registration.dispose();
		const removed = { definitions: definitions.get(), toolCount: toolsService.registered.size };
		const unavailable = await invoke(original, session);
		const replacement = new TestApp([appTool('lookup')]);
		store.add(service.registerApp(session, replacement));
		const stale = await invoke(original, session);
		service.dispose();

		assert.deepStrictEqual({
			removed,
			unavailable: unavailable.toolResultError,
			stale: stale.toolResultError,
			replacementCalls: replacement.calls.length,
			disposed: { definitions: definitions.get(), toolCount: toolsService.registered.size },
		}, {
			removed: { definitions: [], toolCount: 0 },
			unavailable: 'MCP app tool "lookup" is no longer available.',
			stale: 'MCP app tool "lookup" is no longer available.',
			replacementCalls: 0,
			disposed: { definitions: [], toolCount: 0 },
		});
	});

	test('updates definitions with stable identity and ignores unrelated or equal changes', () => {
		const { service, toolsService, getTool } = createService();
		const definitions = service.getToolDefinitions(session);
		const snapshots: { name: string; title: string | undefined }[][] = [];
		store.add(autorun(reader => snapshots.push(definitions.read(reader).map(tool => ({ name: tool.name, title: tool.title })))));
		const app = new TestApp([appTool('lookup', { title: 'First' })]);
		store.add(service.registerApp(session, app));
		const original = getTool('lookup');
		app.tools.set([appTool('lookup', {
			title: 'Updated', description: 'Updated description', inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
		})], undefined);
		const updated = getTool('lookup');
		store.add(service.registerApp(otherSession, new TestApp([appTool('other')])));
		const registrationsBeforeEqualChange = toolsService.registrationCount;
		app.tools.set([appTool('lookup', {
			title: 'Updated', description: 'Updated description', inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
		})], undefined);
		app.tools.set([], undefined);

		assert.deepStrictEqual({
			snapshots,
			stableId: updated.data.id === original.data.id,
			updated: { description: updated.data.modelDescription, schema: updated.data.inputSchema },
			equalChangeRegisteredAgain: toolsService.registrationCount !== registrationsBeforeEqualChange,
			remainingTools: service.getToolDefinitions(otherSession).get().map(tool => tool.name),
		}, {
			snapshots: [[], [{ name: 'lookup', title: 'First' }], [{ name: 'lookup', title: 'Updated' }], []],
			stableId: true,
			updated: { description: 'Updated description', schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
			equalChangeRegisteredAgain: false,
			remainingTools: ['other'],
		});
	});

	test('turns provider exceptions into explicit tool errors', async () => {
		const { service, getTool } = createService();
		store.add(service.registerApp(session, new TestApp([appTool('failure')], async () => {
			throw new Error('app disconnected');
		})));
		const result = await invoke(getTool('failure'), session);
		assert.deepStrictEqual(result, {
			content: [{ kind: 'text', value: 'MCP app tool "failure" failed: app disconnected' }],
			toolResultError: 'MCP app tool "failure" failed: app disconnected',
		});
	});

	test('propagates provider cancellation and cancels an asynchronous call promptly', async () => {
		const { service, getTool } = createService();
		const pending = new DeferredPromise<MCP.CallToolResult>();
		const app = new TestApp([appTool('pending')], async () => pending.p);
		store.add(service.registerApp(session, app));
		const source = store.add(new CancellationTokenSource());
		const tool = getTool('pending');
		const invocation = invoke(tool, session, {}, source.token);
		const cancelled = assert.rejects(invocation, isCancellationError);
		source.cancel();
		await cancelled;
		await pending.complete({ content: [] });
		await assert.rejects(() => invoke(tool, session, {}, source.token), isCancellationError);
		store.add(service.registerApp(session, new TestApp([appTool('cancelled')], async () => {
			throw new CancellationError();
		})));
		await assert.rejects(() => invoke(getTool('cancelled'), session), isCancellationError);

		assert.deepStrictEqual({ calls: app.calls.length, forwardedToken: app.calls[0].token === source.token }, { calls: 1, forwardedToken: true });
	});
});
