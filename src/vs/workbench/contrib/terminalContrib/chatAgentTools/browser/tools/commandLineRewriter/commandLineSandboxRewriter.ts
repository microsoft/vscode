/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { ITerminalSandboxService } from '../../../common/terminalSandboxService.js';
import type { ICommandLineRewriter, ICommandLineRewriterOptions, ICommandLineRewriterResult } from './commandLineRewriter.js';

export class CommandLineSandboxRewriter extends Disposable implements ICommandLineRewriter {
	constructor(
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
	) {
		super();
	}

	async rewrite(options: ICommandLineRewriterOptions): Promise<ICommandLineRewriterResult | undefined> {
		if (!(await this._sandboxService.isEnabled())) {
			return undefined;
		}

		const wrappedCommand = await this._sandboxService.wrapCommand(options.commandLine);
		if (wrappedCommand === options.commandLine) {
			// If the sandbox service returns the same command, it means it didn't actually wrap it for some reason. In that case, we should return undefined to allow other rewriters to run, instead of returning a result that claims the command was rewritten but doesn't actually change anything.
			return undefined;
		}
		return {
			rewritten: wrappedCommand,
			reasoning: 'Wrapped command for sandbox execution',
			forDisplay: options.commandLine, // show the command that is passed as input. In this case, the output from CommandLinePreventHistoryRewriter
		};
	}
}
