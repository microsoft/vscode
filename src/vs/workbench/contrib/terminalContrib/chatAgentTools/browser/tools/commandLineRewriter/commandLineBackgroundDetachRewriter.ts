/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { isBash, isFish, isPowerShell, isZsh } from '../../runInTerminalHelpers.js';
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

		// Skip detach-wrapping for commands that read interactively from stdin.
		// `nohup` / `Start-Process` close stdin, which makes these programs hang
		// or fail immediately (e.g. `expect`, `gdb`, `psql`, `passwd`). The user
		// can still run them in mode='sync' and drive them via send_to_terminal.
		if (this._readsFromStdin(options.commandLine)) {
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

	/**
	 * Returns true when the command line invokes a program that is known to
	 * require an interactive stdin. Detaching such a command would close stdin
	 * and either hang the program or make it exit with an error.
	 *
	 * The check is intentionally conservative — only well-known interactive
	 * front-ends are matched, and only when their command-line flags do not
	 * obviously force non-interactive behaviour.
	 */
	private _readsFromStdin(commandLine: string): boolean {
		// Inspect the leading executable of the command line, ignoring leading
		// `cd ... && ` / `cd ... ;` / env-var assignments, since those don't
		// affect stdin behaviour.
		const trimmed = commandLine
			.replace(/^\s*(?:[A-Z_][A-Z0-9_]*=\S+\s+)+/, '')
			.replace(/^\s*cd\s+\S+\s*(?:&&|;)\s*/i, '')
			.trimStart();
		// Bare `expect`, `gdb`, `psql` (without `-c`/`-f`), `passwd`, `vi`/`vim`,
		// `nano`, `less`, `more`, `top`, `htop`, `ssh` without `-T`, `mysql`
		// without `-e`, `sftp`, `ftp`, `telnet`.
		if (/^(expect|passwd|vi|vim|nano|less|more|top|htop|sftp|ftp|telnet|gdb|lldb)\b/.test(trimmed)) {
			return true;
		}
		if (/^psql\b/.test(trimmed) && !/\s(-c|-f|--command|--file)\b/.test(trimmed)) {
			return true;
		}
		if (/^mysql\b/.test(trimmed) && !/\s(-e|--execute)\b/.test(trimmed)) {
			return true;
		}
		if (/^ssh\b/.test(trimmed) && !/\s-T\b/.test(trimmed) && !/\sssh\s+\S+\s+\S/.test(' ' + trimmed)) {
			// `ssh host` with no command is interactive; `ssh host cmd` runs cmd non-interactively.
			return true;
		}
		// `sudo` without `-n` (non-interactive) may prompt for a password.
		if (/^sudo\b/.test(trimmed) && !/\s-n\b/.test(trimmed) && !/\bSUDO_ASKPASS\b/.test(commandLine)) {
			return true;
		}
		return false;
	}

	private _rewriteForPosix(options: ICommandLineRewriterOptions): ICommandLineRewriterResult {
		const trimmed = options.commandLine.trimEnd();

		// Check for a trailing background `&` (not `&&`) on the original command.
		// When wrapping in `shell -c`, we strip the trailing `&` from the inner
		// command and always place it outside the quotes to avoid double-backgrounding.
		const endsWithBackgroundAmp = /(?:^|[^&])&$/.test(trimmed);

		// nohup only accepts a simple external command as its argument — it cannot exec
		// compound statements (for/while/if/case) or shell builtins (eval/set/export/source).
		// Wrap those in `<shell> -c '...'` so the whole construct runs as a single executable.
		let commandToWrap = trimmed;
		if (this._needsShellCWrapper(trimmed)) {
			// Strip trailing `&` before quoting — we'll add the outer `&` below.
			const innerCommand = endsWithBackgroundAmp ? trimmed.replace(/\s*&$/, '') : trimmed;
			if (isFish(options.shell, options.os)) {
				// Fish does not support the POSIX '\'' escape inside single-quoted strings.
				// Use a double-quoted string and escape backslash and double-quote instead.
				const escaped = innerCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
				commandToWrap = `${options.shell} -c "${escaped}"`;
			} else {
				// bash/zsh: escape single quotes for use inside a single-quoted shell -c '...' string.
				const escaped = innerCommand.replace(/'/g, `'\\''`);
				commandToWrap = `${options.shell} -c '${escaped}'`;
			}
		}

		// Always append `&` unless the (unwrapped) command already has a trailing `&`
		// and we didn't wrap it in shell -c (in which case the `&` is still present).
		const needsTrailingAmp = !(/(?:^|[^&])&$/.test(commandToWrap));

		// `disown` removes the job from the shell's job table so it won't print
		// `[1]+  Done  nohup ...` notifications that contaminate subsequent command
		// output and can cause spurious SIGINT (exit 130). Only bash/zsh support
		// `disown`; fish handles it differently (no contamination observed).
		const supportsDisown = isBash(options.shell, options.os) || isZsh(options.shell, options.os);
		const disownSuffix = supportsDisown ? ' disown' : '';

		const rewritten = needsTrailingAmp
			? `nohup ${commandToWrap} &${disownSuffix}`
			: `nohup ${commandToWrap}${disownSuffix}`;
		return {
			rewritten,
			reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
			forDisplay: options.commandLine,
		};
	}

	/**
	 * Returns true when the command uses shell constructs that `nohup` cannot exec
	 * directly. Such commands must be wrapped in `<shell> -c '...'` before being
	 * passed to nohup.
	 *
	 * `nohup` only accepts a single simple external command (plus its arguments).
	 * Anything that requires shell parsing — compound statements, builtins, shell
	 * operators, or inline variable assignments — must go through a shell wrapper.
	 */
	private _needsShellCWrapper(commandLine: string): boolean {
		const trimmed = commandLine.trimStart();
		return (
			// Bash compound command keywords — syntax constructs that are not executables.
			/^(for|while|until|if|case|select|function)\b/.test(trimmed) ||
			// Shell builtins — these only run meaningfully inside the current shell; nohup
			// cannot exec them (eval, set, export, source, unset, declare, cd, exec, etc.).
			/^(eval|set|export|source|unset|declare|typeset|local|readonly|alias|cd|exec)\b/.test(trimmed) ||
			// `. file` (dot-source builtin). Exclude `./script` (relative path) by requiring
			// whitespace after the dot.
			/^\.\s/.test(trimmed) ||
			// Compound groupings: subshell `( ... )` or brace group `{ ...; }`.
			/^[{(]/.test(trimmed) ||
			// Inline environment variable assignments before a command (e.g. `VAR=val cmd`).
			// nohup would try to exec `VAR=val` as a program name.
			/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed) ||
			// Shell operators: pipes, command chains (&&, ||), semicolons, or background
			// operators (&) in the middle of the command. nohup only execs the first
			// simple command; the rest would be lost or misinterpreted.
			// A single trailing `&` is handled separately (not matched here) since it's
			// just a background operator that nohup can coexist with.
			/(?:\|\||&&|[|;]|&(?!&)(?!\s*$))/.test(trimmed)
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
