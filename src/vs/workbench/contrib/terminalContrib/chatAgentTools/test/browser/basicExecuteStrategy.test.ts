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

	test('only clears pending input with Ctrl+U on shells where Ctrl+U clears the line', async () => {
		// PSReadLine's default Windows edit mode has no Ctrl+U binding and inserts it into the
		// command line instead, which made `cmd /c rem` fail with "The term 'cmd' is not recognized"
		const shells: Record<string, Partial<Pick<ITerminalInstance, 'shellLaunchConfig' | 'os'>>> = {
			bash: { shellLaunchConfig: { executable: '/bin/bash' }, os: OperatingSystem.Linux },
			pwsh: { shellLaunchConfig: { executable: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' }, os: OperatingSystem.Windows },
		};
		const sentTextsByShell: Record<string, string[]> = {};
		for (const [name, shell] of Object.entries(shells)) {
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
			} as unknown as ICommandDetectionCapability;
			const strategy = store.add(new BasicExecuteStrategy(
				instance,
				() => true,
				commandDetection,
				new TestConfigurationService({ [TerminalChatAgentToolsSettingId.IdlePollInterval]: 1 }),
				createLogService(),
			));

			await strategy.execute('cmd /c rem', CancellationToken.None);
			sentTextsByShell[name] = sentTexts;
		}

		deepStrictEqual(sentTextsByShell, {
			bash: ['\x15', 'cmd /c rem'],
			pwsh: ['cmd /c rem'],
		});
	});
});
