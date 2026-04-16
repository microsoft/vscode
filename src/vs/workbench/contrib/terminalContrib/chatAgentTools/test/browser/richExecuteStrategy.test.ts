/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import type { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { RichExecuteStrategy } from '../../browser/executeStrategy/richExecuteStrategy.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import type { ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';

function createLogService(): ITerminalLogService {
	return new class extends NullLogService { readonly _logBrand = undefined; };
}

suite('RichExecuteStrategy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('passes separate command line metadata when running a wrapped command', async () => {
		const onCommandFinishedEmitter = new Emitter<{ getOutput(): string; exitCode: number }>();
		let actualCommandLine: string | undefined;
		let actualCommandId: string | undefined;
		let actualCommandLineForMetadata: string | undefined;

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
			runCommand: (commandLine: string, _shouldExecute: boolean, commandId?: string, _forceBracketedPasteMode?: boolean, commandLineForMetadata?: string) => {
				actualCommandLine = commandLine;
				actualCommandId = commandId;
				actualCommandLineForMetadata = commandLineForMetadata;
				queueMicrotask(() => onCommandFinishedEmitter.fire({ getOutput: () => 'output', exitCode: 0 }));
			},
		} as unknown as ITerminalInstance;
		const commandDetection = {
			onCommandFinished: onCommandFinishedEmitter.event,
		} as unknown as ICommandDetectionCapability;
		const strategy = store.add(new RichExecuteStrategy(
			instance,
			commandDetection,
			new TestConfigurationService(),
			createLogService(),
		));

		await strategy.execute('sandbox:echo hello', CancellationToken.None, 'tool-command-id', 'echo hello');

		strictEqual(actualCommandLine, 'sandbox:echo hello');
		strictEqual(actualCommandId, 'tool-command-id');
		strictEqual(actualCommandLineForMetadata, 'echo hello');
	});
});
