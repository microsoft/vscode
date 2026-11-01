/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual, rejects } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import type { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { BasicExecuteStrategy } from '../../browser/executeStrategy/basicExecuteStrategy.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import type { ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { PromptInputState } from '../../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';

function createLogService(): ITerminalLogService {
	return new class extends NullLogService { readonly _logBrand = undefined; };
}

suite('BasicExecuteStrategy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('completes when terminal process exits without shell integration sequences', async () => {
		const onCommandFinishedEmitter = new Emitter<{ getOutput(): string; exitCode: number }>();
		const onExitEmitter = new Emitter<number | undefined>();

		const marker = {
			line: 0,
			dispose: () => { },
			onDispose: Event.None,
		};
		const xterm = {
			raw: {
				registerMarker: () => marker,
				buffer: {
					active: {},
					alternate: {},
					onBufferChange: () => toDisposable(() => { }),
				},
				getContentsAsText: () => 'some output',
			}
		};
		const instance = {
			xtermReadyPromise: Promise.resolve(xterm),
			onData: Event.None,
			onDisposed: Event.None,
			onExit: onExitEmitter.event,
			sendText: () => {
				// Simulate process exiting without firing onCommandFinished
				queueMicrotask(() => onExitEmitter.fire(1));
			},
		} as unknown as ITerminalInstance;
		const commandDetection = {
			onCommandFinished: onCommandFinishedEmitter.event,
		} as unknown as ICommandDetectionCapability;
		const strategy = store.add(new BasicExecuteStrategy(
			instance,
			() => false,
			commandDetection,
			// The mocked process exits immediately; don't wait a real second for its output to go idle.
			new TestConfigurationService({ [TerminalChatAgentToolsSettingId.IdlePollInterval]: 1 }),
			createLogService(),
		));

		const result = await strategy.execute('exit 1', CancellationToken.None);

		strictEqual(result.exitCode, 1);
	});

	test('returns immediately with captured exit code when pty has already exited before execute()', async () => {
		// Simulates the scenario where the shell process from a previous command
		// has already died, so onExit has already fired and Event.toPromise(onExit)
		// would never resolve. The strategy must short-circuit using the
		// instance's already-captured exitCode.
		const onCommandFinishedEmitter = new Emitter<{ getOutput(): string; exitCode: number }>();
		const onExitEmitter = new Emitter<number | undefined>();
		const instance = {
			xtermReadyPromise: Promise.resolve({}),
			onData: Event.None,
			onDisposed: Event.None,
			onExit: onExitEmitter.event,
			isDisposed: false,
			exitCode: 1,
			sendText: () => { throw new Error('sendText should not be called when pty already exited'); },
		} as unknown as ITerminalInstance;
		const commandDetection = {
			onCommandFinished: onCommandFinishedEmitter.event,
		} as unknown as ICommandDetectionCapability;
		const strategy = store.add(new BasicExecuteStrategy(
			instance,
			() => false,
			commandDetection,
			new TestConfigurationService(),
			createLogService(),
		));

		const result = await strategy.execute('Rscript /app/ars.R', CancellationToken.None);

		strictEqual(result.exitCode, 1);
		strictEqual(result.output, undefined);
		strictEqual(result.additionalInformation, 'Command exited with code 1');
	});

	test('throws "The terminal was closed" when instance is already disposed before execute()', async () => {
		const onCommandFinishedEmitter = new Emitter<{ getOutput(): string; exitCode: number }>();
		const instance = {
			xtermReadyPromise: Promise.resolve({}),
			onData: Event.None,
			onDisposed: Event.None,
			onExit: Event.None,
			isDisposed: true,
			exitCode: undefined,
			sendText: () => { throw new Error('sendText should not be called when terminal is disposed'); },
		} as unknown as ITerminalInstance;
		const commandDetection = {
			onCommandFinished: onCommandFinishedEmitter.event,
		} as unknown as ICommandDetectionCapability;
		const strategy = store.add(new BasicExecuteStrategy(
			instance,
			() => false,
			commandDetection,
			new TestConfigurationService(),
			createLogService(),
		));

		await rejects(
			() => strategy.execute('echo hello', CancellationToken.None),
			/The terminal was closed/
		);
	});

	test('interrupts a still-running command and only clears pending input with Ctrl+U where Ctrl+U clears the line', async () => {
		// PSReadLine's Windows edit mode (the default on Windows) has no Ctrl+U binding and inserts
		// it into the command line instead, which made `cmd /c rem` fail with "The term 'cmd' is
		// not recognized". Its Emacs edit mode (the default elsewhere) clears the line.
		const bash = { shellLaunchConfig: { executable: '/bin/bash' }, os: OperatingSystem.Linux };
		const pwshWindows = { shellLaunchConfig: { executable: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' }, os: OperatingSystem.Windows };
		const pwshMacOS = { shellLaunchConfig: { executable: '/usr/local/bin/pwsh' }, os: OperatingSystem.Macintosh };
		const scenarios: Record<string, { shell: Partial<Pick<ITerminalInstance, 'shellLaunchConfig' | 'os'>>; hasReceivedUserInput: boolean; isExecuting: boolean; isAtPrompt?: boolean }> = {
			bashPendingInput: { shell: bash, hasReceivedUserInput: true, isExecuting: false },
			bashCleanPrompt: { shell: bash, hasReceivedUserInput: false, isExecuting: false },
			pwshWindowsPendingInput: { shell: pwshWindows, hasReceivedUserInput: true, isExecuting: false },
			pwshMacOSPendingInput: { shell: pwshMacOS, hasReceivedUserInput: true, isExecuting: false },
			// e.g. the previous execution finished via the idle fallback while its process kept running
			bashStillExecuting: { shell: bash, hasReceivedUserInput: false, isExecuting: true },
			pwshWindowsStillExecuting: { shell: pwshWindows, hasReceivedUserInput: false, isExecuting: true },
			// Shell integration reports an `executingCommandObject` from the command start (B) sequence
			// on, so it is also defined while sitting at an idle prompt
			bashAtPrompt: { shell: bash, hasReceivedUserInput: false, isExecuting: false, isAtPrompt: true },
			bashAtPromptPendingInput: { shell: bash, hasReceivedUserInput: true, isExecuting: false, isAtPrompt: true },
			pwshWindowsAtPrompt: { shell: pwshWindows, hasReceivedUserInput: false, isExecuting: false, isAtPrompt: true },
		};
		const sentTextsByScenario: Record<string, string[]> = {};
		for (const [name, { shell, hasReceivedUserInput, isExecuting, isAtPrompt }] of Object.entries(scenarios)) {
			const sentTexts: string[] = [];
			const onExitEmitter = new Emitter<number | undefined>();
			const marker = {
				line: 0,
				dispose: () => { },
				onDispose: Event.None,
			};
			const xterm = {
				raw: {
					registerMarker: () => marker,
					buffer: {
						active: {},
						alternate: {},
						onBufferChange: () => toDisposable(() => { }),
					},
					getContentsAsText: () => '',
				}
			};
			const instance = {
				xtermReadyPromise: Promise.resolve(xterm),
				onData: Event.None,
				onDisposed: Event.None,
				onExit: onExitEmitter.event,
				sendText: (text: string, shouldExecute: boolean) => {
					sentTexts.push(text);
					if (shouldExecute) {
						queueMicrotask(() => onExitEmitter.fire(0));
					}
				},
				...shell,
			} as unknown as ITerminalInstance;
			const commandDetection = {
				onCommandFinished: Event.None,
				executingCommandObject: isExecuting || isAtPrompt ? { marker: {} } : undefined,
				promptInputModel: { state: isExecuting ? PromptInputState.Execute : PromptInputState.Input },
			} as unknown as ICommandDetectionCapability;
			const strategy = store.add(new BasicExecuteStrategy(
				instance,
				() => hasReceivedUserInput,
				commandDetection,
				new TestConfigurationService({ [TerminalChatAgentToolsSettingId.IdlePollInterval]: 1 }),
				createLogService(),
			));

			await strategy.execute('cmd /c rem', CancellationToken.None);
			sentTextsByScenario[name] = sentTexts;
		}

		deepStrictEqual(sentTextsByScenario, {
			bashPendingInput: ['\x15', 'cmd /c rem'],
			bashCleanPrompt: ['cmd /c rem'],
			pwshWindowsPendingInput: ['cmd /c rem'],
			pwshMacOSPendingInput: ['\x15', 'cmd /c rem'],
			bashStillExecuting: ['\x03', 'cmd /c rem'],
			pwshWindowsStillExecuting: ['\x03', 'cmd /c rem'],
			bashAtPrompt: ['cmd /c rem'],
			bashAtPromptPendingInput: ['\x15', 'cmd /c rem'],
			pwshWindowsAtPrompt: ['cmd /c rem'],
		});
	});

	test('reports the finished command when it was sent at an idle prompt', async () => {
		// The command typed at an idle prompt finishes with the marker of that prompt's command start
		// (B) sequence, which `executingCommandObject` already reported before the command was sent.
		const promptMarker = {};
		const onCommandFinishedEmitter = new Emitter<{ marker: object; exitCode: number; getOutput(): string }>();
		const onDataEmitter = new Emitter<string>();
		const marker = {
			line: 0,
			dispose: () => { },
			onDispose: Event.None,
		};
		const xterm = {
			raw: {
				registerMarker: () => marker,
				buffer: {
					active: {},
					alternate: {},
					onBufferChange: () => toDisposable(() => { }),
				},
				getContentsAsText: () => '',
			}
		};
		const instance = {
			xtermReadyPromise: Promise.resolve(xterm),
			onData: onDataEmitter.event,
			onDisposed: Event.None,
			onExit: Event.None,
			shellLaunchConfig: { executable: '/bin/bash' },
			os: OperatingSystem.Linux,
			sendText: (_text: string, shouldExecute: boolean) => {
				if (shouldExecute) {
					queueMicrotask(() => {
						onCommandFinishedEmitter.fire({ marker: promptMarker, exitCode: 2, getOutput: () => '' });
						onDataEmitter.fire('\x1b]633;D;2\x07');
						onDataEmitter.fire('\x1b]633;A\x07');
					});
				}
			},
		} as unknown as ITerminalInstance;
		const commandDetection = {
			onCommandFinished: onCommandFinishedEmitter.event,
			executingCommandObject: { marker: promptMarker },
			promptInputModel: { state: PromptInputState.Input },
		} as unknown as ICommandDetectionCapability;
		const strategy = store.add(new BasicExecuteStrategy(
			instance,
			() => false,
			commandDetection,
			new TestConfigurationService({ [TerminalChatAgentToolsSettingId.IdlePollInterval]: 1 }),
			createLogService(),
		));

		const result = await strategy.execute('false', CancellationToken.None);

		strictEqual(result.exitCode, 2);
	});
});
