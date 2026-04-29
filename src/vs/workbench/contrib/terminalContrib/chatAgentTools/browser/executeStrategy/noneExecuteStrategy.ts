/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { waitForIdle, waitForIdleWithPromptHeuristics, type ITerminalExecuteStrategy, type ITerminalExecuteStrategyResult } from './executeStrategy.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { createAltBufferPromise, setupRecreatingStartMarker, stripCommandEchoAndPrompt } from './strategyHelpers.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
import { isMultilineCommand } from '../runInTerminalHelpers.js';

/**
 * This strategy is used when no shell integration is available. There are very few extension APIs
 * available in this case. This uses similar strategies to the basic integration strategy, but
 * with `sendText` instead of `shellIntegration.executeCommand` and relying on idle events instead
 * of execution events.
 */
export class NoneExecuteStrategy extends Disposable implements ITerminalExecuteStrategy {
	readonly type = 'none';
	private readonly _startMarker = this._register(new MutableDisposable<IXtermMarker>());


	private readonly _onDidCreateStartMarker = this._register(new Emitter<IXtermMarker | undefined>);
	public onDidCreateStartMarker: Event<IXtermMarker | undefined> = this._onDidCreateStartMarker.event;

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _hasReceivedUserInput: () => boolean,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
		super();
	}

	async execute(commandLine: string, token: CancellationToken, _commandId?: string, _commandLineForMetadata?: string): Promise<ITerminalExecuteStrategyResult> {
		const store = new DisposableStore();
		try {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			// Ensure xterm is available
			this._log('Waiting for xterm');
			const xterm = await this._instance.xtermReadyPromise;
			if (!xterm) {
				throw new Error('Xterm is not available');
			}
			const alternateBufferPromise = createAltBufferPromise(xterm, store, this._log.bind(this));

			const idlePollInterval = this._configurationService.getValue<number>(TerminalChatAgentToolsSettingId.IdlePollInterval) ?? 1000;

			// Wait for the terminal to idle before executing the command
			this._log('Waiting for idle');
			await waitForIdle(this._instance.onData, idlePollInterval);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			const markerRecreation = setupRecreatingStartMarker(
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
			// IMPORTANT: This uses `sendText` not `runCommand` since when no shell integration
			// is used as sending ctrl+c before a shell is initialized (eg. PSReadLine) can result
			// in failure (https://github.com/microsoft/vscode/issues/258989)
			this._log(`Executing command line \`${commandLine}\``);
			markerRecreation.dispose();
			const startLine = this._startMarker.value?.line;
			const forceBracketedPasteMode = isMacintosh || isMultilineCommand(commandLine);
			this._instance.sendText(commandLine, true, forceBracketedPasteMode);

			// Wait for the cursor to move past the command line before
			// starting idle detection. Without this, the idle poll may
			// resolve immediately on the existing prompt if the shell
			// hasn't started processing the command yet.
			if (startLine !== undefined) {
				this._log('Waiting for cursor to move past start line');
				const cursorMovedPromise = new Promise<void>(resolve => {
					const check = () => {
						const buffer = xterm.raw.buffer.active;
						const cursorLine = buffer.baseY + buffer.cursorY;
						if (cursorLine > startLine) {
							resolve();
						}
					};
					const listener = this._instance.onData(() => check());
					store.add(listener);
					check();
				});

				const cursorMoveTimeout = new Promise<'timeout'>(resolve => {
					const handle = setTimeout(() => resolve('timeout'), 1000);
					store.add({ dispose: () => clearTimeout(handle) });
				});

				const raceResult = await Promise.race([cursorMovedPromise, cursorMoveTimeout]);
				if (raceResult === 'timeout') {
					this._log('Cursor did not move past start line before timeout, proceeding with idle detection');
				}
			}


			// Assume the command is done when it's idle
			this._log('Waiting for idle with prompt heuristics');
			const promptResultOrAltBuffer = await Promise.race([
				waitForIdleWithPromptHeuristics(this._instance.onData, this._instance, idlePollInterval, idlePollInterval * 10),
				alternateBufferPromise.then(() => 'alternateBuffer' as const)
			]);
			if (promptResultOrAltBuffer === 'alternateBuffer') {
				this._log('Detected alternate buffer entry, skipping output capture');
				return {
					output: undefined,
					additionalInformation: undefined,
					exitCode: undefined,
					error: 'alternateBuffer',
					didEnterAltBuffer: true,
				};
			}
			const promptResult = promptResultOrAltBuffer;
			this._log(`Prompt detection result: ${promptResult.detected ? 'detected' : 'not detected'} - ${promptResult.reason}`);

			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const endMarker = store.add(xterm.raw.registerMarker());

			// Assemble final result - exit code is not available without shell integration
			let output: string | undefined;
			const additionalInformationLines: string[] = [];
			try {
				output = xterm.getContentsAsText(this._startMarker.value, endMarker);
				this._log('Fetched output via markers');

				// The marker-based output includes the command echo (the line where the
				// command was typed) and the next prompt line. Strip them to isolate
				// only the actual command output. The first line always contains the
				// command echo (since the start marker is placed at the cursor before
				// sendText), and trailing lines that look like shell prompts are removed.
				if (output !== undefined) {
					output = stripCommandEchoAndPrompt(output, commandLine, this._log.bind(this));
				}
			} catch {
				this._log('Failed to fetch output via markers');
				additionalInformationLines.push('Failed to retrieve command output');
			}

			if (output !== undefined && output.trim().length === 0) {
				additionalInformationLines.push('Command produced no output');
			}

			return {
				output,
				additionalInformation: additionalInformationLines.length > 0 ? additionalInformationLines.join('\n') : undefined,
				exitCode: undefined,
			};
		} finally {
			store.dispose();
		}
	}

	private _log(message: string) {
		this._logService.debug(`RunInTerminalTool#None: ${message}`);
	}
}
