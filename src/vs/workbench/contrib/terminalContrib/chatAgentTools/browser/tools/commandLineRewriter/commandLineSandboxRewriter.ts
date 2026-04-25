/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { isPowerShell } from '../../runInTerminalHelpers.js';
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../../treeSitterCommandParser.js';
import { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck } from '../../../common/terminalSandboxService.js';
import type { ICommandLineRewriter, ICommandLineRewriterOptions, ICommandLineRewriterResult } from './commandLineRewriter.js';

export class CommandLineSandboxRewriter extends Disposable implements ICommandLineRewriter {
	constructor(
		private readonly _treeSitterCommandParser: TreeSitterCommandParser,
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
	) {
		super();
	}

	async rewrite(options: ICommandLineRewriterOptions): Promise<ICommandLineRewriterResult | undefined> {
		const sandboxPrereqs = await this._sandboxService.checkForSandboxingPrereqs();
		if (!sandboxPrereqs.enabled || sandboxPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Config) {
			return undefined;
		}

		const wrappedCommand = await this._sandboxService.wrapCommand(options.commandLine, options.requestUnsandboxedExecution, options.shell, await this._parseCommandKeywords(options), options.cwd);
		return {
			rewritten: wrappedCommand.command,
			reasoning: wrappedCommand.requiresUnsandboxConfirmation ? 'Switched command to unsandboxed execution because the command includes a domain that is not in the sandbox allowlist' : 'Wrapped command for sandbox execution',
			forDisplay: options.commandLine, // show the command that is passed as input (after prior rewrites like cd prefix stripping)
			isSandboxWrapped: wrappedCommand.isSandboxWrapped,
			requiresUnsandboxConfirmation: wrappedCommand.requiresUnsandboxConfirmation,
			blockedDomains: wrappedCommand.blockedDomains,
			deniedDomains: wrappedCommand.deniedDomains,
		};
	}

	private async _parseCommandKeywords(options: ICommandLineRewriterOptions): Promise<string[]> {
		try {
			if (options.requestUnsandboxedExecution === true) {
				// if the user is requesting unsandboxed execution, not required to parse the command.
				return [];
			}
			const languageId = isPowerShell(options.shell, options.os)
				? TreeSitterCommandParserLanguage.PowerShell
				: TreeSitterCommandParserLanguage.Bash;
			return await this._treeSitterCommandParser.extractCommandKeywords(languageId, options.commandLine);
		} catch {
			return [];
		}
	}
}
