/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isNumber } from '../../../../../../base/common/types.js';
import type { ICommandDetectionCapability, ITerminalCommand } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { trackIdleOnPrompt, type ITerminalExecuteStrategy, type ITerminalExecuteStrategyResult } from './executeStrategy.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { setupRecreatingStartMarker } from './strategyHelpers.js';

const COMMAND_EXECUTED_TIMEOUT_MS = 1000;

/**
 * This strategy is used when the terminal has rich shell integration/command detection is
 * available, meaning every sequence we rely upon should be exactly where we expect it to be. In
 * particular (`633;`) `A, B, E, C, D` all happen in exactly that order. While things still could go
 * wrong in this state, minimal verification is done in this mode since rich command detection is a
 * strong signal that it's behaving correctly.
 */
export class RichExecuteStrategy implements ITerminalExecuteStrategy {
	readonly type = 'rich';
	private readonly _startMarker = new MutableDisposable<IXtermMarker>();

	private readonly _onDidCreateStartMarker = new Emitter<IXtermMarker | undefined>;
	public onDidCreateStartMarker: Event<IXtermMarker | undefined> = this._onDidCreateStartMarker.event;

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _commandDetection: ICommandDetectionCapability,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
	}

	async execute(commandLine: string, token: CancellationToken, commandId?: string): Promise<ITerminalExecuteStrategyResult> {
		const store = new DisposableStore();
		try {
			const trimmedCommandLine = commandLine.replace(/\r?\n$/, '');
			const previousCommandTimestamp = this._commandDetection.commands.length > 0 ? this._commandDetection.commands[this._commandDetection.commands.length - 1].timestamp : 0;
			const commandExecuted = new DeferredPromise<void>();
			let commandExecutedTimedOut = false;
			let commandExecutedTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
			const clearCommandExecutedTimeout = () => {
				if (commandExecutedTimeoutHandle !== undefined) {
					clearTimeout(commandExecutedTimeoutHandle);
					commandExecutedTimeoutHandle = undefined;
				}
			};
			const scheduleCommandExecutedTimeout = () => {
				if (commandExecuted.isSettled || commandExecutedTimeoutHandle !== undefined) {
					return;
				}
				commandExecutedTimeoutHandle = setTimeout(async () => {
					if (!commandExecuted.isSettled) {
						this._log(`Command executed event not received within ${COMMAND_EXECUTED_TIMEOUT_MS}ms, proceeding anyway`);
						commandExecutedTimedOut = true;
						commandExecuted.complete(undefined);
						await this._instance.sendText('\x03', false).catch((error: unknown) => {
							const message = error instanceof Error ? error.message : String(error);
							this._log(`Failed to send SIGINT after timeout: ${message}`);
						});

					}
				}, COMMAND_EXECUTED_TIMEOUT_MS);
			};
			store.add({ dispose: clearCommandExecutedTimeout });
			store.add(this._commandDetection.onCommandExecuted(command => {
				if (command.timestamp <= previousCommandTimestamp) {
					return;
				}
				if (commandId && command.id) {
					if (command.id !== commandId) {
						return;
					}
				} else if (command.command && command.command !== trimmedCommandLine) {
					return;
				}
				if (commandExecuted.isSettled) {
					return;
				}
				commandExecuted.complete();
				clearCommandExecutedTimeout();
			}));
			store.add(token.onCancellationRequested(() => commandExecuted.cancel()));

			// Ensure xterm is available
			this._log('Waiting for xterm');
			const xterm = await this._instance.xtermReadyPromise;
			if (!xterm) {
				throw new Error('Xterm is not available');
			}

			const onDone = Promise.race([
				Event.toPromise(this._commandDetection.onCommandFinished, store).then(e => {
					this._log('onDone via end event');
					return {
						'type': 'success',
						command: e
					} as const;
				}),
				Event.toPromise(token.onCancellationRequested as Event<undefined>, store).then(() => {
					this._log('onDone via cancellation');
				}),
				Event.toPromise(this._instance.onDisposed, store).then(() => {
					this._log('onDone via terminal disposal');
					return { type: 'disposal' } as const;
				}),
				trackIdleOnPrompt(this._instance, 1000, store).then(() => {
					this._log('onDone via idle prompt');
				}),
			]);

			setupRecreatingStartMarker(
				xterm,
				this._startMarker,
				m => this._onDidCreateStartMarker.fire(m),
				store,
				this._log.bind(this)
			);

			// Execute the command
			this._log(`Executing command line \`${commandLine}\``);
			await this._instance.runCommand(commandLine, true, commandId).catch((error: unknown) => {
				const message = error instanceof Error ? error.message : String(error);
				this._log(`runCommand rejected: ${message}`);
				if (!commandExecuted.isSettled) {
					commandExecuted.error(error);
				}
			});
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			this._log('Waiting for command executed event');
			scheduleCommandExecutedTimeout();
			let commandExecutedError: unknown;
			try {
				await commandExecuted.p;
			} catch (error) {
				commandExecutedError = error;
			} finally {
				clearCommandExecutedTimeout();
			}
			if (commandExecutedError) {
				throw commandExecutedError;
			}

			let finishedCommand: ITerminalCommand | undefined;
			if (commandExecutedTimedOut) {
				this._log('Skipping done event wait after timeout; waiting for idle prompt');
				await trackIdleOnPrompt(this._instance, 1000, store);
			} else {
				this._log('Waiting for done event');
				const onDoneResult = await onDone;
				if (onDoneResult && onDoneResult.type === 'disposal') {
					throw new Error('The terminal was closed');
				}
				finishedCommand = onDoneResult && onDoneResult.type === 'success' ? onDoneResult.command : undefined;
			}

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
			if (commandExecutedTimedOut) {
				additionalInformationLines.push('Shell integration did not confirm command execution');
			}

			return {
				output,
				additionalInformation: additionalInformationLines.length > 0 ? additionalInformationLines.join('\n') : undefined,
				exitCode,
				error: commandExecutedTimedOut ? 'Command execution timed out before shell confirmation. Output may be incomplete.' : undefined,
			};
		} finally {
			store.dispose();
		}
	}

	private _log(message: string) {
		this._logService.debug(`RunInTerminalTool#Rich: ${message}`);
	}
}
