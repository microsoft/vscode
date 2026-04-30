/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isNumber } from '../../../../../../base/common/types.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import type { ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService, type ITerminalLaunchError } from '../../../../../../platform/terminal/common/terminal.js';
import { trackIdleOnPrompt, waitForIdle, type ITerminalExecuteStrategy, type ITerminalExecuteStrategyResult } from './executeStrategy.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { createAltBufferPromise, setupRecreatingStartMarker, stripCommandEchoAndPrompt } from './strategyHelpers.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
import { isMultilineCommand } from '../runInTerminalHelpers.js';

function isTerminalLaunchError(value: unknown): value is ITerminalLaunchError {
	return typeof value === 'object' && value !== null && 'message' in value;
}

function formatExitCodeOrError(exitCodeOrError: number | ITerminalLaunchError | undefined): string {
	if (isTerminalLaunchError(exitCodeOrError)) {
		return `launch error: ${exitCodeOrError.message}${exitCodeOrError.code !== undefined ? `, code=${exitCodeOrError.code}` : ''}`;
	}
	return `code=${exitCodeOrError}`;
}

function extractExitCode(exitCodeOrError: number | ITerminalLaunchError | undefined): number | undefined {
	if (isNumber(exitCodeOrError)) {
		return exitCodeOrError;
	}
	if (isTerminalLaunchError(exitCodeOrError)) {
		return exitCodeOrError.code;
	}
	return undefined;
}

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
export class BasicExecuteStrategy extends Disposable implements ITerminalExecuteStrategy {
	readonly type = 'basic';
	private readonly _startMarker = this._register(new MutableDisposable<IXtermMarker>());

	private readonly _onDidCreateStartMarker = this._register(new Emitter<IXtermMarker | undefined>);
	public onDidCreateStartMarker: Event<IXtermMarker | undefined> = this._onDidCreateStartMarker.event;

