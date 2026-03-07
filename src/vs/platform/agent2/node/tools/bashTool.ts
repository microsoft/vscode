/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, spawn } from 'child_process';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IAgentTool, IToolContext, IToolResult } from '../../common/tools.js';

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const MAX_OUTPUT_BYTES = 256 * 1024; // 256 KB
const SCRATCHPAD_KEY = 'bashTool.shellProcess';

/**
 * A persistent shell process that is reused across tool invocations within
 * a session. State (cwd, environment variables, shell functions, etc.) is
 * preserved between commands.
 */
interface IPersistentShell {
	readonly process: ChildProcess;
	/** Accumulated data buffer for current command */
	buffer: string;
}

/**
 * Tool that executes shell commands in a persistent bash session.
 *
 * The shell process is created on first use and stored in the session
 * scratchpad, so state (working directory, environment, etc.) is preserved
 * across invocations within the same agent session.
 */
export class BashTool implements IAgentTool {
	readonly name = 'bash';
	readonly description = 'Execute a shell command in a persistent bash session. The session preserves state (working directory, environment variables, etc.) across invocations.';
	readonly parametersSchema = {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				description: 'The shell command to execute.',
			},
			timeout: {
				type: 'number',
				description: 'Optional timeout in milliseconds (default: 120000).',
			},
		},
		required: ['command'],
	};
	readonly readOnly = false;

	async execute(args: Record<string, unknown>, context: IToolContext): Promise<IToolResult> {
		const command = args['command'];
		if (typeof command !== 'string' || !command) {
			return { content: 'Error: "command" argument is required and must be a string.', isError: true };
		}

		const timeoutMs = typeof args['timeout'] === 'number' ? args['timeout'] : DEFAULT_TIMEOUT_MS;
		const shell = this._getOrCreateShell(context);

		return this._executeInShell(shell, command, timeoutMs, context);
	}

	private _getOrCreateShell(context: IToolContext): IPersistentShell {
		let shell = context.scratchpad.get(SCRATCHPAD_KEY) as IPersistentShell | undefined;
		if (shell && !shell.process.killed) {
			return shell;
		}

		const child = spawn('/bin/bash', ['--norc', '--noprofile'], {
			cwd: context.workingDirectory || undefined,
			env: { ...process.env, TERM: 'dumb', PS1: '', PS2: '', BASH_SILENCE_DEPRECATION_WARNING: '1' },
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		shell = { process: child, buffer: '' };
		context.scratchpad.set(SCRATCHPAD_KEY, shell);

		// Clean up on exit
		child.on('exit', () => {
			const current = context.scratchpad.get(SCRATCHPAD_KEY) as IPersistentShell | undefined;
			if (current?.process === child) {
				context.scratchpad.delete(SCRATCHPAD_KEY);
			}
		});

		return shell;
	}

	private _executeInShell(shell: IPersistentShell, command: string, timeoutMs: number, context: IToolContext): Promise<IToolResult> {
		return new Promise<IToolResult>(resolve => {
			const sentinel = `__SENTINEL_${generateUuid()}__`;
			const exitCodeVar = `__EXIT_${generateUuid().replace(/-/g, '')}__`;

			let output = '';
			let totalBytes = 0;
			let truncated = false;
			let settled = false;

			// Timeout
			const timeoutHandle = setTimeout(() => {
				shell.process.kill('SIGINT');
				settle({
					content: `Error: Command timed out after ${timeoutMs}ms.\n${output}`,
					isError: true,
				});
			}, timeoutMs);

			// Cancellation
			const cancellationDisposable = context.token.onCancellationRequested(() => {
				shell.process.kill('SIGINT');
				settle({
					content: `Command cancelled.\n${output}`,
					isError: true,
				});
			});

			const settle = (result: IToolResult) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeoutHandle);
				cancellationDisposable.dispose();
				cleanup();
				resolve(result);
			};

			const onData = (data: Buffer) => {
				const text = data.toString();
				output += text;
				totalBytes += data.byteLength;

				if (totalBytes > MAX_OUTPUT_BYTES) {
					truncated = true;
				}

				// Check if the sentinel has appeared in the accumulated output
				const sentinelIdx = output.indexOf(sentinel);
				if (sentinelIdx !== -1) {
					// Parse exit code from the line containing the sentinel:
					// The command writes: echo "<exitCodeVar>=$?<sentinel>"
					const commandOutput = output.substring(0, sentinelIdx);
					const exitCodeMatch = commandOutput.match(new RegExp(`${exitCodeVar}=(\\d+)`));
					const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;

					// Remove the exit code marker line from output
					let cleanOutput = commandOutput.replace(new RegExp(`${exitCodeVar}=\\d+`), '').trim();

					if (truncated) {
						cleanOutput = cleanOutput.substring(cleanOutput.length - MAX_OUTPUT_BYTES) + '\n[output truncated]';
					}

					settle({
						content: cleanOutput || '(no output)',
						isError: exitCode !== 0 ? true : undefined,
					});
				}
			};

			const onError = (err: Error) => {
				settle({
					content: `Error: Shell process error: ${err.message}`,
					isError: true,
				});
			};

			const onExit = (code: number | null) => {
				settle({
					content: `Error: Shell process exited unexpectedly with code ${code ?? 'unknown'}.\n${output}`,
					isError: true,
				});
			};

			const cleanup = () => {
				shell.process.stdout?.off('data', onData);
				shell.process.stderr?.off('data', onData);
				shell.process.off('error', onError);
				shell.process.off('exit', onExit);
			};

			shell.process.stdout?.on('data', onData);
			shell.process.stderr?.on('data', onData);
			shell.process.on('error', onError);
			shell.process.on('exit', onExit);

			// Write the command followed by the sentinel echo
			// This captures the exit code and signals completion
			const wrappedCommand = `${command}\necho "${exitCodeVar}=$?${sentinel}"\n`;
			shell.process.stdin?.write(wrappedCommand);
		});
	}
}
