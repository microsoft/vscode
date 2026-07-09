/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { isBash, isZsh } from '../../runInTerminalHelpers.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import type { ICommandLineRewriter, ICommandLineRewriterOptions, ICommandLineRewriterResult } from './commandLineRewriter.js';

/**
 * Rewriter that prepends a space to commands to prevent them from being added to shell history for
 * certain shells. This depends on $VSCODE_PREVENT_SHELL_HISTORY being handled in shell integration
 * scripts to set `HISTCONTROL=ignorespace` (bash) or `HIST_IGNORE_SPACE` (zsh) env vars. The
 * prepended space is harmless so we don't try to remove it if shell integration isn't functional.
 */
export class CommandLinePreventHistoryRewriter extends Disposable implements ICommandLineRewriter {
	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	rewrite(options: ICommandLineRewriterOptions): ICommandLineRewriterResult | undefined {
		const preventShellHistory = this._configurationService.getValue(TerminalChatAgentToolsSettingId.PreventShellHistory) === true;
		if (!preventShellHistory) {
			return undefined;
		}
		// Only bash and zsh use space prefix to exclude from history
		if (isBash(options.shell, options.os) || isZsh(options.shell, options.os)) {
			return {
				rewritten: ` ${options.commandLine}`,
				reasoning: 'Prepended with a space to exclude from shell history'
			};
		}
		return undefined;
	}
}
