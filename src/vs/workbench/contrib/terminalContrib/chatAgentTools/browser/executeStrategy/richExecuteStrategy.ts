/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isNumber } from '../../../../../../base/common/types.js';
import type { ICommandDetectionCapability, ITerminalCommand } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { trackIdleOnPrompt, type ITerminalExecuteStrategy, type ITerminalExecuteStrategyResult } from './executeStrategy.js';

/**
 * This strategy is used when the terminal has rich shell integration/command detection is
 * available, meaning every sequence we rely upon should be exactly where we expect it to be. In
 * particular (`633;`) `A, B, E, C, D` all happen in exactly that order. While things still could go
 * wrong in this state, minimal verification is done in this mode since rich command detection is a
 * strong signal that it's behaving correctly.
 */
export class RichExecuteStrategy implements ITerminalExecuteStrategy {
	readonly type = 'rich';

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _commandDetection: ICommandDetectionCapability,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
	}

	async execute(commandLine: string, token: CancellationToken): Promise<ITerminalExecuteStrategyResult> {
		const store = new DisposableStore();
		try {
			// Ensure xterm is available
			this._logService.debug('RunInTerminalTool#None: Waiting for xterm');
			const xterm = await this._instance.xtermReadyPromise;
			if (!xterm) {
				throw new Error('Xterm is not available');
			}

			const onDone: Promise<ITerminalCommand | void> = Promise.race([
				Event.toPromise(this._commandDetection.onCommandFinished, store).then(e => {
					this._logService.debug('RunInTerminalTool#Rich: onDone via end event');
					return e;
				}),
				Event.toPromise(token.onCancellationRequested as Event<undefined>, store).then(() => {
					this._logService.debug('RunInTerminalTool#Rich: onDone via cancellation');
				}),
				trackIdleOnPrompt(this._instance, 1000, store).then(() => {
					this._logService.debug('RunInTerminalTool#Rich: onDone via idle prompt');
				}),
			]);

			// Record where the command started. If the marker gets disposed, re-created it where
			// the cursor is. This can happen in prompts where they clear the line and rerender it
			// like powerlevel10k's transient prompt
			let startMarker = store.add(xterm.raw.registerMarker());
			store.add(startMarker.onDispose(() => {
				this._logService.debug(`RunInTerminalTool#Rich: Start marker was disposed, recreating`);
				startMarker = xterm.raw.registerMarker();
			}));

			// Execute the command
			this._logService.debug(`RunInTerminalTool#Rich: Executing command line \`${commandLine}\``);
			this._instance.runCommand(commandLine, true);

			// Wait for the terminal to idle
			this._logService.debug(`RunInTerminalTool#Rich: Waiting for done event`);
			const finishedCommand = await onDone;
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const endMarker = store.add(xterm.raw.registerMarker());

			// Assemble final result
			let output: string | undefined;
			const additionalInformationLines: string[] = [];
			if (finishedCommand) {
				const commandOutput = finishedCommand?.getOutput();
				if (commandOutput !== undefined) {
					this._logService.debug('RunInTerminalTool#Rich: Fetched output via finished command');
					output = commandOutput;
				}
			}
			if (output === undefined) {
				try {
					output = xterm.getContentsAsText(startMarker, endMarker);
					this._logService.debug('RunInTerminalTool#Rich: Fetched output via markers');
				} catch {
					this._logService.debug('RunInTerminalTool#Basic: Failed to fetch output via markers');
					additionalInformationLines.push('Failed to retrieve command output');
				}
			}

			if (output !== undefined && output.trim().length === 0) {
				additionalInformationLines.push('Command produced no output');
			}

			const exitCode = finishedCommand?.exitCode;
			if (isNumber(exitCode) && exitCode > 0) {
				additionalInformationLines.push(`Command exited with code ${exitCode}`);
			}

			return {
				output,
				additionalInformation: additionalInformationLines.length > 0 ? additionalInformationLines.join('\n') : undefined,
				exitCode,
			};
		} finally {
			store.dispose();
		}
	}
}
