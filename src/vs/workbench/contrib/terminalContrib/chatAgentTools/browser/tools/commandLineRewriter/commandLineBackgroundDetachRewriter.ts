/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { isPowerShell } from '../../runInTerminalHelpers.js';
import type { ICommandLineRewriter, ICommandLineRewriterOptions, ICommandLineRewriterResult } from './commandLineRewriter.js';

/**
 * Wraps background terminal commands so their processes survive VS Code shutdown.
 *
 * On POSIX (bash/zsh/fish), uses `nohup <command> &` to ignore SIGHUP and
 * detach from the terminal's process group.
 *
 * On Windows (PowerShell), uses `Start-Process` to create a process outside
 * the terminal's process tree.
 *
 * Gated behind the {@link TerminalChatAgentToolsSettingId.DetachBackgroundProcesses} setting
 * (default off) to avoid orphaned processes in normal usage.
 */
export class CommandLineBackgroundDetachRewriter extends Disposable implements ICommandLineRewriter {
	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	rewrite(options: ICommandLineRewriterOptions): ICommandLineRewriterResult | undefined {
		if (!options.isBackground) {
			return undefined;
		}

		if (!this._configurationService.getValue(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses)) {
			return undefined;
		}

		if (options.os === OperatingSystem.Windows) {
			return this._rewriteForPowerShell(options);
		}

		return this._rewriteForPosix(options);
	}

	private _rewriteForPosix(options: ICommandLineRewriterOptions): ICommandLineRewriterResult {
		// If the command already ends with a single trailing `&` (background operator,
		// as opposed to `&&` for command chaining), don't append another one.
		const trimmed = options.commandLine.trimEnd();
		const endsWithBackgroundAmp = /(?:^|[^&])&$/.test(trimmed);
		const rewritten = endsWithBackgroundAmp
			? `nohup ${trimmed}`
			: `nohup ${options.commandLine} &`;
		return {
			rewritten,
			reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
			forDisplay: options.commandLine,
		};
	}

	private _rewriteForPowerShell(options: ICommandLineRewriterOptions): ICommandLineRewriterResult | undefined {
		if (!isPowerShell(options.shell, options.os)) {
			return undefined;
		}

		// Escape double quotes for PowerShell string
		const escapedCommand = options.commandLine.replace(/"/g, '\\"');

		return {
			rewritten: `Start-Process -WindowStyle Hidden -FilePath "${options.shell}" -ArgumentList "-NoProfile", "-Command", "${escapedCommand}"`,
			reasoning: 'Wrapped background command with Start-Process to survive terminal shutdown',
			forDisplay: options.commandLine,
		};
	}
}
