/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import type { ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { TerminalInstance } from '../../../../terminal/browser/terminalInstance.js';
import { getSanitizedXtermOutput, trackIdleOnPrompt, waitForIdle, type ITerminalExecuteStrategy } from './executeStrategy.js';

/**
 * This strategy is used when shell integration is enabled, but rich command detection was not
 * declared by the shell script. This is the large spectrum between rich command detection and no
 * shell integration, here are some problems that are expected:
 *
 * - `133;C` command executed may not happen.
 * - `633;E` comamnd line reporting will likely not happen, so the command line contained in the
 *   execution start and end events will be of low confidence and chances are it will be wrong.
 * - Execution tracking may be incorrect, particularly when `executeCommand` calls are overlapped,
 *   such as Python activating the environment at the same time as Copilot executing a command. So
 *   the end event for the execution may actually correspond to a different command.
 *
 * This strategy focuses on trying to get the most accurate output given these limitations and
 * unknowns. Basically we cannot fully trust the extension APIs in this case, so polling of the data
 * stream is used to detect idling, and we listen to the terminal's data stream instead of the
 * execution's data stream.
 *
 * This is best effort with the goal being the output is accurate, though it may contain some
 * content above and below the command output, such as prompts or even possibly other command
 * output. We lean on the LLM to be able to differentiate the actual output from prompts and bad
 * output when it's not ideal.
 */
export class BasicExecuteStrategy implements ITerminalExecuteStrategy {
	readonly type = 'basic';

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _commandDetection: ICommandDetectionCapability,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
	}

	async execute(commandLine: string, token: CancellationToken): Promise<{ result: string; exitCode?: number; error?: string }> {
		const store = new DisposableStore();
		try {
			const idlePromptPromise = trackIdleOnPrompt(this._instance, 1000, store);
			const onDone = Promise.race([
				Event.toPromise(this._commandDetection.onCommandFinished, store).then(e => {
					// When shell integration is basic, it means that the end execution event is
					// often misfired since we don't have command line verification. Because of this
					// we make sure the prompt is idle after the end execution event happens.
					this._logService.debug('RunInTerminalTool#Basic: onDone 1 of 2 via end event, waiting for short idle prompt');
					return idlePromptPromise.then(() => {
						this._logService.debug('RunInTerminalTool#Basic: onDone 2 of 2 via short idle prompt');
						return e;
					});
				}),
				Event.toPromise(token.onCancellationRequested as Event<undefined>, store).then(() => {
					this._logService.debug('RunInTerminalTool#Basic: onDone via cancellation');
				}),
				// A longer idle prompt event is used here as a catch all for unexpected cases where
				// the end event doesn't fire for some reason.
				trackIdleOnPrompt(this._instance, 3000, store).then(() => {
					this._logService.debug('RunInTerminalTool#Basic: onDone long idle prompt');
				}),
			]);

			const xtermCtor = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			const xterm = store.add(new xtermCtor({ allowProposedApi: true }));
			const onData = this._instance.onData;
			store.add(onData(e => xterm.write(e)));

			// Wait for the terminal to idle before executing the command
			this._logService.debug('RunInTerminalTool#Basic: Waiting for idle');
			await waitForIdle(onData, 1000);

			// The TerminalShellExecution.read is only reliable when rich command detection
			// is available
			this._logService.debug(`RunInTerminalTool#Basic: Executing command line \`${commandLine}\``);
			this._instance.runCommand(commandLine, true);

			// Wait for the next end execution event - note that this may not correspond to the actual
			// execution requested
			const doneData = await onDone;

			// Wait for the terminal to idle
			this._logService.debug('RunInTerminalTool#Basic: Waiting for idle');
			await waitForIdle(onData, 1000);

			// Assemble final result
			let result = getSanitizedXtermOutput(xterm);
			if (doneData && typeof doneData.exitCode === 'number' && doneData.exitCode > 0) {
				result += `\n\nCommand exited with code ${doneData.exitCode}`;
			}
			return {
				result,
				exitCode: doneData?.exitCode,
			};
		} finally {
			store.dispose();
		}
	}
}
