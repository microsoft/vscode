/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isNumber } from '../../../../../../base/common/types.js';
import type { ICommandDetectionCapability, ITerminalCommand } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { sanitizeTerminalOutput } from '../runInTerminalHelpers.js';
import { trackIdleOnPrompt, type ITerminalExecuteStrategy } from './executeStrategy.js';

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
		// TODO: Use copilot
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
	}

	async execute(commandLine: string, token: CancellationToken): Promise<{ result: string; exitCode?: number; error?: string }> {
		const store = new DisposableStore();
		try {
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

			this._logService.debug(`RunInTerminalTool#Rich: Executing command line \`${commandLine}\``);
			// IMPORTANT: This must not be awaited, otherwise data events could be missed
			this._instance.runCommand(commandLine, true);

			// TODO: Start listening to data
			this._logService.debug(`RunInTerminalTool#Rich: Reading data stream`);

			// const dataStream = execution.read();
			const dataEvents: string[] = [];

			// HACK: Read the data stream in a separate async function to avoid the off chance the
			// data stream doesn't resolve which can block the tool from ever finishing.
			enum DataStreamState {
				Reading,
				Timeout,
				Done,
			}
			let dataStreamState = DataStreamState.Reading as DataStreamState;
			// const dataStreamDone = new DeferredPromise<void>();
			// (async () => {
			// 	for await (const chunk of dataStream) {
			// 		checkCancellation(token);
			// 		if (dataStreamState === DataStreamState.Timeout) {
			// 			return;
			// 		}
			// 		result += chunk;
			// 	}
			// 	this._logService.debug('RunInTerminalTool#Rich: Data stream flushed');
			// 	dataStreamState = DataStreamState.Done;
			// 	dataStreamDone.complete();
			// })();
			this._instance.onData(e => dataEvents.push(e));

			this._logService.debug(`RunInTerminalTool#Rich: Waiting for done event`);
			const finishedCommand = await onDone;

			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			// Give a little time for the data stream to flush before abandoning it
			if (dataStreamState !== DataStreamState.Done) {
				await Promise.race([
					Event.toPromise(this._commandDetection.onCommandFinished, store),
					// dataStreamDone.p,
					timeout(500),
				]);
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				if (dataStreamState === DataStreamState.Reading) {
					dataStreamState = DataStreamState.Timeout;
					this._logService.debug('RunInTerminalTool#Rich: Data stream timed out');
				}
			}

			let result: string | undefined;
			if (finishedCommand) {
				const commandOutput = finishedCommand?.getOutput();
				if (commandOutput !== undefined) {
					this._logService.debug('RunInTerminalTool#Rich: Fetched output via finished command');
					result = commandOutput;
				}
			}
			if (result === undefined) {
				this._logService.debug('RunInTerminalTool#Rich: Fetched output via data events');
				result = sanitizeTerminalOutput(dataEvents.join(''));
			}

			if (!result.trim()) {
				result = 'Command produced no output';
			}

			const exitCode = finishedCommand?.exitCode;
			if (isNumber(exitCode) && exitCode > 0) {
				result += `\n\nCommand exited with code ${exitCode}`;
			}

			return {
				result,
				exitCode,
			};
		} finally {
			store.dispose();
		}
	}
}
