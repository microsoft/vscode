/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck } from '../../../common/terminalSandboxService.js';
import type { ICommandLineRewriter, ICommandLineRewriterOptions, ICommandLineRewriterResult } from './commandLineRewriter.js';

export class CommandLineSandboxRewriter extends Disposable implements ICommandLineRewriter {
	constructor(
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
	) {
		super();
	}

	async rewrite(options: ICommandLineRewriterOptions): Promise<ICommandLineRewriterResult | undefined> {
		const sandboxPrereqs = await this._sandboxService.checkForSandboxingPrereqs();
		if (!sandboxPrereqs.enabled || sandboxPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Config) {
			return undefined;
		}

		const wrappedCommand = this._sandboxService.wrapCommand(options.commandLine, options.requestUnsandboxedExecution);
		return {
			rewritten: wrappedCommand,
			reasoning: 'Wrapped command for sandbox execution',
			forDisplay: options.commandLine, // show the command that is passed as input (after prior rewrites like cd prefix stripping)
			isSandboxWrapped: true,
		};
	}
}
