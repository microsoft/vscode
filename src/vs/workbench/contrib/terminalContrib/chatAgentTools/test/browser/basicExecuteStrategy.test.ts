/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, rejects } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import type { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { BasicExecuteStrategy } from '../../browser/executeStrategy/basicExecuteStrategy.js';
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
			new TestConfigurationService(),
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
});
