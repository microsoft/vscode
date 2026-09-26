/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentHostMcpServersConfigKey } from '../../../../common/agentHostSchema.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { buildDefaultChatUri, CustomizationType, ROOT_STATE_URI, type McpServerCustomization, type RootState, type SessionState } from '../../../../common/state/sessionState.js';
import { McpServerStatus } from '../../../../common/state/protocol/state.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../../../common/state/sessionProtocol.js';
import { createRealSession, driveTurnToCompletion } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);

interface IToolResult {
	readonly content: readonly { readonly type: string; readonly text?: string }[];
	readonly isError?: boolean;
}

interface IResourceResult {
	readonly contents: readonly { readonly uri: string; readonly mimeType?: string; readonly text?: string; readonly blob?: string }[];
}

interface IMcpSession {
	readonly session: string;
	readonly channel: string;
	readonly calls: string;
	readonly server: McpServerCustomization;
}

export function defineMcpSideChannelTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider === 'claude') {
		return;
	}
	let clientSequence = 50_000;

	async function setRootServers(servers: unknown): Promise<void> {
		const clientSeq = clientSequence++;
		context.client.dispatch({
			channel: ROOT_STATE_URI, clientSeq,
			action: { type: ActionType.RootConfigChanged, config: { [AgentHostMcpServersConfigKey]: servers } },
		});
		const result = await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.RootConfigChanged)
			&& getActionEnvelope(notification).origin?.clientSeq === clientSeq,
		);
		assert.strictEqual(getActionEnvelope(result).rejectionReason, undefined);
	}

	async function serverState(session: string): Promise<McpServerCustomization | undefined> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: session });
		return (result.snapshot!.state as SessionState).customizations?.find((item): item is McpServerCustomization =>
			item.type === CustomizationType.McpServer && item.name === 'side_channel');
	}

	async function withServer(prefix: string, run: (session: IMcpSession) => Promise<void>): Promise<void> {
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-mcp-channel-'));
		context.tempDirs.push(workspace);
		const calls = join(workspace, 'calls.jsonl');
		writeFileSync(calls, '');
		const script = join(workspace, 'server.cjs');
		writeFileSync(script, [
			`const { appendFileSync } = require('fs');`,
			`const { Server } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/server/index.js'))});`,
			`const { StdioServerTransport } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js'))});`,
			`const { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema, McpError, ErrorCode } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/types.js'))});`,
			'const server = new Server({ name: "side-channel", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });',
			'server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{',
			' name: "echo", description: "Echoes structured input", inputSchema: { type: "object", properties: { tag: { type: "string" }, nested: { type: "object" } }, required: ["tag"] },',
			' _meta: { ui: { resourceUri: "ui://side-channel/view" } }, annotations: { readOnlyHint: true, openWorldHint: false }',
			'}] }));',
			'server.setRequestHandler(CallToolRequestSchema, async request => {',
			` appendFileSync(${JSON.stringify(calls)}, JSON.stringify(request.params) + "\\n");`,
			' if (request.params.arguments.tag === "error") { return { isError: true, content: [{ type: "text", text: "EXPECTED_TOOL_ERROR" }] }; }',
			' if (request.params.arguments.tag === "rpc-error") { throw new McpError(ErrorCode.InvalidParams, "EXPECTED_RPC_ERROR"); }',
			' return { content: [{ type: "text", text: JSON.stringify(request.params.arguments) }] };',
			'});',
			'server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: "ui://side-channel/view", name: "View", mimeType: "text/html;profile=mcp-app" }] }));',
			'server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [{ uriTemplate: "data://side-channel/{name}", name: "Data" }] }));',
			'server.setRequestHandler(ReadResourceRequestSchema, async request => {',
			' if (request.params.uri === "data://side-channel/missing") { throw new McpError(ErrorCode.InvalidParams, "EXPECTED_MISSING_RESOURCE"); }',
			' return { contents: [request.params.uri === "data://side-channel/binary"',
			' ? { uri: request.params.uri, mimeType: "application/octet-stream", blob: "AAEC//4=" }',
			' : { uri: request.params.uri, mimeType: "text/html;profile=mcp-app", text: "<html><body>SIDEBAND_RESOURCE</body></html>" }] };',
			'});',
			'server.connect(new StdioServerTransport());',
		].join('\n'));
		let previous: unknown;
		try {
			const session = await createRealSession(context.client, context.config, `mcp-channel-${prefix}-${context.config.provider}`, context.createdSessions, URI.file(workspace), async () => {
				const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
				previous = (root.snapshot!.state as RootState).config?.values[AgentHostMcpServersConfigKey] ?? {};
				await setRootServers({ side_channel: { type: 'stdio', command: process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' } } });
			});
			const response = await driveTurnToCompletion(context.client, session, 'mcp-channel-ready', 'Reply exactly "READY". Do not call tools.', 1);
			assert.strictEqual(response.responseText.trim(), 'READY');
			const server = await retry(async () => {
				const state = await serverState(session);
				assert.ok(state?.state.kind === McpServerStatus.Ready && state.channel, 'MCP server must expose a ready side channel');
				return state;
			}, 100, 200);
			assert.ok(server.channel);
			await run({ session, channel: server.channel, server, calls });
		} finally {
			if (previous !== undefined) {
				await setRootServers(previous);
			}
		}
	}

	function scenario(title: string, run: (session: IMcpSession) => Promise<void>): void {
		test(`MCP side channel: ${title}`, async function () {
			this.timeout(180_000);
			await withServer(title, run);
		});
	}

	scenario('lists the real server tool schema without another model request', async ({ channel, calls }) => {
		const before = context.observedModelRequestBodies.length;
		const result = await context.client.call<{ tools: readonly { name: string; inputSchema: object }[] }>('tools/list', { channel });
		assert.deepStrictEqual({
			tools: result.tools.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema })),
			modelRequests: context.observedModelRequestBodies.length - before,
			calls: readFileSync(calls, 'utf8'),
		}, {
			tools: [{ name: 'echo', inputSchema: { type: 'object', properties: { tag: { type: 'string' }, nested: { type: 'object' } }, required: ['tag'] } }],
			modelRequests: 0,
			calls: '',
		});
	});

	scenario('executes structured tool arguments and returns the actual server result', async ({ channel, calls }) => {
		const args = { tag: 'structured', nested: { count: 7, active: true, values: ['first', 'second'] } };
		const result = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: args });
		assert.deepStrictEqual({
			content: result.content, error: result.isError === true,
			received: JSON.parse(readFileSync(calls, 'utf8')).arguments,
		}, { content: [{ type: 'text', text: JSON.stringify(args) }], error: false, received: args });
	});

	scenario('isolates concurrent tool call responses', async ({ channel, calls }) => {
		const tags = ['one', 'two', 'three'];
		const results = await Promise.all(tags.map(tag => context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag } })));
		assert.deepStrictEqual({
			results: results.map(result => result.content),
			calls: readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line).arguments.tag).sort(),
		}, {
			results: tags.map(tag => [{ type: 'text', text: JSON.stringify({ tag }) }]),
			calls: [...tags].sort(),
		});
	});

	scenario('preserves tool errors without breaking the next call', async ({ channel }) => {
		const failed = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'error' } });
		const success = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'recovery' } });
		assert.deepStrictEqual({
			error: failed.isError, content: failed.content, recovered: success.content,
		}, { error: true, content: [{ type: 'text', text: 'EXPECTED_TOOL_ERROR' }], recovered: [{ type: 'text', text: '{"tag":"recovery"}' }] });
	});

	scenario('propagates server RPC errors without breaking the next call', async ({ channel }) => {
		await assert.rejects(context.client.call('tools/call', { channel, name: 'echo', arguments: { tag: 'rpc-error' } }), /EXPECTED_RPC_ERROR/);
		const result = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'healthy' } });
		assert.deepStrictEqual(result.content, [{ type: 'text', text: '{"tag":"healthy"}' }]);
	});

	scenario('rejects incomplete tool and resource requests without forwarding them to the server', async ({ channel, calls }) => {
		await assert.rejects(context.client.call('tools/call', { channel, arguments: { tag: 'never' } }), /missing 'name'/);
		await assert.rejects(context.client.call('resources/read', { channel }), /missing 'uri'/);
		assert.strictEqual(readFileSync(calls, 'utf8'), '');
		const result = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'valid' } });
		assert.deepStrictEqual(result.content, [{ type: 'text', text: '{"tag":"valid"}' }]);
	});

	scenario('allows a second initialized client to use the advertised channel', async ({ channel, calls }) => {
		const second = await context.connectClient();
		try {
			await second.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'mcp-channel-observer' });
			const result = await second.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'observer' } });
			assert.deepStrictEqual({
				content: result.content,
				received: JSON.parse(readFileSync(calls, 'utf8')).arguments,
			}, { content: [{ type: 'text', text: '{"tag":"observer"}' }], received: { tag: 'observer' } });
		} finally {
			second.close();
		}
	});

	if (context.config.provider === 'codex') {
		scenario('lists resources and templates from the provider inventory', async ({ channel }) => {
			const resources = await context.client.call<{ resources: readonly { uri: string; name: string }[] }>('resources/list', { channel });
			const templates = await context.client.call<{ resourceTemplates: readonly { uriTemplate: string; name: string }[] }>('resources/templates/list', { channel });
			assert.deepStrictEqual({
				resources: resources.resources.map(({ uri, name }) => ({ uri, name })),
				templates: templates.resourceTemplates.map(({ uriTemplate, name }) => ({ uriTemplate, name })),
			}, {
				resources: [{ uri: 'ui://side-channel/view', name: 'View' }],
				templates: [{ uriTemplate: 'data://side-channel/{name}', name: 'Data' }],
			});
		});
	}

	if (context.config.provider === 'copilotcli') {
		scenario('stopped servers can restart and serve the same application channel', async ({ session, server, channel }) => {
			context.client.dispatch({
				channel: session, clientSeq: clientSequence++,
				action: { type: ActionType.SessionMcpServerStopRequested, id: server.id },
			});
			await retry(async () => assert.strictEqual((await serverState(session))?.state.kind, McpServerStatus.Stopped), 100, 200);
			context.client.dispatch({
				channel: session, clientSeq: clientSequence++,
				action: { type: ActionType.SessionMcpServerStartRequested, id: server.id },
			});
			const restarted = await retry(async () => {
				const state = await serverState(session);
				assert.ok(state?.state.kind === McpServerStatus.Ready && state.channel);
				return state;
			}, 100, 200);
			assert.strictEqual(restarted.channel, channel);
			const result = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'restarted' } });
			assert.deepStrictEqual(result.content, [{ type: 'text', text: '{"tag":"restarted"}' }]);
		});
	}

	scenario('reads application HTML from the real MCP server', async ({ channel }) => {
		const result = await context.client.call<IResourceResult>('resources/read', { channel, uri: 'ui://side-channel/view' });
		assert.deepStrictEqual(result.contents.map(content => ({ uri: content.uri, mimeType: content.mimeType, text: content.text })), [
			{ uri: 'ui://side-channel/view', mimeType: 'text/html;profile=mcp-app', text: '<html><body>SIDEBAND_RESOURCE</body></html>' },
		]);
	});

	scenario('preserves binary resource bytes', async ({ channel }) => {
		const result = await context.client.call<IResourceResult>('resources/read', { channel, uri: 'data://side-channel/binary' });
		assert.deepStrictEqual(result.contents, [{ uri: 'data://side-channel/binary', mimeType: 'application/octet-stream', blob: 'AAEC//4=' }]);
	});

	scenario('reports a missing resource and permits a subsequent read', async ({ channel }) => {
		await assert.rejects(context.client.call('resources/read', { channel, uri: 'data://side-channel/missing' }), /EXPECTED_MISSING_RESOURCE/);
		const result = await context.client.call<IResourceResult>('resources/read', { channel, uri: 'ui://side-channel/view' });
		assert.strictEqual(result.contents[0].text, '<html><body>SIDEBAND_RESOURCE</body></html>');
	});

	scenario('rejects an unsupported method without closing the AHP connection', async ({ channel, session }) => {
		await assert.rejects(context.client.call('prompts/list', { channel }), error => error instanceof ProtocolError && error.code === JsonRpcErrorCodes.MethodNotFound);
		await context.client.call('ping', { channel: ROOT_STATE_URI });
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(session) });
		assert.ok(result.snapshot);
	});

	scenario('rejects a disposed session channel without closing the AHP connection', async ({ session, channel }) => {
		await context.client.call('disposeSession', { channel: session });
		context.createdSessions.splice(context.createdSessions.indexOf(session), 1);
		await assert.rejects(context.client.call('tools/list', { channel }), error => error instanceof ProtocolError && error.code === JsonRpcErrorCodes.MethodNotFound);
		await context.client.call('ping', { channel: ROOT_STATE_URI });
	});
}
