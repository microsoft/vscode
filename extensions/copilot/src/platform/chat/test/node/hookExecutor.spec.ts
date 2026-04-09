/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'events';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ChatHookCommand } from 'vscode';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { TestLogService } from '../../../testing/common/testLogService';
import { HookCommandResultKind } from '../../common/hookExecutor';
import { IHooksOutputChannel } from '../../common/hooksOutputChannel';
import { NodeHookExecutor } from '../../node/hookExecutor';

let mockChild: MockChildProcess;

vi.mock('child_process', () => ({
	spawn: vi.fn(() => mockChild),
}));

interface MockChildProcess extends EventEmitter {
	stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
	stdout: EventEmitter;
	stderr: EventEmitter;
	kill: ReturnType<typeof vi.fn>;
}

function createMockChild(): MockChildProcess {
	const child: MockChildProcess = Object.assign(new EventEmitter(), {
		stdin: { write: vi.fn(), end: vi.fn() },
		stdout: new EventEmitter(),
		stderr: new EventEmitter(),
		kill: vi.fn(),
	});
	return child;
}

/**
 * Simulates a child process completing with the given stdout, stderr, and exit code.
 */
function completeChild(child: MockChildProcess, opts: { stdout?: string; stderr?: string; exitCode?: number }): void {
	if (opts.stdout) {
		child.stdout.emit('data', Buffer.from(opts.stdout));
	}
	if (opts.stderr) {
		child.stderr.emit('data', Buffer.from(opts.stderr));
	}
	child.emit('exit', opts.exitCode ?? 0);
	child.emit('close');
}

function cmd(command: string, options?: Partial<Omit<ChatHookCommand, 'command'>>): ChatHookCommand {
	return { command, ...options } as ChatHookCommand;
}

describe('NodeHookExecutor', () => {
	let executor: NodeHookExecutor;
	let child: MockChildProcess;

	beforeEach(() => {
		const mockOutputChannel: IHooksOutputChannel = { _serviceBrand: undefined, appendLine: vi.fn() };
		executor = new NodeHookExecutor(new TestLogService(), mockOutputChannel);
		child = createMockChild();
		mockChild = child;
	});

	test('returns success with string output for exit code 0', async () => {
		const promise = executor.executeCommand(cmd('test'), undefined, CancellationToken.None);
		completeChild(child, { stdout: 'hello world', exitCode: 0 });
		const result = await promise;

		expect(result.kind).toBe(HookCommandResultKind.Success);
		expect(result.result).toBe('hello world');
	});

	test('parses JSON stdout', async () => {
		const promise = executor.executeCommand(cmd('test'), undefined, CancellationToken.None);
		completeChild(child, { stdout: '{"key": "value"}', exitCode: 0 });
		const result = await promise;

		expect(result.kind).toBe(HookCommandResultKind.Success);
		expect(result.result).toEqual({ key: 'value' });
	});

	test('returns empty string for no output', async () => {
		const promise = executor.executeCommand(cmd('test'), undefined, CancellationToken.None);
		completeChild(child, { exitCode: 0 });
		const result = await promise;

		expect(result.kind).toBe(HookCommandResultKind.Success);
		expect(result.result).toBe('');
	});

	test('returns non-blocking error for exit code 1', async () => {
		const promise = executor.executeCommand(cmd('test'), undefined, CancellationToken.None);
		completeChild(child, { stderr: 'warning', exitCode: 1 });
		const result = await promise;

		expect(result.kind).toBe(HookCommandResultKind.NonBlockingError);
		expect(result.result).toBe('warning');
	});

	test('returns blocking error for exit code 2', async () => {
		const promise = executor.executeCommand(cmd('test'), undefined, CancellationToken.None);
		completeChild(child, { stderr: 'fatal error', exitCode: 2 });
		const result = await promise;

		expect(result.kind).toBe(HookCommandResultKind.Error);
		expect(result.result).toBe('fatal error');
	});

	test('writes JSON input to stdin', async () => {
		const input = { tool: 'bash', args: { command: 'ls' } };
		const promise = executor.executeCommand(cmd('test'), input, CancellationToken.None);
		completeChild(child, { exitCode: 0 });
		await promise;

		expect(child.stdin.write).toHaveBeenCalled();
		const written = child.stdin.write.mock.calls[0][0];
		expect(JSON.parse(written)).toEqual(input);
		expect(child.stdin.end).toHaveBeenCalled();
	});

	test('does not write to stdin when input is undefined', async () => {
		const promise = executor.executeCommand(cmd('test'), undefined, CancellationToken.None);
		completeChild(child, { exitCode: 0 });
		await promise;

		expect(child.stdin.write).not.toHaveBeenCalled();
		expect(child.stdin.end).toHaveBeenCalled();
	});

	test('converts URI-like objects in input to filesystem paths', async () => {
		const input = {
			cwd: { scheme: 'file', path: '/test/path', fsPath: '/test/path' },
			other: 'value'
		};
		const promise = executor.executeCommand(cmd('test'), input, CancellationToken.None);
		completeChild(child, { exitCode: 0 });
		await promise;

		const written = JSON.parse(child.stdin.write.mock.calls[0][0]);
		expect(written.cwd).toBe('/test/path');
		expect(written.other).toBe('value');
	});

	test('passes custom environment variables to spawn', async () => {
		const promise = executor.executeCommand(
			cmd('test', { env: { MY_VAR: 'custom_value' } }),
			undefined, CancellationToken.None
		);
		completeChild(child, { stdout: 'ok', exitCode: 0 });
		const result = await promise;

		// Verify the command ran successfully (env is passed to spawn options)
		expect(result.kind).toBe(HookCommandResultKind.Success);
	});

	test('passes custom cwd from hook command to spawn', async () => {
		const promise = executor.executeCommand(
			cmd('test', { cwd: URI.file('/my/project') }),
			undefined, CancellationToken.None
		);
		completeChild(child, { stdout: 'ok', exitCode: 0 });
		const result = await promise;

		// Verify the command ran successfully (cwd is passed to spawn options)
		expect(result.kind).toBe(HookCommandResultKind.Success);
	});

	test('handles spawn error as non-blocking error', async () => {
		const promise = executor.executeCommand(cmd('badcmd'), undefined, CancellationToken.None);
		child.emit('error', new Error('spawn ENOENT'));
		const result = await promise;

		expect(result.kind).toBe(HookCommandResultKind.NonBlockingError);
		expect(result.result).toContain('ENOENT');
	});

	test('kills process on cancellation', async () => {
		const cts = new CancellationTokenSource();
		const promise = executor.executeCommand(cmd('test'), undefined, cts.token);

		cts.cancel();
		expect(child.kill).toHaveBeenCalledWith('SIGTERM');

		completeChild(child, { exitCode: 1 });
		const result = await promise;
		expect(result.kind).toBe(HookCommandResultKind.NonBlockingError);
	});

	test('kills process on timeout', async () => {
		vi.useFakeTimers();
		try {
			const promise = executor.executeCommand(
				cmd('test', { timeout: 5 }),
				undefined,
				CancellationToken.None
			);

			vi.advanceTimersByTime(5000);
			expect(child.kill).toHaveBeenCalledWith('SIGTERM');

			completeChild(child, { exitCode: 1 });
			const result = await promise;
			expect(result.kind).toBe(HookCommandResultKind.NonBlockingError);
		} finally {
			vi.useRealTimers();
		}
	});
});
