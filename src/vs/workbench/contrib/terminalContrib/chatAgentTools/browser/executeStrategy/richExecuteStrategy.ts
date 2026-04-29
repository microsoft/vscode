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
import { isCI, isMacintosh } from '../../../../../../base/common/platform.js';
import type { ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService, type ITerminalLaunchError } from '../../../../../../platform/terminal/common/terminal.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { trackIdleOnPrompt, type ITerminalExecuteStrategy, type ITerminalExecuteStrategyResult } from './executeStrategy.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { createAltBufferPromise, setupRecreatingStartMarker, stripCommandEchoAndPrompt } from './strategyHelpers.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
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
 * This strategy is used when the terminal has rich shell integration/command detection is
 * available, meaning every sequence we rely upon should be exactly where we expect it to be. In
 * particular (`633;`) `A, B, E, C, D` all happen in exactly that order. While things still could go
 * wrong in this state, minimal verification is done in this mode since rich command detection is a
 * strong signal that it's behaving correctly.
 */
export class RichExecuteStrategy extends Disposable implements ITerminalExecuteStrategy {
	readonly type = 'rich';
	private readonly _startMarker = this._register(new MutableDisposable<IXtermMarker>());

	private readonly _onDidCreateStartMarker = this._register(new Emitter<IXtermMarker | undefined>);
	public onDidCreateStartMarker: Event<IXtermMarker | undefined> = this._onDidCreateStartMarker.event;

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _commandDetection: ICommandDetectionCapability,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
		super();
	}

	async execute(commandLine: string, token: CancellationToken, commandId?: string, commandLineForMetadata?: string): Promise<ITerminalExecuteStrategyResult> {
		const store = new DisposableStore();
		// Register the store with this strategy's disposable chain so that if
		// the strategy is disposed while execute() is still running (e.g. the
		// session is torn down), accumulated Event.toPromise listeners on
		// shared emitters like onCommandFinished are cleaned up immediately.
		this._register(store);
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

			// Subscribe to terminal lifecycle events BEFORE any awaits so that we
			// don't miss events that fire while we're waiting for xterm to be
			// ready (e.g. the pty exits during xtermReadyPromise resolution).
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
				Event.toPromise(this._instance.onExit, store).then((exitCodeOrError) => {
					this._log(`onDone via process exit (${formatExitCodeOrError(exitCodeOrError)})`);
					return { type: 'processExit', exitCodeOrError } as const;
				}),
				trackIdleOnPrompt(this._instance, idlePollInterval, store, idlePollInterval, this._logService).then(() => {
					this._log('onDone via idle prompt');
				}),
			]);

			// Ensure xterm is available
			this._log('Waiting for xterm');
			const xterm = await this._instance.xtermReadyPromise;
			if (!xterm) {
				throw new Error('Xterm is not available');
			}
			const alternateBufferPromise = createAltBufferPromise(xterm, store, this._log.bind(this));

			const markerRecreation = setupRecreatingStartMarker(
				xterm,
				this._startMarker,
				m => this._onDidCreateStartMarker.fire(m),
				store,
				this._log.bind(this)
			);

			// Execute the command
			this._log(`Executing command line \`${commandLine}\``);
			markerRecreation.dispose();
			const forceBracketedPasteMode = isMacintosh || isMultilineCommand(commandLine);
			this._instance.runCommand(commandLine, true, commandId, forceBracketedPasteMode, commandLineForMetadata);

			// Wait for the terminal to idle
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
					// On some platforms (e.g. Windows/PowerShell), shell integration
					// markers can misfire and getOutput() includes the command echo.
					// Strip it defensively — the function is a no-op when the output
					// is already clean.
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
			store.dispose();
		}
	}

	private _log(message: string) {
		const msg = `RunInTerminalTool#Rich: ${message}`;
		if (isCI) {
			this._logService.info(msg);
		} else {
			this._logService.debug(msg);
		}
	}
}
