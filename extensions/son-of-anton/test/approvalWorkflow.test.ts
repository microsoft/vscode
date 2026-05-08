/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import {
	BUILTIN_TOOLS,
	READ_FILE_TOOL,
	LIST_DIRECTORY_TOOL,
	SEARCH_WORKSPACE_TOOL,
	WRITE_FILE_TOOL,
	RUN_COMMAND_TOOL,
} from 'son-of-anton-core/tools/builtin';
import { ToolRegistry } from 'son-of-anton-core/tools/registry';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from 'son-of-anton-core/tools/types';

// ── Approval-gate helper ──────────────────────────────────────────────────────
//
// Mirrors the decision tree inside ChatPanel.ts so the gating logic can be
// exercised in isolation. The real chat session combines this with webview
// messaging; here we substitute callbacks so we can assert on the routing
// without standing up a webview.

interface GateOptions {
	autoApprove?: boolean;
	decision?: 'approve' | 'reject' | 'cancel';
	reason?: string;
}

interface GateResult {
	requestPosted: boolean;
	autoApprovedFlag: boolean;
	executed: boolean;
	result: ToolExecutionResult;
}

async function runGatedToolCall(
	registry: ToolRegistry,
	toolName: string,
	input: Record<string, unknown>,
	ctx: ToolExecutionContext,
	opts: GateOptions = {},
): Promise<GateResult> {
	const tool = registry.get(toolName);
	const requiresApproval = tool?.definition.riskLevel === 'requiresApproval';
	const autoApprove = opts.autoApprove === true;

	let requestPosted = false;
	let autoApprovedFlag = false;
	let executed = false;
	let result: ToolExecutionResult;

	if (requiresApproval) {
		requestPosted = true;
		autoApprovedFlag = autoApprove;
		const decision: 'approve' | 'reject' | 'cancel' = autoApprove ? 'approve' : (opts.decision ?? 'approve');

		if (decision === 'approve') {
			executed = true;
			result = await registry.execute(toolName, input, ctx);
		} else if (decision === 'reject') {
			const reason = opts.reason && opts.reason.length > 0 ? `: ${opts.reason}` : '.';
			result = { content: `Tool call rejected by user${reason}`, isError: true };
		} else {
			result = { content: 'Tool call cancelled.', isError: true };
		}
	} else {
		executed = true;
		result = await registry.execute(toolName, input, ctx);
	}

	return { requestPosted, autoApprovedFlag, executed, result };
}

