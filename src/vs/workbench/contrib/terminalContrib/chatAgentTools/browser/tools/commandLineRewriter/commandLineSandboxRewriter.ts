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

		// Ensure sandbox config is initialized before wrapping
		const sandboxConfigPath = await this._sandboxService.getSandboxConfigPath();
		if (!sandboxConfigPath) {
			// If no sandbox config is available, run without sandboxing
			return undefined;
		}

		const wrappedCommand = this._sandboxService.wrapCommand(options.commandLine);
		return {
			rewritten: wrappedCommand,
			reasoning: 'Wrapped command for sandbox execution',
			forDisplay: options.commandLine, // show the command that is passed as input. In this case, the output from CommandLinePreventHistoryRewriter
		};
	}
}