	/**
	 * Tracks per-execute() DisposableStores so they can be cleaned up if the
	 * strategy is disposed mid-flight, AND removed from this collection on
	 * successful completion to avoid accumulating stale references when
	 * execute() is invoked many times on the same strategy instance.
	 */
	private readonly _executionStores = this._register(new DisposableStore());

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _hasReceivedUserInput: () => boolean,
		private readonly _commandDetection: ICommandDetectionCapability,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
		super();
	}

	async execute(commandLine: string, token: CancellationToken, commandId?: string, _commandLineForMetadata?: string): Promise<ITerminalExecuteStrategyResult> {
		const store = new DisposableStore();
		// Track with strategy lifetime so listeners are cleaned up if the
		// strategy is disposed while execute() is still running. Using a
		// dedicated DisposableStore (rather than this._register) lets us
		// remove the entry on completion so we don't accumulate stale
		// references across many execute() calls.
		this._executionStores.add(store);

		try {
			// If the terminal is already disposed or its pty has already exited
			// (e.g. the shell from a previous command died before this one was
			// requested), Event.toPromise(onExit/onDisposed) will subscribe to an
			// emitter that has already fired and never resolves, hanging the
			// run-in-terminal tool until the agent's outer timeout. Detect this
			// up front and resolve immediately with the captured exit code.
			if (this._instance.isDisposed) {
				this._log('Terminal already disposed at strategy entry');
				throw new Error('The terminal was closed');
			}
			if (this._instance.exitCode !== undefined) {
				this._log(`Terminal pty already exited at strategy entry (code=${this._instance.exitCode})`);
				return {
					output: undefined,
					exitCode: this._instance.exitCode,
					additionalInformation: `Command exited with code ${this._instance.exitCode}`,
				};
			}

			const idlePollInterval = this._configurationService.getValue<number>(TerminalChatAgentToolsSettingId.IdlePollInterval) ?? 1000;

			// Capture any command that is already executing in the terminal at
			// strategy entry. We may send ETX (Ctrl+C) below to clear pending
			// input from a prior interaction, which kills that prior command
			// and produces an `onCommandFinished` event with exit code 130.
			// Without this filter, the race below would resolve with the prior
			// command's finished event before our new command has even started —
			// causing the new command to be reported as having instantly exited
			// 130 and cascading to every subsequent command on the same terminal.
			const staleExecutingCommand = this._commandDetection.executingCommandObject;
			const onCommandFinishedFiltered = staleExecutingCommand
				? Event.filter(this._commandDetection.onCommandFinished, e => e !== staleExecutingCommand, store)
				: this._commandDetection.onCommandFinished;

			const idlePromptPromise = trackIdleOnPrompt(this._instance, idlePollInterval, store, idlePollInterval, this._logService);
			const onDone = Promise.race([
				Event.toPromise(onCommandFinishedFiltered, store).then(e => {
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
				Event.toPromise(this._instance.onExit, store).then((exitCodeOrError) => {
					this._log(`onDone via process exit (${formatExitCodeOrError(exitCodeOrError)})`);
					return { type: 'processExit', exitCodeOrError } as const;
				}),
				// A longer idle prompt event is used here as a catch all for unexpected cases where
				// the end event doesn't fire for some reason.
				trackIdleOnPrompt(this._instance, idlePollInterval * 3, store, idlePollInterval, this._logService).then(() => {
					this._log('onDone long idle prompt');
				}),
			]);

			// Ensure xterm is available
			this._log('Waiting for xterm');
			const xterm = await this._instance.xtermReadyPromise;
			if (!xterm) {
				throw new Error('Xterm is not available');
			}
			const alternateBufferPromise = createAltBufferPromise(xterm, store, this._log.bind(this));

			// Wait for the terminal to idle before executing the command
			this._log('Waiting for idle');
			await waitForIdle(this._instance.onData, idlePollInterval);

			const markerRecreation = setupRecreatingStartMarker(
				xterm,
				this._startMarker,
				m => this._onDidCreateStartMarker.fire(m),
				store,
				this._log.bind(this)
			);

			if (this._hasReceivedUserInput()) {
				// Only send SIGINT (Ctrl+C) when shell integration confirms a previous
				// command is still executing. Sending Ctrl+C at an idle prompt can be
				// misinterpreted by the shell as cancelling the command we are about
				// to send via sendText, producing spurious "Command exited with code
				// 130" results for what should be the next, unrelated command.
				if (this._commandDetection.executingCommandObject !== undefined) {
					this._log('Previous command still executing with pending input, sending SIGINT before retrying');
					await this._instance.sendText('\x03', false);
					await waitForIdle(this._instance.onData, 100);
				} else {
					// Use Ctrl+U (kill line) to clear any pending input on the prompt
					// without killing any running command. No-op on a clean prompt.
					this._log('Prompt is idle; clearing pending input with Ctrl+U instead of SIGINT');
					await this._instance.sendText('\x15', false);
					await waitForIdle(this._instance.onData, 100);
				}
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
			markerRecreation.dispose();
			const forceBracketedPasteMode = isMacintosh || isMultilineCommand(commandLine);
			this._instance.sendText(commandLine, true, forceBracketedPasteMode);

			// Wait for the next end execution event - note that this may not correspond to the actual
			// execution requested
			this._log('Waiting for done event');
			const onDoneResult = await Promise.race([onDone, alternateBufferPromise.then(() => ({ type: 'alternateBuffer' } as const))]);
			if (onDoneResult && onDoneResult.type === 'disposal') {
				throw new Error('The terminal was closed');
			}
			if (onDoneResult && onDoneResult.type === 'alternateBuffer') {
				this._log('Detected alternate buffer entry, skipping output capture');
				return {
					output: undefined,
					exitCode: undefined,
					error: 'alternateBuffer',
					didEnterAltBuffer: true
				};
			}
			const finishedCommand = onDoneResult && onDoneResult.type === 'success' ? onDoneResult.command : undefined;
			if (finishedCommand) {
				this._log(`Finished command id=${finishedCommand.id ?? 'none'} for requested=${commandId ?? 'none'}`);
			} else if (commandId) {
				this._log(`No finished command surfaced for requested=${commandId}`);
			}

			// Wait for the terminal to idle, but skip if the process already exited
			// since no more data will arrive.
			if (!(onDoneResult && onDoneResult.type === 'processExit')) {
				this._log('Waiting for idle');
				await waitForIdle(this._instance.onData, idlePollInterval);
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
					output = stripCommandEchoAndPrompt(commandOutput, commandLine, this._log.bind(this));
				}
			}
			if (output === undefined) {
				try {
					output = xterm.getContentsAsText(this._startMarker.value, endMarker);
					this._log('Fetched output via markers');

					// The marker-based output includes the command echo and trailing
					// prompt lines. Strip them to isolate the actual command output.
					if (output !== undefined) {
						output = stripCommandEchoAndPrompt(output, commandLine, this._log.bind(this));
					}
				} catch {
					this._log('Failed to fetch output via markers');
					additionalInformationLines.push('Failed to retrieve command output');
				}
			}

			if (output !== undefined && output.trim().length === 0) {
				additionalInformationLines.push('Command produced no output');
			}

			// Determine exit code from shell integration or from the process exit event
			let exitCode = finishedCommand?.exitCode;
			if (exitCode === undefined && onDoneResult && onDoneResult.type === 'processExit') {
				exitCode = extractExitCode(onDoneResult.exitCodeOrError);
			}
			if (isNumber(exitCode) && exitCode > 0) {
				additionalInformationLines.push(`Command exited with code ${exitCode}`);
			}

			return {
				output,
				additionalInformation: additionalInformationLines.length > 0 ? additionalInformationLines.join('\n') : undefined,
				exitCode,
			};
		} finally {
			this._executionStores.delete(store);
		}
	}

	private _log(message: string) {
		this._logService.debug(`RunInTerminalTool#Basic: ${message}`);
	}
}
