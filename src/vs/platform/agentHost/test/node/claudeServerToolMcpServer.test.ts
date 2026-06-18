/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import type { ToolDefinition } from '../../common/state/sessionState.js';
import type { IClaudeAgentSdkService } from '../../node/claude/claudeAgentSdkService.js';
import {
	buildServerToolMcpServer,
	CLAUDE_SERVER_TOOL_MCP_SERVER_NAME,
	serverToolAllowList,
} from '../../node/claude/claudeServerToolMcpServer.js';

interface RecordedTool {
	name: string;
	handler: (args: Record<string, unknown>, extra: unknown) => Promise<CallToolResult>;
}

function makeSdk(): { sdk: IClaudeAgentSdkService; recorded: RecordedTool[] } {
	const recorded: RecordedTool[] = [];
	const sdk = {
		createSdkMcpServer: async (options: { name: string }) =>
			({ name: options.name, instance: { __fake: true } } as unknown as McpSdkServerConfigWithInstance),
		tool: async (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>, extra: unknown) => Promise<CallToolResult>) => {
			const t = { name, handler };
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
	readonly executions: Array<{ sessionUri: string; toolName: string; rawArgs: unknown }> = [];
	result = 'ok';
	error: Error | undefined;

	advertise(): void { }

	requiresConfirmation(_toolName: string): boolean { return false; }

	executeTool(sessionUri: string, toolName: string, rawArgs: unknown): string {
		this.executions.push({ sessionUri, toolName, rawArgs });
		if (this.error) {
			throw this.error;
		}
		return this.result;
	}
}

suite('claudeServerToolMcpServer / buildServerToolMcpServer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionUri = 'claude:/server-tool-session';

	test('registers every server tool on the server-tool MCP server', async () => {
		const { sdk, recorded } = makeSdk();
		const host = new FakeServerToolHost();
		const server = await buildServerToolMcpServer(host, sessionUri, sdk);
		assert.deepStrictEqual({
			serverName: server.name,
			toolNames: recorded.map(t => t.name).sort(),
		}, {
			serverName: CLAUDE_SERVER_TOOL_MCP_SERVER_NAME,
			toolNames: [...host.toolNames].sort(),
		});
	});

	test('handler executes in-process against the host and returns its text result', async () => {
		const { sdk, recorded } = makeSdk();
		const host = new FakeServerToolHost();
		host.result = 'listed 2 comments';
		await buildServerToolMcpServer(host, sessionUri, sdk);

		const handler = recorded.find(t => t.name === 'serverToolA')!.handler;
		const result = await handler({ foo: 'bar' }, undefined);

		assert.deepStrictEqual({
			executions: host.executions,
			result,
		}, {
			executions: [{ sessionUri, toolName: 'serverToolA', rawArgs: { foo: 'bar' } }],
			result: { content: [{ type: 'text', text: 'listed 2 comments' }] },
		});
	});

	test('handler surfaces host failures as an isError result', async () => {
		const { sdk, recorded } = makeSdk();
		const host = new FakeServerToolHost();
		host.error = new Error('boom');
		await buildServerToolMcpServer(host, sessionUri, sdk);

		const result = await recorded[0]!.handler({}, undefined);
		assert.deepStrictEqual(result, { content: [{ type: 'text', text: 'boom' }], isError: true });
	});

	test('serverToolAllowList prefixes the given tool names for the SDK', () => {
		assert.deepStrictEqual(
			serverToolAllowList(['serverToolA', 'serverToolB']),
			[`mcp__${CLAUDE_SERVER_TOOL_MCP_SERVER_NAME}__serverToolA`, `mcp__${CLAUDE_SERVER_TOOL_MCP_SERVER_NAME}__serverToolB`],
		);
	});
});
