/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, notStrictEqual, ok, strictEqual } from 'assert';
import { platform } from 'os';
import { env, TerminalShellExecutionCommandLineConfidence, UIKind, window, workspace, type Disposable, type Terminal, type TerminalShellExecution, type TerminalShellExecutionCommandLine, type TerminalShellExecutionEndEvent, type TerminalShellIntegration } from 'vscode';
import { assertNoRpc } from '../utils';

// Terminal integration tests are disabled on web https://github.com/microsoft/vscode/issues/92826
// Windows images will often not have functional shell integration
// TODO: Linux https://github.com/microsoft/vscode/issues/221399
(env.uiKind === UIKind.Web || platform() === 'win32' || platform() === 'linux' ? suite.skip : suite)('vscode API - Terminal.shellIntegration', () => {
	const disposables: Disposable[] = [];

	suiteSetup(async () => {
		const config = workspace.getConfiguration('terminal.integrated');
		await config.update('shellIntegration.enabled', true);
	});

	suiteTeardown(async () => {
		const config = workspace.getConfiguration('terminal.integrated');
		await config.update('shellIntegration.enabled', undefined);
	});

	teardown(async () => {
		assertNoRpc();
		disposables.forEach(d => d.dispose());
		disposables.length = 0;
	});

	function createTerminalAndWaitForShellIntegration(): Promise<{ terminal: Terminal; shellIntegration: TerminalShellIntegration }> {
		return new Promise<{ terminal: Terminal; shellIntegration: TerminalShellIntegration }>(resolve => {
			disposables.push(window.onDidChangeTerminalShellIntegration(e => {
				if (e.terminal === terminal) {
					resolve({
						terminal,
						shellIntegration: e.shellIntegration
					});
				}
			}));
			const terminal = platform() === 'win32'
				? window.createTerminal()
				: window.createTerminal({ shellPath: '/bin/bash' });
			terminal.show();
		});
	}

	function executeCommandAsync(shellIntegration: TerminalShellIntegration, command: string, args?: string[]): { execution: Promise<TerminalShellExecution>; endEvent: Promise<TerminalShellExecutionEndEvent> } {
		return {
			execution: new Promise<TerminalShellExecution>(resolve => {
				// Await a short period as pwsh's first SI prompt can fail when launched in quick succession
				setTimeout(() => {
					if (args) {
						resolve(shellIntegration.executeCommand(command, args));
					} else {
						resolve(shellIntegration.executeCommand(command));
					}
				}, 500);
			}),
			endEvent: new Promise<TerminalShellExecutionEndEvent>(resolve => {
				disposables.push(window.onDidEndTerminalShellExecution(e => {
					if (e.shellIntegration === shellIntegration) {
						resolve(e);
					}
				}));
			})
		};
	}

	function closeTerminalAsync(terminal: Terminal): Promise<void> {
		return new Promise<void>(resolve => {
			disposables.push(window.onDidCloseTerminal(e => {
				if (e === terminal) {
					resolve();
				}
			}));
			terminal.dispose();
		});
	}

	test('window.onDidChangeTerminalShellIntegration should activate for the default terminal', async () => {
		const { terminal, shellIntegration } = await createTerminalAndWaitForShellIntegration();
		ok(terminal.shellIntegration);
		ok(shellIntegration);
		await closeTerminalAsync(terminal);
	});

	test('execution events should fire in order when a command runs', async () => {
		const { terminal, shellIntegration } = await createTerminalAndWaitForShellIntegration();
		const events: string[] = [];
		disposables.push(window.onDidStartTerminalShellExecution(() => events.push('start')));
		disposables.push(window.onDidEndTerminalShellExecution(() => events.push('end')));

		await executeCommandAsync(shellIntegration, 'echo hello').endEvent;

		deepStrictEqual(events, ['start', 'end']);

		await closeTerminalAsync(terminal);
	});

	test('end execution event should report zero exit code for successful commands', async () => {
		const { terminal, shellIntegration } = await createTerminalAndWaitForShellIntegration();
		const events: string[] = [];
		disposables.push(window.onDidStartTerminalShellExecution(() => events.push('start')));
		disposables.push(window.onDidEndTerminalShellExecution(() => events.push('end')));

		const endEvent = await executeCommandAsync(shellIntegration, 'echo hello').endEvent;
		strictEqual(endEvent.exitCode, 0);

		await closeTerminalAsync(terminal);
	});

	test('end execution event should report non-zero exit code for failed commands', async () => {
		const { terminal, shellIntegration } = await createTerminalAndWaitForShellIntegration();
		const events: string[] = [];
		disposables.push(window.onDidStartTerminalShellExecution(() => events.push('start')));
		disposables.push(window.onDidEndTerminalShellExecution(() => events.push('end')));

		const endEvent = await executeCommandAsync(shellIntegration, 'fakecommand').endEvent;
		notStrictEqual(endEvent.exitCode, 0);

		await closeTerminalAsync(terminal);
	});

	test('TerminalShellExecution.read iterables should be available between the start and end execution events', async () => {
		const { terminal, shellIntegration } = await createTerminalAndWaitForShellIntegration();
		const events: string[] = [];
		disposables.push(window.onDidStartTerminalShellExecution(() => events.push('start')));
		disposables.push(window.onDidEndTerminalShellExecution(() => events.push('end')));

		const { execution, endEvent } = executeCommandAsync(shellIntegration, 'echo hello');
		for await (const _ of (await execution).read()) {
			events.push('data');
		}
		await endEvent;

		ok(events.length >= 3, `should have at least 3 events ${JSON.stringify(events)}`);
		strictEqual(events[0], 'start', `first event should be 'start' ${JSON.stringify(events)}`);
		strictEqual(events.at(-1), 'end', `last event should be 'end' ${JSON.stringify(events)}`);
		for (let i = 1; i < events.length - 1; i++) {
			strictEqual(events[i], 'data', `all middle events should be 'data' ${JSON.stringify(events)}`);
		}

		await closeTerminalAsync(terminal);
	});

	test('TerminalShellExecution.read events should fire with contents of command', async () => {
		const { terminal, shellIntegration } = await createTerminalAndWaitForShellIntegration();
		const events: string[] = [];

		const { execution, endEvent } = executeCommandAsync(shellIntegration, 'echo hello');
		for await (const data of (await execution).read()) {
			events.push(data);
		}
		await endEvent;

		ok(events.join('').includes('hello'), `should include 'hello' in ${JSON.stringify(events)}`);

		await closeTerminalAsync(terminal);
	});

	test('TerminalShellExecution.read events should give separate iterables per call', async () => {
		const { terminal, shellIntegration } = await createTerminalAndWaitForShellIntegration();

		const { execution, endEvent } = executeCommandAsync(shellIntegration, 'echo hello');
		const executionSync = await execution;
		const firstRead = executionSync.read();
		const secondRead = executionSync.read();

		const [firstReadEvents, secondReadEvents] = await Promise.all([
			new Promise<string[]>(resolve => {
				(async () => {
					const events: string[] = [];
					for await (const data of firstRead) {
						events.push(data);
					}
					resolve(events);
				})();
			}),
			new Promise<string[]>(resolve => {
				(async () => {
					const events: string[] = [];
					for await (const data of secondRead) {
						events.push(data);
					}
					resolve(events);
				})();
			}),
		]);
		await endEvent;

		ok(firstReadEvents.join('').includes('hello'), `should include 'hello' in ${JSON.stringify(firstReadEvents)}`);
		deepStrictEqual(firstReadEvents, secondReadEvents);

		await closeTerminalAsync(terminal);
	});

	test('executeCommand(commandLine)', async () => {
		const { terminal, shellIntegration } = await createTerminalAndWaitForShellIntegration();
		const { execution, endEvent } = executeCommandAsync(shellIntegration, 'echo hello');
		const executionSync = await execution;
		const expectedCommandLine: TerminalShellExecutionCommandLine = {
			value: 'echo hello',
			isTrusted: true,
			confidence: TerminalShellExecutionCommandLineConfidence.High
		};
		deepStrictEqual(executionSync.commandLine, expectedCommandLine);
		await endEvent;
		deepStrictEqual(executionSync.commandLine, expectedCommandLine);
		await closeTerminalAsync(terminal);
	});

	test('executeCommand(executable, args)', async () => {
		const { terminal, shellIntegration } = await createTerminalAndWaitForShellIntegration();
		const { execution, endEvent } = executeCommandAsync(shellIntegration, 'echo', ['hello']);
		const executionSync = await execution;
		const expectedCommandLine: TerminalShellExecutionCommandLine = {
			value: 'echo "hello"',
			isTrusted: true,
			confidence: TerminalShellExecutionCommandLineConfidence.High
		};
		deepStrictEqual(executionSync.commandLine, expectedCommandLine);
		await endEvent;
		deepStrictEqual(executionSync.commandLine, expectedCommandLine);
		await closeTerminalAsync(terminal);
	});
});
