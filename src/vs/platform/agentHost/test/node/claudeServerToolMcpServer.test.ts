/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createRequire } from 'module';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { ArtifactServerToolName } from '../../common/serverToolNames.js';
import { readSessionArtifacts } from '../../common/sessionArtifacts.js';
import { buildChatUri, SessionStatus, type ToolDefinition } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { IAgentSdkDownloader } from '../../node/agentSdkDownloader.js';
import { AgentServerToolHost } from '../../node/shared/agentServerToolHost.js';
import { createArtifactServerToolGroup } from '../../node/shared/artifactServerTools.js';
import { ClaudeAgentSdkService, type IClaudeAgentSdkService, type IClaudeSdkBindings } from '../../node/claude/claudeAgentSdkService.js';
import {
	buildServerToolMcpServer,
	CLAUDE_SERVER_TOOL_MCP_SERVER_NAME,
	extractServerToolName,
	serverToolAllowList,
} from '../../node/claude/claudeServerToolMcpServer.js';

interface RecordedTool {
	name: string;
	handler: (args: Record<string, unknown>, extra: unknown) => Promise<CallToolResult>;
	options?: Parameters<IClaudeAgentSdkService['tool']>[4];
}

function makeSdk(): { sdk: IClaudeAgentSdkService; recorded: RecordedTool[] } {
	const recorded: RecordedTool[] = [];
	const sdk = {
		createSdkMcpServer: async (options: { name: string }) =>
			({ name: options.name, instance: { __fake: true } } as unknown as McpSdkServerConfigWithInstance),
		tool: async (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>, extra: unknown) => Promise<CallToolResult>, options?: Parameters<IClaudeAgentSdkService['tool']>[4]) => {
			const t = { name, handler, options };
			recorded.push(t);
			return t as unknown as ReturnType<IClaudeAgentSdkService['tool']>;
		},
	} as unknown as IClaudeAgentSdkService;
	return { sdk, recorded };
}

const fakeToolDefinitions: readonly ToolDefinition[] = [
	{ name: 'serverToolA', description: 'A', inputSchema: { type: 'object', properties: {} } },
	{ name: 'serverToolB', description: 'B', inputSchema: { type: 'object', properties: {} } },
];

class FakeServerToolHost implements IAgentServerToolHost {
	readonly definitions: readonly ToolDefinition[] = fakeToolDefinitions;
	readonly toolNames: readonly string[] = fakeToolDefinitions.map(def => def.name);
	readonly executions: Array<{ chatUri: string; toolName: string; rawArgs: unknown }> = [];
	result = 'ok';
	error: Error | undefined;

	advertise(): void { }

	getDefinitionsForSession(): readonly ToolDefinition[] { return this.definitions; }

	canRequireConfirmation(_toolName: string): boolean { return false; }

	requiresConfirmation(_sessionUri: string, _toolName: string): boolean { return false; }

	executeTool(chatUri: string, toolName: string, rawArgs: unknown): string {
		this.executions.push({ chatUri, toolName, rawArgs });
		if (this.error) {
			throw this.error;
		}
		return this.result;
	}
}

