/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { waitForIdle, waitForIdleWithPromptHeuristics, type ITerminalExecuteStrategy, type ITerminalExecuteStrategyResult } from './executeStrategy.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';

/**
 * This strategy is used when no shell integration is available. There are very few extension APIs
 * available in this case. This uses similar strategies to the basic integration strategy, but
 * with `sendText` instead of `shellIntegration.executeCommand` and relying on idle events instead
 * of execution events.
 */
export class NoneExecuteStrategy implements ITerminalExecuteStrategy {
	readonly type = 'none';
	private _startMarker: IXtermMarker | undefined;


	private readonly _onDidCreateStartMarker = new Emitter<IXtermMarker | undefined>;
	public onDidCreateStartMarker: Event<IXtermMarker | undefined> = this._onDidCreateStartMarker.event;

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _hasReceivedUserInput: () => boolean,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
	}

	async execute(commandLine: string, token: CancellationToken): Promise<ITerminalExecuteStrategyResult> {
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

			// Wait for the terminal to idle before executing the command
			this._log('Waiting for idle');
			await waitForIdle(this._instance.onData, 1000);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			// Record where the command started. If the marker gets disposed, re-created it where
			// the cursor is. This can happen in prompts where they clear the line and rerender it
			// like powerlevel10k's transient prompt
			this._onDidCreateStartMarker.fire(this._startMarker = store.add(xterm.raw.registerMarker()));
			store.add(this._startMarker.onDispose(() => {
				this._log(`Start marker was disposed, recreating`);
				this._onDidCreateStartMarker.fire(this._startMarker = store.add(xterm.raw.registerMarker()));
			}));

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
			this._instance.sendText(commandLine, true);

			// Assume the command is done when it's idle
			this._log('Waiting for idle with prompt heuristics');
			const promptResult = await waitForIdleWithPromptHeuristics(this._instance.onData, this._instance, 1000, 10000);
			this._log(`Prompt detection result: ${promptResult.detected ? 'detected' : 'not detected'} - ${promptResult.reason}`);

			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const endMarker = store.add(xterm.raw.registerMarker());

			// Assemble final result - exit code is not available without shell integration
			let output: string | undefined;
			const additionalInformationLines: string[] = [];
			try {
				output = xterm.getContentsAsText(this._startMarker, endMarker);
				this._log('Fetched output via markers');
			} catch {
				this._log('Failed to fetch output via markers');
				additionalInformationLines.push('Failed to retrieve command output');
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
