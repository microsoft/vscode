/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isNumber } from '../../../../../../base/common/types.js';
import type { ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { trackIdleOnPrompt, waitForIdle, type ITerminalExecuteStrategy, type ITerminalExecuteStrategyResult } from './executeStrategy.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { setupRecreatingStartMarker } from './strategyHelpers.js';

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
	private readonly _startMarker = new MutableDisposable<IXtermMarker>();

	private readonly _onDidCreateStartMarker = new Emitter<IXtermMarker | undefined>;
	public onDidCreateStartMarker: Event<IXtermMarker | undefined> = this._onDidCreateStartMarker.event;


	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _hasReceivedUserInput: () => boolean,
		private readonly _commandDetection: ICommandDetectionCapability,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
	}

	async execute(commandLine: string, token: CancellationToken, commandId?: string): Promise<ITerminalExecuteStrategyResult> {
		const store = new DisposableStore();

		try {
			const idlePromptPromise = trackIdleOnPrompt(this._instance, 1000, store);
			const onDone = Promise.race([
				Event.toPromise(this._commandDetection.onCommandFinished, store).then(e => {
					// When shell integration is basic, it means that the end execution event is
					// often misfired since we don't have command line verification. Because of this
					// we make sure the prompt is idle after the end execution event happens.
					this._log('onDone 1 of 2 via end event, waiting for short idle prompt');
					return idlePromptPromise.then(() => {
						this._log('onDone 2 of 2 via short idle prompt');
						return {
							'type': 'success',
							command: e
						} as const;
					});
				}),
				Event.toPromise(token.onCancellationRequested as Event<undefined>, store).then(() => {
					this._log('onDone via cancellation');
				}),
				Event.toPromise(this._instance.onDisposed, store).then(() => {
					this._log('onDone via terminal disposal');
					return { type: 'disposal' } as const;
				}),
				// A longer idle prompt event is used here as a catch all for unexpected cases where
				// the end event doesn't fire for some reason.
				trackIdleOnPrompt(this._instance, 3000, store).then(() => {
					this._log('onDone long idle prompt');
				}),
			]);

			// Ensure xterm is available
			this._log('Waiting for xterm');
			const xterm = await this._instance.xtermReadyPromise;
			if (!xterm) {
				throw new Error('Xterm is not available');
			}

			// Wait for the terminal to idle before executing the command
			this._log('Waiting for idle');
			await waitForIdle(this._instance.onData, 1000);

			setupRecreatingStartMarker(
				xterm,
				this._startMarker,
				m => this._onDidCreateStartMarker.fire(m),
				store,
				this._log.bind(this)
			);

			if (this._hasReceivedUserInput()) {
				this._log('Command timed out, sending SIGINT and retrying');
				// Send SIGINT (Ctrl+C)
				await this._instance.sendText('\x03', false);
				await waitForIdle(this._instance.onData, 100);
			}

			// Execute the command
			if (commandId) {
				this._log(`In basic execute strategy: skipping pre-bound command id ${commandId} because basic shell integration executes via sendText`);
			}
			// IMPORTANT: This uses `sendText` not `runCommand` since when basic shell integration
			// is used as it's more common to not recognize the prompt input which would result in
			// ^C being sent and also to return the exit code of 130 when from the shell when that
			// occurs.
			this._log(`Executing command line \`${commandLine}\``);
			this._instance.sendText(commandLine, true);

			// Wait for the next end execution event - note that this may not correspond to the actual
			// execution requested
			this._log('Waiting for done event');
			const onDoneResult = await onDone;
			if (onDoneResult && onDoneResult.type === 'disposal') {
				throw new Error('The terminal was closed');
			}
			const finishedCommand = onDoneResult && onDoneResult.type === 'success' ? onDoneResult.command : undefined;
			if (finishedCommand) {
				this._log(`Finished command id=${finishedCommand.id ?? 'none'} for requested=${commandId ?? 'none'}`);
			} else if (commandId) {
				this._log(`No finished command surfaced for requested=${commandId}`);
			}

			// Wait for the terminal to idle
			this._log('Waiting for idle');
			await waitForIdle(this._instance.onData, 1000);
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
					this._log('Fetched output via finished command');
					output = commandOutput;
				}
			}
			if (output === undefined) {
				try {
					output = xterm.getContentsAsText(this._startMarker.value, endMarker);
					this._log('Fetched output via markers');
				} catch {
					this._log('Failed to fetch output via markers');
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

	private _log(message: string) {
		this._logService.debug(`RunInTerminalTool#Basic: ${message}`);
	}
}
