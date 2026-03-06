/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { disposableTimeout } from '../../../../base/common/async.js';
import { IAgentTool, IToolContext, IToolResult } from '../../common/tools.js';

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const MAX_OUTPUT_BYTES = 256 * 1024; // 256 KB

/**
 * Tool that executes a shell command via bash.
 */
export class BashTool implements IAgentTool {
	readonly name = 'bash';
	readonly description = 'Execute a shell command and return stdout/stderr. Commands run in the working directory.';
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

		return new Promise<IToolResult>(resolve => {
			const child = exec(
				command,
				{
					cwd: context.workingDirectory,
					timeout: timeoutMs,
					maxBuffer: MAX_OUTPUT_BYTES,
					shell: '/bin/bash',
					env: { ...process.env, TERM: 'dumb' },
				},
				(error, stdout, stderr) => {
					let output = '';
					if (stdout) {
						output += stdout;
					}
					if (stderr) {
						if (output) {
							output += '\n';
						}
						output += `stderr:\n${stderr}`;
					}

					if (error) {
						// Check for timeout
						if (error.killed) {
							resolve({
								content: `Error: Command timed out after ${timeoutMs}ms.\n${output}`,
								isError: true,
							});
							return;
						}

						// Command exited with non-zero code
						const exitCode = error.code ?? 'unknown';
						resolve({
							content: `Command exited with code ${exitCode}.\n${output}`,
							isError: true,
						});
						return;
					}

					resolve({ content: output || '(no output)' });
				},
			);

			// Handle cancellation
			const disposable = context.token.onCancellationRequested(() => {
				child.kill('SIGTERM');
				// Give it a moment to clean up, then force kill
				const forceKill = disposableTimeout(() => {
					if (!child.killed) {
						child.kill('SIGKILL');
					}
				}, 1000);

				child.on('exit', () => forceKill.dispose());
			});

			child.on('exit', () => disposable.dispose());
		});
	}
}
