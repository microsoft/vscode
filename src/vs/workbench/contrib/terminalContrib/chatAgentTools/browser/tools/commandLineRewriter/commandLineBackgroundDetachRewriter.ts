/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { isFish, isPowerShell } from '../../runInTerminalHelpers.js';
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
		if (!this._configurationService.getValue(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses)) {
			return undefined;
		}

		// Detach when:
		//   1. The tool was invoked with mode='async' (isBackground=true), OR
		//   2. The command line ends with a single trailing `&` (POSIX background operator).
		// Case (2) catches commands that the agent intended to background even when called
		// in mode='sync' — without this, the trailing `&` silently produces a SIGHUP'd
		// process that dies as soon as the tool's shell tears down.
		const trimmedForCheck = options.commandLine.trimEnd();
		const endsWithBareBackgroundAmp = /(?:^|[^&])&$/.test(trimmedForCheck);
		if (!options.isBackground && !endsWithBareBackgroundAmp) {
			return undefined;
		}

		if (options.os === OperatingSystem.Windows) {
			// PowerShell does not have a POSIX-style trailing `&` background operator,
			// so only rewrite explicit async-mode commands here.
			if (!options.isBackground) {
				return undefined;
			}
			return this._rewriteForPowerShell(options);
		}

		return this._rewriteForPosix(options);
	}

	private _rewriteForPosix(options: ICommandLineRewriterOptions): ICommandLineRewriterResult {
		const trimmed = options.commandLine.trimEnd();

		// nohup only accepts a simple external command as its argument — it cannot exec
		// compound statements (for/while/if/case) or shell builtins (eval/set/export/source).
		// Wrap those in `<shell> -c '...'` so the whole construct runs as a single executable.
		let commandToWrap = trimmed;
		if (this._needsShellCWrapper(trimmed)) {
			if (isFish(options.shell, options.os)) {
				// Fish does not support the POSIX '\'' escape inside single-quoted strings.
				// Use a double-quoted string and escape backslash and double-quote instead.
				const escaped = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
				commandToWrap = `${options.shell} -c "${escaped}"`;
			} else {
				// bash/zsh: escape single quotes for use inside a single-quoted shell -c '...' string.
				const escaped = trimmed.replace(/'/g, `'\\''`);
				commandToWrap = `${options.shell} -c '${escaped}'`;
			}
		}

		// If the command already ends with a single trailing `&` (background operator,
		// as opposed to `&&` for command chaining), don't append another one.
		const endsWithBackgroundAmp = /(?:^|[^&])&$/.test(commandToWrap);
		const rewritten = endsWithBackgroundAmp
			? `nohup ${commandToWrap}`
			: `nohup ${commandToWrap} &`;
		return {
			rewritten,
			reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
			forDisplay: options.commandLine,
		};
	}

	/**
	 * Returns true when the command uses shell compound constructs or builtins that
	 * `nohup` cannot exec directly. Such commands must be wrapped in `<shell> -c '...'` before
	 * being passed to nohup.
	 */
	private _needsShellCWrapper(commandLine: string): boolean {
		const trimmed = commandLine.trimStart();
		return (
			// Bash compound command keywords — syntax constructs that are not executables.
			/^(for|while|until|if|case|select|function)\b/.test(trimmed) ||
			// Shell builtins — these only run meaningfully inside the current shell; nohup
			// cannot exec them (eval, set, export, source, unset, declare, etc.).
			/^(eval|set|export|source|unset|declare|typeset|local|readonly|alias)\b/.test(trimmed) ||
			// `. file` (dot-source builtin). Exclude `./script` (relative path) by requiring
			// whitespace after the dot.
			/^\.\s/.test(trimmed) ||
			// Compound groupings: subshell `( ... )` or brace group `{ ...; }`.
			/^[{(]/.test(trimmed)
		);
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
