/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import type { CallToolResult as IToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
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
import { assertExpectedFailure } from '../harness/expectedFailure.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);
const { CallToolResultSchema }: Pick<typeof import('@modelcontextprotocol/sdk/types.js'), 'CallToolResultSchema'> = nodeRequire('@modelcontextprotocol/sdk/types.js');

interface IResourceResult {
	readonly contents: readonly { readonly uri: string; readonly mimeType?: string; readonly text?: string; readonly blob?: string }[];
}

interface IMcpRequest {
	readonly name?: string;
	readonly arguments?: object;
	readonly uri?: string;
}

interface ICatalogListing extends ListToolsResult {
	readonly revision: number;
}

interface IMcpSession {
	readonly session: string;
	readonly channel: string;
	readonly calls: string;
	readonly reads: string;
	readonly listings: string;
	readonly server: McpServerCustomization;
}

const structuredToolResult: IToolResult = {
	content: [{ type: 'text', text: 'STRUCTURED_RESULT' }],
	structuredContent: { total: 12, rows: [{ enabled: false, value: 0 }, { enabled: true, value: null }], labels: ['first', 'second'] },
	_meta: { 'side-channel/view': { selected: 'second', hidden: true } },
};

const mixedToolResult: IToolResult = {
	content: [
		{ type: 'text', text: 'MIXED_RESULT', annotations: { audience: ['user'], priority: 0.5 } },
		{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=' },
		{ type: 'resource', resource: { uri: 'data://side-channel/embedded/text', mimeType: 'text/plain', text: 'EMBEDDED_TEXT' } },
		{ type: 'resource', resource: { uri: 'data://side-channel/embedded/blob', mimeType: 'application/octet-stream', blob: 'AAEC//4=' } },
	],
};

const linkedToolResult: IToolResult = {
	content: [
		{ type: 'text', text: 'Read the linked report' },
		{ type: 'resource_link', uri: 'data://side-channel/report', name: 'Report', mimeType: 'application/json', description: 'The calculated report' },
	],
};

const mixedResourceResult: IResourceResult = {
	contents: [
		{ uri: 'data://side-channel/mixed/text', mimeType: 'text/plain', text: 'FIRST_RESOURCE' },
		{ uri: 'data://side-channel/mixed/blob', mimeType: 'application/octet-stream', blob: 'AAEC//4=' },
		{ uri: 'data://side-channel/mixed/json', mimeType: 'application/json', text: '{"last":true}' },
	],
};

const echoTool: ListToolsResult['tools'][number] = {
	name: 'echo',
	description: 'Echoes structured input',
	inputSchema: { type: 'object', properties: { tag: { type: 'string' }, nested: { type: 'object' } }, required: ['tag'] },
	_meta: { ui: { resourceUri: 'ui://side-channel/view' } },
	annotations: { readOnlyHint: true, openWorldHint: false },
};

const sumTool: ListToolsResult['tools'][number] = {
	name: 'sum',
	description: 'Adds integer values',
	inputSchema: { type: 'object', properties: { values: { type: 'array', items: { type: 'integer' } } }, required: ['values'] },
	outputSchema: { type: 'object', properties: { total: { type: 'integer' } }, required: ['total'] },
	annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
	_meta: { ui: { resourceUri: 'ui://side-channel/view' } },
};

const refreshedInputSchema: ListToolsResult['tools'][number]['inputSchema'] = {
	type: 'object',
	properties: { tag: { type: 'string' }, nested: { $ref: '#/$defs/details' } },
	required: ['tag', 'nested'],
	$defs: {
		details: {
			type: 'object',
			properties: { count: { type: 'integer', minimum: 0 }, labels: { type: 'array', items: { type: 'string' } } },
			required: ['count'],
		},
	},
};

const refreshedOutputSchema: ListToolsResult['tools'][number]['outputSchema'] = {
	type: 'object', properties: { tag: { type: 'string' }, nested: { type: 'object' } }, required: ['tag', 'nested'],
};

function readJsonLines<T>(path: string): T[] {
	return readFileSync(path, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line));
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
		const reads = join(workspace, 'reads.jsonl');
		const listings = join(workspace, 'listings.jsonl');
		writeFileSync(calls, '');
		writeFileSync(reads, '');
		writeFileSync(listings, '');
		const script = join(workspace, 'server.cjs');
		writeFileSync(script, [
			`const { appendFileSync } = require('fs');`,
			`const { Server } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/server/index.js'))});`,
			`const { StdioServerTransport } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js'))});`,
			`const { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema, McpError, ErrorCode } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/types.js'))});`,
			'const server = new Server({ name: "side-channel", version: "1.0.0" }, { capabilities: { tools: { listChanged: true }, resources: {} } });',
			`const echoTool = ${JSON.stringify(echoTool)};`,
			'let tools = [echoTool];',
			'let revision = 0;',
			'let transientReads = 0;',
			'server.setRequestHandler(ListToolsRequestSchema, async () => {',
			` appendFileSync(${JSON.stringify(listings)}, JSON.stringify({ revision, tools }) + "\\n");`,
			' return { tools };',
			'});',
			'server.setRequestHandler(CallToolRequestSchema, async request => {',
			` appendFileSync(${JSON.stringify(calls)}, JSON.stringify(request.params) + "\\n");`,
			' if (request.params.name === "sum") {',
			'  const total = request.params.arguments.values.reduce((sum, value) => sum + value, 0);',
			'  return { content: [{ type: "text", text: String(total) }], structuredContent: { total } };',
			' }',
			' const tag = request.params.arguments.tag;',
			' if (tag === "catalog-add" || tag === "catalog-remove" || tag === "catalog-schema") {',
			`  if (tag === "catalog-add") { tools = [echoTool, ${JSON.stringify(sumTool)}]; }`,
			'  if (tag === "catalog-remove") { tools = [echoTool]; }',
			`  if (tag === "catalog-schema") { echoTool.inputSchema = ${JSON.stringify(refreshedInputSchema)}; echoTool.outputSchema = ${JSON.stringify(refreshedOutputSchema)}; }`,
			'  revision++;',
			'  await server.sendToolListChanged();',
			'  return { content: [{ type: "text", text: JSON.stringify({ revision }) }] };',
			' }',
			` if (tag === "structured-result") { return ${JSON.stringify(structuredToolResult)}; }`,
			` if (tag === "mixed-result") { return ${JSON.stringify(mixedToolResult)}; }`,
			` if (tag === "resource-link") { return ${JSON.stringify(linkedToolResult)}; }`,
			' if (tag === "empty-result") { return { content: [], isError: false }; }',
			' if (request.params.arguments.tag === "error") { return { isError: true, content: [{ type: "text", text: "EXPECTED_TOOL_ERROR" }] }; }',
			' if (request.params.arguments.tag === "rpc-error") { throw new McpError(ErrorCode.InvalidParams, "EXPECTED_RPC_ERROR"); }',
			' if (echoTool.outputSchema) { return { content: [{ type: "text", text: JSON.stringify(request.params.arguments) }], structuredContent: request.params.arguments }; }',
			' return { content: [{ type: "text", text: JSON.stringify(request.params.arguments) }] };',
			'});',
			'server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: "ui://side-channel/view", name: "View", mimeType: "text/html;profile=mcp-app" }] }));',
			'server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [{ uriTemplate: "data://side-channel/{name}", name: "Data" }] }));',
			'server.setRequestHandler(ReadResourceRequestSchema, async request => {',
			` appendFileSync(${JSON.stringify(reads)}, JSON.stringify(request.params) + "\\n");`,
			' if (request.params.uri === "data://side-channel/missing") { throw new McpError(ErrorCode.InvalidParams, "EXPECTED_MISSING_RESOURCE"); }',
			` if (request.params.uri === "data://side-channel/mixed") { return ${JSON.stringify(mixedResourceResult)}; }`,
			' if (request.params.uri === "data://side-channel/report") { return { contents: [{ uri: request.params.uri, mimeType: "application/json", text: \'{"total":12}\' }] }; }',
			' if (request.params.uri === "data://side-channel/transient") {',
			'  if (++transientReads === 1) { throw new McpError(ErrorCode.InternalError, "EXPECTED_TRANSIENT_RESOURCE_ERROR"); }',
			'  return { contents: [{ uri: request.params.uri, mimeType: "text/plain", text: "RECOVERED_RESOURCE" }] };',
			' }',
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
			await run({ session, channel: server.channel, server, calls, reads, listings });
		} finally {
			if (previous !== undefined) {
				await setRootServers(previous);
			}
		}
	}

	function scenario(title: string, run: (session: IMcpSession) => Promise<void>, enabled = true): void {
		(enabled ? test : test.skip)(`MCP side channel: ${title}`, async function () {
			this.timeout(180_000);
			await withServer(title, run);
		});
	}

	function regressionScenario(title: string, run: (session: IMcpSession) => Promise<void>, enabled = true): void {
		scenario(`regression coverage: ${title}`, async session => {
			const before = context.observedModelRequestBodies.length;
			await run(session);
			assert.strictEqual(context.observedModelRequestBodies.length, before, 'Side-channel operations must not request another model turn');
		}, enabled);
	}

	async function changeCatalog(channel: string, tag: string, expectedTools: ListToolsResult['tools']): Promise<{ changed: IToolResult; catalog: ListToolsResult }> {
		const changed = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag } });
		// Native list changes do not guarantee an AHP push; tools/list reads the live server.
		const catalog = await retry(async () => {
			const result = await context.client.call<ListToolsResult>('tools/list', { channel });
			assert.deepStrictEqual(result.tools, expectedTools);
			return result;
		}, 100, 50);
		return { changed, catalog };
	}

	regressionScenario('preserves structured tool results and private result metadata', async ({ channel, calls }) => {
		const result = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'structured-result' } });
		assert.deepStrictEqual({
			content: result.content, structuredContent: result.structuredContent, meta: result._meta, error: result.isError === true,
			calls: readJsonLines<IMcpRequest>(calls).map(({ name, arguments: args }) => ({ name, arguments: args })),
		}, {
			content: structuredToolResult.content, structuredContent: structuredToolResult.structuredContent, meta: structuredToolResult._meta, error: false,
			calls: [{ name: 'echo', arguments: { tag: 'structured-result' } }],
		});
	});

	// Skip Codex recording so the known decoding failure cannot replace its complete fixture.
	regressionScenario('preserves ordered text image and embedded resource tool content', async ({ channel, calls }) => {
		CallToolResultSchema.parse(mixedToolResult);
		const [outcome] = await Promise.allSettled([
			context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'mixed-result' } }),
		]);
		assert.deepStrictEqual(
			readJsonLines<IMcpRequest>(calls).map(({ name, arguments: args }) => ({ name, arguments: args })),
			[{ name: 'echo', arguments: { tag: 'mixed-result' } }],
		);
		const assertResult = () => {
			if (outcome.status === 'rejected') {
				throw outcome.reason;
			}
			assert.deepStrictEqual({
				content: outcome.value.content, error: outcome.value.isError === true,
			}, { content: mixedToolResult.content, error: false });
		};
		if (context.config.provider === 'codex') {
			await assertExpectedFailure(
				'Codex MCP side-channel mixed-content response decoding',
				// AHP includes the remote stack in error.message; permit only stack-frame suffixes.
				/^JsonRpcError: tool call failed for `side_channel\/echo`: Unexpected response type(?:\r?\n[ \t]+at [^\r\n]+)*$/,
				assertResult,
			);
		} else {
			assertResult();
		}
	}, context.config.provider !== 'codex' || !(process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1'));

	regressionScenario('returns resource links that can be read on the same advertised channel', async ({ channel, calls, reads }) => {
		const result = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'resource-link' } });
		const link = result.content.find(content => content.type === 'resource_link');
		assert.ok(link?.type === 'resource_link', 'The actual tool result must contain a resource link');
		const resource = await context.client.call<IResourceResult>('resources/read', { channel, uri: link.uri });
		assert.deepStrictEqual({
			content: result.content, resource: resource.contents,
			calls: readJsonLines<IMcpRequest>(calls).map(request => request.arguments),
			reads: readJsonLines<IMcpRequest>(reads).map(request => request.uri),
		}, {
			content: linkedToolResult.content,
			resource: [{ uri: 'data://side-channel/report', mimeType: 'application/json', text: '{"total":12}' }],
			calls: [{ tag: 'resource-link' }], reads: ['data://side-channel/report'],
		});
	});

	regressionScenario('preserves multiple resource contents with distinct URIs and encodings', async ({ channel, reads }) => {
		const uri = 'data://side-channel/mixed';
		const result = await context.client.call<IResourceResult>('resources/read', { channel, uri });
		assert.deepStrictEqual({
			contents: result.contents, reads: readJsonLines<IMcpRequest>(reads).map(request => request.uri),
		}, { contents: mixedResourceResult.contents, reads: [uri] });
	});

	regressionScenario('returns an empty successful tool result without fabricating text', async ({ channel, calls }) => {
		const result = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'empty-result' } });
		assert.deepStrictEqual({
			content: result.content, error: result.isError === true,
			calls: readJsonLines<IMcpRequest>(calls).map(request => request.arguments),
		}, { content: [], error: false, calls: [{ tag: 'empty-result' }] });
	});

	regressionScenario('isolates a concurrent server error from successful tool and resource responses', async ({ channel, calls, reads }) => {
		const [failed, tool, resource] = await Promise.allSettled([
			context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'rpc-error' } }),
			context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'concurrent-healthy' } }),
			context.client.call<IResourceResult>('resources/read', { channel, uri: 'data://side-channel/binary' }),
		]);
		assert.ok(failed.status === 'rejected' && failed.reason instanceof Error && /EXPECTED_RPC_ERROR/.test(failed.reason.message));
		assert.ok(tool.status === 'fulfilled' && resource.status === 'fulfilled', 'Independent successful MCP requests must resolve');
		const recovered = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'after-concurrent-error' } });
		assert.deepStrictEqual({
			tool: tool.value.content, resource: resource.value.contents, recovered: recovered.content,
			calls: readJsonLines<{ arguments: { tag: string } }>(calls).map(request => request.arguments.tag).sort(),
			reads: readJsonLines<IMcpRequest>(reads).map(request => request.uri),
		}, {
			tool: [{ type: 'text', text: '{"tag":"concurrent-healthy"}' }],
			resource: [{ uri: 'data://side-channel/binary', mimeType: 'application/octet-stream', blob: 'AAEC//4=' }],
			recovered: [{ type: 'text', text: '{"tag":"after-concurrent-error"}' }],
			calls: ['after-concurrent-error', 'concurrent-healthy', 'rpc-error'],
			reads: ['data://side-channel/binary'],
		});
	});

	regressionScenario('retries the same resource after a transient real server error', async ({ channel, reads }) => {
		const uri = 'data://side-channel/transient';
		await assert.rejects(context.client.call('resources/read', { channel, uri }), /EXPECTED_TRANSIENT_RESOURCE_ERROR/);
		const result = await context.client.call<IResourceResult>('resources/read', { channel, uri });
		assert.deepStrictEqual({
			contents: result.contents, reads: readJsonLines<IMcpRequest>(reads).map(request => request.uri),
		}, {
			contents: [{ uri, mimeType: 'text/plain', text: 'RECOVERED_RESOURCE' }], reads: [uri, uri],
		});
	});

	if (context.config.provider === 'copilotcli') {
		regressionScenario('refreshes the tool catalog after a real server adds a callable tool', async ({ channel, calls, listings }) => {
			const { changed, catalog } = await changeCatalog(channel, 'catalog-add', [echoTool, sumTool]);
			const result = await context.client.call<IToolResult>('tools/call', { channel, name: 'sum', arguments: { values: [3, 4, 5] } });
			assert.deepStrictEqual({
				changed: changed.content, names: catalog.tools.map(tool => tool.name), added: catalog.tools.find(tool => tool.name === 'sum'),
				content: result.content, structuredContent: result.structuredContent,
				calls: readJsonLines<IMcpRequest>(calls).map(({ name, arguments: args }) => ({ name, arguments: args })),
				listedNewCatalog: readJsonLines<ICatalogListing>(listings).some(listing => listing.revision === 1 && listing.tools.some(tool => tool.name === 'sum')),
			}, {
				changed: [{ type: 'text', text: '{"revision":1}' }], names: ['echo', 'sum'], added: sumTool,
				content: [{ type: 'text', text: '12' }], structuredContent: { total: 12 },
				calls: [{ name: 'echo', arguments: { tag: 'catalog-add' } }, { name: 'sum', arguments: { values: [3, 4, 5] } }],
				listedNewCatalog: true,
			});
		});

		regressionScenario('refreshes schemas for an existing tool without a name change', async ({ channel, calls, listings }) => {
			const { changed, catalog } = await changeCatalog(channel, 'catalog-schema', [
				{ ...echoTool, inputSchema: refreshedInputSchema, outputSchema: refreshedOutputSchema },
			]);
			const args = { tag: 'schema-result', nested: { count: 2, labels: ['new', 'schema'] } };
			const result = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: args });
			assert.deepStrictEqual({
				changed: changed.content,
				tools: catalog.tools.map(({ name, inputSchema, outputSchema }) => ({ name, inputSchema, outputSchema })),
				content: result.content, structuredContent: result.structuredContent,
				calls: readJsonLines<IMcpRequest>(calls).map(request => request.arguments),
				listedNewSchema: readJsonLines<ICatalogListing>(listings).some(listing => listing.revision === 1 && listing.tools[0]?.outputSchema !== undefined),
			}, {
				changed: [{ type: 'text', text: '{"revision":1}' }],
				tools: [{ name: 'echo', inputSchema: refreshedInputSchema, outputSchema: refreshedOutputSchema }],
				content: [{ type: 'text', text: JSON.stringify(args) }], structuredContent: args,
				calls: [{ tag: 'catalog-schema' }, args], listedNewSchema: true,
			});
		});

		regressionScenario('removes a tool from a refreshed catalog while retaining healthy calls', async ({ channel, calls, listings }) => {
			const { catalog: added } = await changeCatalog(channel, 'catalog-add', [echoTool, sumTool]);
			const { changed, catalog: removed } = await changeCatalog(channel, 'catalog-remove', [echoTool]);
			const result = await context.client.call<IToolResult>('tools/call', { channel, name: 'echo', arguments: { tag: 'after-removal' } });
			assert.deepStrictEqual({
				added: added.tools.map(tool => tool.name), removed: removed.tools.map(tool => tool.name), changed: changed.content,
				content: result.content, calls: readJsonLines<IMcpRequest>(calls).map(request => request.arguments),
				listedRemovedCatalog: readJsonLines<ICatalogListing>(listings).some(listing => listing.revision === 2 && listing.tools.length === 1 && listing.tools[0].name === 'echo'),
			}, {
				added: ['echo', 'sum'], removed: ['echo'], changed: [{ type: 'text', text: '{"revision":2}' }],
				content: [{ type: 'text', text: '{"tag":"after-removal"}' }],
				calls: [{ tag: 'catalog-add' }, { tag: 'catalog-remove' }, { tag: 'after-removal' }], listedRemovedCatalog: true,
			});
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