suite('claudeServerToolMcpServer / buildServerToolMcpServer', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const chatUri = buildChatUri('claude:/server-tool-session', 'peer');

	test('registers every server tool on the server-tool MCP server', async () => {
		const { sdk, recorded } = makeSdk();
		const host = new FakeServerToolHost();
		const server = await buildServerToolMcpServer(host, chatUri, sdk);
		assert.deepStrictEqual({
			serverName: server.name,
			toolNames: recorded.map(t => t.name).sort(),
		}, {
			serverName: CLAUDE_SERVER_TOOL_MCP_SERVER_NAME,
			toolNames: [...host.toolNames].sort(),
		});
	});

	test('honors per-tool deferral without changing unrelated tools', async () => {
		const { sdk, recorded } = makeSdk();
		const group = createArtifactServerToolGroup({ isEnabled: () => true, persist: () => { } });
		await buildServerToolMcpServer(new FakeServerToolHost(), chatUri, sdk, [...group.definitions, fakeToolDefinitions[0]]);
		assert.deepStrictEqual(recorded.map(tool => ({ name: tool.name, options: tool.options })), [
			{ name: ArtifactServerToolName.AddArtifactOrReference, options: { alwaysLoad: true } },
			{ name: ArtifactServerToolName.RemoveArtifactOrReference, options: { alwaysLoad: false } },
			{ name: ArtifactServerToolName.ListArtifactsAndReferences, options: { alwaysLoad: false } },
			{ name: 'serverToolA', options: undefined },
		]);
	});

	// The native SDK requires SharedArrayBuffer, unavailable in the Electron renderer test runner.
	(typeof SharedArrayBuffer === 'undefined' ? test.skip : test)('exposes native artifact discovery metadata and executes the tools through MCP', async function () {
		this.timeout(30_000);
		const nodeRequire = createRequire(import.meta.url);
		const bindings: IClaudeSdkBindings = nodeRequire('@anthropic-ai/claude-agent-sdk');
		const { Client }: typeof import('@modelcontextprotocol/sdk/client/index.js') = nodeRequire('@modelcontextprotocol/sdk/client/index.js');
		const { InMemoryTransport }: typeof import('@modelcontextprotocol/sdk/inMemory.js') = nodeRequire('@modelcontextprotocol/sdk/inMemory.js');
		class LocalSdkService extends ClaudeAgentSdkService {
			protected override async _loadSdk(): Promise<IClaudeSdkBindings> {
				return bindings;
			}
		}
		const sdk = new LocalSdkService(new NullLogService(), new class extends mock<IAgentSdkDownloader>() { }());
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const sessionUri = 'claude:/server-tool-session';
		stateManager.createSession({
			resource: sessionUri,
			provider: 'claude',
			title: 'Artifacts',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		let enabled = true;
		const host = new AgentServerToolHost(stateManager, [createArtifactServerToolGroup({
			isEnabled: () => enabled,
			persist: () => { },
		})]);
		const server = await buildServerToolMcpServer(host, chatUri, sdk, [...host.definitions, fakeToolDefinitions[0]]);
		const client = new Client({ name: 'artifact-tools-test', version: '1.0.0' });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		try {
			await server.instance.connect(serverTransport);
			await client.connect(clientTransport);
			const { tools } = await client.listTools();
			const added = await client.callTool({
				name: ArtifactServerToolName.AddArtifactOrReference,
				arguments: { items: [{ type: 'file', label: 'Report', isArtifact: true, uri: 'file:///repo/report.md' }] },
			});
			const id = readSessionArtifacts(stateManager.getSessionState(sessionUri)?._meta)[0].id;
			const listed = await client.callTool({ name: ArtifactServerToolName.ListArtifactsAndReferences, arguments: {} });
			const removed = await client.callTool({ name: ArtifactServerToolName.RemoveArtifactOrReference, arguments: { id } });
			enabled = false;
			const disabled = await client.callTool({ name: ArtifactServerToolName.ListArtifactsAndReferences, arguments: {} });

			assert.deepStrictEqual({
				discovery: tools.map(tool => ({ name: tool.name, alwaysLoad: tool._meta?.['anthropic/alwaysLoad'] === true })),
				added: added.content,
				listed: listed.content,
				removed: removed.content,
				remaining: readSessionArtifacts(stateManager.getSessionState(sessionUri)?._meta),
				disabled: { isError: disabled.isError, content: disabled.content },
			}, {
				discovery: [
					{ name: ArtifactServerToolName.AddArtifactOrReference, alwaysLoad: true },
					{ name: ArtifactServerToolName.RemoveArtifactOrReference, alwaysLoad: false },
					{ name: ArtifactServerToolName.ListArtifactsAndReferences, alwaysLoad: false },
					{ name: 'serverToolA', alwaysLoad: false },
				],
				added: [{ type: 'text', text: `Added artifact: ${id}` }],
				listed: [{ type: 'text', text: `${id} (file, artifact) Report \u2014 file:///repo/report.md` }],
				removed: [{ type: 'text', text: `Removed artifact: ${id}` }],
				remaining: [],
				disabled: { isError: true, content: [{ type: 'text', text: `Server tool "${ArtifactServerToolName.ListArtifactsAndReferences}" is disabled.` }] },
			});
		} finally {
			await client.close();
			await server.instance.close();
		}
	});

	test('handler executes in-process against the host and returns its text result', async () => {
		const { sdk, recorded } = makeSdk();
		const host = new FakeServerToolHost();
		host.result = 'listed 2 comments';
		await buildServerToolMcpServer(host, chatUri, sdk);

		const handler = recorded.find(t => t.name === 'serverToolA')!.handler;
		const result = await handler({ foo: 'bar' }, undefined);

		assert.deepStrictEqual({
			executions: host.executions,
			result,
		}, {
			executions: [{ chatUri, toolName: 'serverToolA', rawArgs: { foo: 'bar' } }],
			result: { content: [{ type: 'text', text: 'listed 2 comments' }] },
		});
	});

	test('handler surfaces host failures as an isError result', async () => {
		const { sdk, recorded } = makeSdk();
		const host = new FakeServerToolHost();
		host.error = new Error('boom');
		await buildServerToolMcpServer(host, chatUri, sdk);

		const result = await recorded[0]!.handler({}, undefined);
		assert.deepStrictEqual(result, { content: [{ type: 'text', text: 'boom' }], isError: true });
	});

	test('serverToolAllowList prefixes the given tool names for the SDK', () => {
		assert.deepStrictEqual(
			serverToolAllowList(['serverToolA', 'serverToolB']),
			[`mcp__${CLAUDE_SERVER_TOOL_MCP_SERVER_NAME}__serverToolA`, `mcp__${CLAUDE_SERVER_TOOL_MCP_SERVER_NAME}__serverToolB`],
		);
	});

	test('extractServerToolName returns only host MCP tool names', () => {
		assert.deepStrictEqual({
			hostTool: extractServerToolName(`mcp__${CLAUDE_SERVER_TOOL_MCP_SERVER_NAME}__serverToolA`),
			otherMcpTool: extractServerToolName('mcp__other__serverToolA'),
			bareTool: extractServerToolName('serverToolA'),
		}, {
			hostTool: 'serverToolA',
			otherMcpTool: undefined,
			bareTool: undefined,
		});
	});
});
