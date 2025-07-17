/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { TerminalInstance } from '../../../../terminal/browser/terminalInstance.js';
import { getSanitizedXtermOutput, waitForIdle, type ITerminalExecuteStrategy } from './executeStrategy.js';

/**
 * This strategy is used when no shell integration is available. There are very few extension APIs
 * available in this case. This uses similar strategies to the basic integration strategy, but
 * with `sendText` instead of `shellIntegration.executeCommand` and relying on idle events instead
 * of execution events.
 */
export class NoneExecuteStrategy implements ITerminalExecuteStrategy {
	readonly type = 'none';

	constructor(
		private readonly _instance: ITerminalInstance,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
	}

	async execute(commandLine: string, token: CancellationToken): Promise<{ result: string; exitCode?: number; error?: string }> {
		const store = new DisposableStore();
		try {
			const xtermCtor = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			const xterm = store.add(new xtermCtor({ allowProposedApi: true }));
			const onData = this._instance.onData;
			store.add(onData(e => xterm.write(e)));

			// Wait for the terminal to idle before executing the command
			this._logService.debug('RunInTerminalTool#None: Waiting for idle');
			await waitForIdle(onData, 1000);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			// Execute the command
			this._logService.debug(`RunInTerminalTool#None: Executing command line \`${commandLine}\``);
			this._instance.runCommand(commandLine, true);

			// Assume the command is done when it's idle
			this._logService.debug('RunInTerminalTool#None: Waiting for idle');
			await waitForIdle(onData, 1000);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			// Assemble final result - exit code is not available without shell integration
			const result = getSanitizedXtermOutput(xterm);
			return {
				result,
				exitCode: undefined,
			};
		} finally {
			store.dispose();
		}
	}
}
