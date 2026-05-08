/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { READ_FILE_TOOL, RUN_COMMAND_TOOL } from 'son-of-anton-core/tools/builtin';
import type {
	ShellExecutionMetadata,
	ToolExecutionContext,
	ToolExecutionResult,
} from 'son-of-anton-core/tools/types';

// ── Phase 46: terminal-block metadata flow ────────────────────────────────────
//
// The chat surface renders run_command output as a Cline-style terminal block
// using the structured `metadata` payload that Phase 46 attached to the tool
// result. The webview half is JS-only, so we exercise the host-side path:
// RUN_COMMAND_TOOL.execute → ToolExecutionResult with ShellExecutionMetadata.

interface FakeRunOutcome {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly exitCode?: number;
	readonly timedOut?: boolean;
	readonly ran?: boolean;
	readonly reason?: string;
}

function makeCtx(
	outcome: FakeRunOutcome,
	overrides: Partial<ToolExecutionContext> = {},
): ToolExecutionContext {
	return {
		workspaceRoot: '/tmp/fake-workspace',
		readFile: async () => '',
		readDir: async () => [],
		searchTextInWorkspace: async () => [],
		writeFile: async () => ({ written: true }),
		runCommand: async () => ({
			ran: outcome.ran ?? true,
			stdout: outcome.stdout,
			stderr: outcome.stderr,
			exitCode: outcome.exitCode,
			timedOut: outcome.timedOut,
			reason: outcome.reason,
		}),
		...overrides,
	};
}

function metaOf(result: ToolExecutionResult): ShellExecutionMetadata {
	assert.ok(result.metadata, 'expected metadata on result');
	const meta = result.metadata as ShellExecutionMetadata;
	assert.strictEqual(meta.kind, 'shell');
	return meta;
}

suite('Terminal block metadata — Phase 46', () => {

	test('successful command produces shell metadata with the right shape', async () => {
		const result = await RUN_COMMAND_TOOL.execute(
			{ command: 'npm', args: ['test'], cwd: 'packages/core' },
			makeCtx({ stdout: 'ok', stderr: '', exitCode: 0 }),
		);
		const meta = metaOf(result);
		assert.deepStrictEqual(
			{
				kind: meta.kind,
				command: meta.command,
				args: meta.args,
				cwd: meta.cwd,
				exitCode: meta.exitCode,
				stdout: meta.stdout,
				stderr: meta.stderr,
				cancelled: meta.cancelled,
			},
			{
				kind: 'shell',
				command: 'npm',
				args: ['test'],
				cwd: 'packages/core',
				exitCode: 0,
				stdout: 'ok',
				stderr: '',
				cancelled: false,
			},
		);
	});

	test('content field is preserved verbatim (combined stdout+stderr) for back-compat', async () => {
		const result = await RUN_COMMAND_TOOL.execute(
			{ command: 'ls' },
			makeCtx({ stdout: 'hello', stderr: 'warn', exitCode: 0 }),
		);
		const expected = ['exit code: 0', '--- stdout ---', 'hello', '--- stderr ---', 'warn'].join('\n');
		assert.strictEqual(result.content, expected);
	});

	test('exitCode 0 → cancelled is false (or undefined)', async () => {
		const result = await RUN_COMMAND_TOOL.execute(
			{ command: 'echo', args: ['hi'] },
			makeCtx({ stdout: 'hi', exitCode: 0, timedOut: false }),
		);
		const meta = metaOf(result);
		assert.deepStrictEqual(
			{ exitCode: meta.exitCode, cancelled: meta.cancelled, isError: result.isError },
			{ exitCode: 0, cancelled: false, isError: false },
		);
	});

	test('timed-out command sets cancelled=true and isError=true', async () => {
		const result = await RUN_COMMAND_TOOL.execute(
			{ command: 'sleep', args: ['100'] },
			makeCtx({ stdout: '', stderr: '', exitCode: undefined, timedOut: true }),
		);
		const meta = metaOf(result);
		assert.deepStrictEqual(
			{ cancelled: meta.cancelled, isError: result.isError, hasTimeoutTag: result.content.includes('timed out') },
			{ cancelled: true, isError: true, hasTimeoutTag: true },
		);
	});

	test('non-zero exit code marks the result as an error without cancellation', async () => {
		const result = await RUN_COMMAND_TOOL.execute(
			{ command: 'false' },
			makeCtx({ stdout: '', stderr: 'failed', exitCode: 1 }),
		);
		const meta = metaOf(result);
		assert.deepStrictEqual(
			{ exitCode: meta.exitCode, isError: result.isError, cancelled: meta.cancelled },
			{ exitCode: 1, isError: true, cancelled: false },
		);
	});

	test('stdout and stderr are truncated to 25KB each on the metadata payload', async () => {
		const big = 'x'.repeat(100_000);
		const result = await RUN_COMMAND_TOOL.execute(
			{ command: 'cat', args: ['huge.log'] },
			makeCtx({ stdout: big, stderr: big, exitCode: 0 }),
		);
		const meta = metaOf(result);
		assert.deepStrictEqual(
			{ stdoutLen: meta.stdout?.length, stderrLen: meta.stderr?.length },
			{ stdoutLen: 25_000, stderrLen: 25_000 },
		);
	});

	test('declined run (ran=false) returns an error result with no metadata', async () => {
		const result = await RUN_COMMAND_TOOL.execute(
			{ command: 'rm', args: ['-rf', '/'] },
			makeCtx({ ran: false, reason: 'declined by user' }),
		);
		assert.deepStrictEqual(
			{ isError: result.isError, hasMetadata: result.metadata !== undefined, mentionsCommand: result.content.includes('rm') },
			{ isError: true, hasMetadata: false, mentionsCommand: true },
		);
	});

	test('shell metacharacters in the command are rejected before any execution', async () => {
		let runs = 0;
		const result = await RUN_COMMAND_TOOL.execute(
			{ command: 'rm; ls' },
			makeCtx({}, {
				runCommand: async () => {
					runs += 1;
					return { ran: true, stdout: '', stderr: '', exitCode: 0, timedOut: false };
				},
			}),
		);
		assert.deepStrictEqual(
			{ isError: result.isError, runs, hasMetadata: result.metadata !== undefined },
			{ isError: true, runs: 0, hasMetadata: false },
		);
	});

	test('safe tools without metadata still produce a valid ToolExecutionResult', async () => {
		const result = await READ_FILE_TOOL.execute(
			{ path: 'package.json' },
			{
				workspaceRoot: '/tmp/ws',
				readFile: async () => '{ "name": "x" }',
				readDir: async () => [],
				searchTextInWorkspace: async () => [],
				writeFile: async () => ({ written: true }),
				runCommand: async () => ({ ran: false }),
			},
		);
		assert.deepStrictEqual(
			{
				hasContent: typeof result.content === 'string' && result.content.length > 0,
				hasMetadata: result.metadata !== undefined,
				isError: result.isError,
			},
			{ hasContent: true, hasMetadata: false, isError: undefined },
		);
	});

	test('cwd traversal is rejected before runCommand is called', async () => {
		let runs = 0;
		const result = await RUN_COMMAND_TOOL.execute(
			{ command: 'ls', cwd: '../escape' },
			makeCtx({}, {
				runCommand: async () => {
					runs += 1;
					return { ran: true, stdout: '', stderr: '', exitCode: 0 };
				},
			}),
		);
		assert.deepStrictEqual(
			{ runs, isError: result.isError, hasMetadata: result.metadata !== undefined },
			{ runs: 0, isError: true, hasMetadata: false },
		);
	});
});
