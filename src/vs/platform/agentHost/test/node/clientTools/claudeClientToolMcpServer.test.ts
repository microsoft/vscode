/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PendingRequestRegistry } from '../../../common/pendingRequestRegistry.js';
import type { ToolDefinition } from '../../../common/state/protocol/state.js';
import {
	buildClientToolMcpServer,
	CLAUDE_CLIENT_MCP_SERVER_NAME,
	extractToolUseId,
	hasClientToolNamePrefix,
	stripClientToolNamePrefix,
} from '../../../node/claude/clientTools/claudeClientToolMcpServer.js';
import type { IClaudeAgentSdkService } from '../../../node/claude/claudeAgentSdkService.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';

function tool(over: Partial<ToolDefinition> = {}): ToolDefinition {
	return {
		name: 'echo',
		description: 'echoes',
		inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
		...over,
	};
}

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

suite('claudeClientToolMcpServer / buildClientToolMcpServer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers all snapshot tools on the CLAUDE_CLIENT_MCP_SERVER_NAME server', async () => {
		const { sdk, recorded } = makeSdk();
		const registry = new PendingRequestRegistry<CallToolResult>();
		const server = await buildClientToolMcpServer([tool({ name: 'a' }), tool({ name: 'b' })], id => registry.register(id), sdk);
		assert.strictEqual(server.name, CLAUDE_CLIENT_MCP_SERVER_NAME);
		assert.deepStrictEqual(recorded.map(t => t.name), ['a', 'b']);
	});

	test('handler recovers toolUseId from extra._meta and parks on the registry until responded', async () => {
		const { sdk, recorded } = makeSdk();
		const registry = new PendingRequestRegistry<CallToolResult>();
		await buildClientToolMcpServer([tool()], id => registry.register(id), sdk);
		const handler = recorded[0]!.handler;
		const extra = { _meta: { 'claudecode/toolUseId': 'tu_42' } };
		const callPromise = handler({ msg: 'hi' }, extra);
		// The handler must not have resolved yet — it's parked on the registry.
		const sentinel = Symbol();
		const raced = await Promise.race([callPromise, Promise.resolve(sentinel)]);
		assert.strictEqual(raced, sentinel, 'handler should be parked');
		// Workbench echoes the completion via the same toolUseId key.
		const expected: CallToolResult = { content: [{ type: 'text', text: 'done' }] };
		const settled = registry.respond('tu_42', expected);
		assert.strictEqual(settled, true);
		assert.deepStrictEqual(await callPromise, expected);
	});

	test('handler returns an error result when SDK omits the tool_use_id meta field', async () => {
		const { sdk, recorded } = makeSdk();
		const registry = new PendingRequestRegistry<CallToolResult>();
		await buildClientToolMcpServer([tool()], id => registry.register(id), sdk);
		const handler = recorded[0]!.handler;
		const result = await handler({ msg: 'hi' }, { _meta: {} });
		assert.strictEqual(result.isError, true);
		assert.strictEqual(result.content.length, 1);
		assert.ok((result.content[0] as { type: string; text: string }).text.includes('tool_use_id'));
	});

	test('handler returns an error result when extra is not an object', async () => {
		const { sdk, recorded } = makeSdk();
		const registry = new PendingRequestRegistry<CallToolResult>();
		await buildClientToolMcpServer([tool()], id => registry.register(id), sdk);
		const handler = recorded[0]!.handler;
		const result = await handler({ msg: 'hi' }, undefined);
		assert.strictEqual(result.isError, true);
	});

	test('tools with missing description default to empty string (no crash)', async () => {
		const { sdk, recorded } = makeSdk();
		const registry = new PendingRequestRegistry<CallToolResult>();
		await buildClientToolMcpServer([tool({ description: undefined })], id => registry.register(id), sdk);
		assert.strictEqual(recorded.length, 1);
	});
});

suite('claudeClientToolMcpServer / extractToolUseId', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts the value at extra._meta["claudecode/toolUseId"]', () => {
		assert.strictEqual(extractToolUseId({ _meta: { 'claudecode/toolUseId': 'tu_1' } }), 'tu_1');
	});

	test('returns undefined when extra is null / missing _meta / wrong shape', () => {
		assert.strictEqual(extractToolUseId(null), undefined);
		assert.strictEqual(extractToolUseId(undefined), undefined);
		assert.strictEqual(extractToolUseId('not an object'), undefined);
		assert.strictEqual(extractToolUseId({}), undefined);
		assert.strictEqual(extractToolUseId({ _meta: null }), undefined);
		assert.strictEqual(extractToolUseId({ _meta: {} }), undefined);
		assert.strictEqual(extractToolUseId({ _meta: { 'claudecode/toolUseId': 42 } }), undefined);
	});
});

suite('claudeClientToolMcpServer / name prefix helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('hasClientToolNamePrefix detects mcp__client__ prefix only', () => {
		assert.strictEqual(hasClientToolNamePrefix('mcp__client__foo'), true);
		assert.strictEqual(hasClientToolNamePrefix('mcp__other__foo'), false);
		assert.strictEqual(hasClientToolNamePrefix('foo'), false);
		assert.strictEqual(hasClientToolNamePrefix(''), false);
	});

	test('stripClientToolNamePrefix strips only the mcp__client__ prefix', () => {
		assert.strictEqual(stripClientToolNamePrefix('mcp__client__foo'), 'foo');
		assert.strictEqual(stripClientToolNamePrefix('mcp__other__foo'), 'mcp__other__foo');
		assert.strictEqual(stripClientToolNamePrefix('foo'), 'foo');
	});
});