// ── Stub execution context ────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
	return {
		workspaceRoot: '/tmp/fake-workspace',
		readFile: async () => 'file-body',
		readDir: async () => [],
		searchTextInWorkspace: async () => [],
		writeFile: async () => ({ written: true }),
		runCommand: async () => ({ ran: true, stdout: 'done', stderr: '', exitCode: 0, timedOut: false }),
		...overrides,
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('Approval workflow — Phase 41', () => {
	test('riskLevel is set on write_file and run_command, omitted on safe tools', () => {
		assert.deepStrictEqual(
			{
				read_file: READ_FILE_TOOL.definition.riskLevel,
				list_directory: LIST_DIRECTORY_TOOL.definition.riskLevel,
				search_workspace: SEARCH_WORKSPACE_TOOL.definition.riskLevel,
				write_file: WRITE_FILE_TOOL.definition.riskLevel,
				run_command: RUN_COMMAND_TOOL.definition.riskLevel,
			},
			{
				read_file: undefined,
				list_directory: undefined,
				search_workspace: undefined,
				write_file: 'requiresApproval',
				run_command: 'requiresApproval',
			},
		);
	});

	test('safe tools bypass the approval gate and execute directly', async () => {
		const registry = new ToolRegistry(BUILTIN_TOOLS);
		const outcome = await runGatedToolCall(
			registry,
			'read_file',
			{ path: 'README.md' },
			makeCtx({ readFile: async () => 'hello' }),
		);
		assert.deepStrictEqual(
			{
				requestPosted: outcome.requestPosted,
				executed: outcome.executed,
				content: outcome.result.content,
				isError: outcome.result.isError,
			},
			{ requestPosted: false, executed: true, content: 'hello', isError: undefined },
		);
	});

	test('write_file approved → executes the tool and returns the success payload', async () => {
		const writes: Array<{ path: string; content: string }> = [];
		const registry = new ToolRegistry(BUILTIN_TOOLS);
		const outcome = await runGatedToolCall(
			registry,
			'write_file',
			{ path: 'src/new.ts', content: 'export {}\n' },
			makeCtx({
				writeFile: async (relPath, content) => {
					writes.push({ path: relPath, content });
					return { written: true };
				},
			}),
			{ decision: 'approve' },
		);
		assert.deepStrictEqual(
			{
				requestPosted: outcome.requestPosted,
				executed: outcome.executed,
				isError: outcome.result.isError,
				writeCount: writes.length,
				writePath: writes[0]?.path,
			},
			{ requestPosted: true, executed: true, isError: undefined, writeCount: 1, writePath: 'src/new.ts' },
		);
	});

	test('write_file rejected → returns error result without invoking the tool', async () => {
		let writeCalls = 0;
		const registry = new ToolRegistry(BUILTIN_TOOLS);
		const outcome = await runGatedToolCall(
			registry,
			'write_file',
			{ path: 'src/danger.ts', content: 'rm -rf /' },
			makeCtx({
				writeFile: async () => {
					writeCalls += 1;
					return { written: true };
				},
			}),
			{ decision: 'reject', reason: 'looks suspicious' },
		);
		assert.deepStrictEqual(
			{
				requestPosted: outcome.requestPosted,
				executed: outcome.executed,
				isError: outcome.result.isError,
				content: outcome.result.content,
				writeCalls,
			},
			{
				requestPosted: true,
				executed: false,
				isError: true,
				content: 'Tool call rejected by user: looks suspicious',
				writeCalls: 0,
			},
		);
	});

	test('run_command approved → invokes the tool with the provided args', async () => {
		const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
		const registry = new ToolRegistry(BUILTIN_TOOLS);
		const outcome = await runGatedToolCall(
			registry,
			'run_command',
			{ command: 'npm', args: ['test'] },
			makeCtx({
				runCommand: async (command, args) => {
					calls.push({ command, args });
					return { ran: true, stdout: 'ok', stderr: '', exitCode: 0, timedOut: false };
				},
			}),
			{ decision: 'approve' },
		);
		assert.deepStrictEqual(
			{
				requestPosted: outcome.requestPosted,
				executed: outcome.executed,
				isError: outcome.result.isError,
				calls,
			},
			{
				requestPosted: true,
				executed: true,
				isError: false,
				calls: [{ command: 'npm', args: ['test'] }],
			},
		);
	});

	test('run_command rejected → never spawns the child process', async () => {
		let runCalls = 0;
		const registry = new ToolRegistry(BUILTIN_TOOLS);
		const outcome = await runGatedToolCall(
			registry,
			'run_command',
			{ command: 'rm', args: ['-rf', '/'] },
			makeCtx({
				runCommand: async () => {
					runCalls += 1;
					return { ran: true, exitCode: 0 };
				},
			}),
			{ decision: 'reject' },
		);
		assert.deepStrictEqual(
			{
				requestPosted: outcome.requestPosted,
				executed: outcome.executed,
				isError: outcome.result.isError,
				content: outcome.result.content,
				runCalls,
			},
			{
				requestPosted: true,
				executed: false,
				isError: true,
				content: 'Tool call rejected by user.',
				runCalls: 0,
			},
		);
	});

	test('cancel decision yields a cancellation result without executing', async () => {
		let writeCalls = 0;
		const registry = new ToolRegistry(BUILTIN_TOOLS);
		const outcome = await runGatedToolCall(
			registry,
			'write_file',
			{ path: 'src/x.ts', content: 'x' },
			makeCtx({
				writeFile: async () => {
					writeCalls += 1;
					return { written: true };
				},
			}),
			{ decision: 'cancel' },
		);
		assert.deepStrictEqual(
			{
				requestPosted: outcome.requestPosted,
				executed: outcome.executed,
				isError: outcome.result.isError,
				content: outcome.result.content,
				writeCalls,
			},
			{
				requestPosted: true,
				executed: false,
				isError: true,
				content: 'Tool call cancelled.',
				writeCalls: 0,
			},
		);
	});

	test('auto-approve still posts a request (with autoApproved=true) and runs the tool', async () => {
		let writeCalls = 0;
		const registry = new ToolRegistry(BUILTIN_TOOLS);
		const outcome = await runGatedToolCall(
			registry,
			'write_file',
			{ path: 'src/auto.ts', content: 'export const x = 1;' },
			makeCtx({
				writeFile: async () => {
					writeCalls += 1;
					return { written: true };
				},
			}),
			{ autoApprove: true },
		);
		assert.deepStrictEqual(
			{
				requestPosted: outcome.requestPosted,
				autoApprovedFlag: outcome.autoApprovedFlag,
				executed: outcome.executed,
				isError: outcome.result.isError,
				writeCalls,
			},
			{
				requestPosted: true,
				autoApprovedFlag: true,
				executed: true,
				isError: undefined,
				writeCalls: 1,
			},
		);
	});

	test('custom tools without riskLevel default to safe (no gating)', async () => {
		const customTool: Tool = {
			definition: {
				name: 'custom_safe',
				description: 'A custom safe tool.',
				inputSchema: { type: 'object', properties: {} },
			},
			async execute(): Promise<ToolExecutionResult> {
				return { content: 'ran custom' };
			},
		};
		const registry = new ToolRegistry([customTool]);
		const outcome = await runGatedToolCall(registry, 'custom_safe', {}, makeCtx());
		assert.deepStrictEqual(
			{
				requestPosted: outcome.requestPosted,
				executed: outcome.executed,
				content: outcome.result.content,
			},
			{ requestPosted: false, executed: true, content: 'ran custom' },
		);
	});
});
