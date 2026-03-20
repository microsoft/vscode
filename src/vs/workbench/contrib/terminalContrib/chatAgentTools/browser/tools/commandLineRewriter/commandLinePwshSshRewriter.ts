/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { isPowerShell } from '../../runInTerminalHelpers.js';
import type { ICommandLineRewriter, ICommandLineRewriterOptions, ICommandLineRewriterResult } from './commandLineRewriter.js';

/**
 * Rewrites SSH commands executed in PowerShell to prevent common issues:
 *
 * 1. PowerShell evaluates $(...) as a local subexpression even inside double
 *    quotes. When running `ssh server "kill $(pgrep -f X)"`, PowerShell tries
 *    to run `pgrep` locally instead of passing it to the remote shell.
 *    Fix: Rewrite double quotes to single quotes around the remote command.
 *
 * 2. SSH + nohup + & hangs PowerShell because the SSH client waits for stdout
 *    to close. Adding `> /dev/null 2>&1` ensures the pipe closes properly.
 */
export class CommandLinePwshSshRewriter extends Disposable implements ICommandLineRewriter {

	async rewrite(options: ICommandLineRewriterOptions): Promise<ICommandLineRewriterResult | undefined> {
		if (!isPowerShell(options.shell, options.os)) {
			return undefined;
		}

		const commandLine = options.commandLine;

		// Only apply to commands that start with ssh (possibly after whitespace)
		const trimmed = commandLine.trimStart();
		if (!trimmed.startsWith('ssh ') && !trimmed.startsWith('ssh.exe ')) {
			return undefined;
		}

		let rewritten = commandLine;
		const reasons: string[] = [];

		// Fix 1: Rewrite double-quoted SSH arguments containing $() to single quotes.
		// Pattern: ssh [flags...] host "...$(...)..."
		// We need to match the remote command portion in double quotes that contains $()
		rewritten = rewriteSshSubexpressions(rewritten, reasons);

		// Fix 2: Add output redirect for nohup & patterns that are missing it.
		// Pattern: ssh host "nohup ... &" → ssh host "nohup ... > /dev/null 2>&1 &"
		rewritten = rewriteSshNohupRedirect(rewritten, reasons);

		if (reasons.length === 0) {
			return undefined;
		}

		return {
			rewritten,
			reasoning: reasons.join('; ')
		};
	}
}

/**
 * Detects SSH commands where the remote command is in double quotes and contains
 * $(...) subexpressions. Rewrites to single quotes so PowerShell passes them
 * literally to the remote shell.
 *
 * Example:
 *   ssh server "kill $(pgrep -f app)" → ssh server 'kill $(pgrep -f app)'
 */
function rewriteSshSubexpressions(commandLine: string, reasons: string[]): string {
	// Match: ssh [optional-flags] host "remote command with $(subexpr)"
	// The double-quoted string must contain $( to be a candidate for rewriting.
	// We avoid rewriting if the string already uses single quotes or if there's
	// no $() pattern inside.
	const sshDoubleQuoteWithSubexpr = /^(ssh(?:\.exe)?\s+(?:-[A-Za-z]\s+(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*[^\s]+\s+)"((?:[^"\\]|\\.)*)"/;

	const match = commandLine.match(sshDoubleQuoteWithSubexpr);
	if (!match) {
		return commandLine;
	}

	const prefix = match[1]; // ssh [flags] host
	const remoteCommand = match[2]; // content inside double quotes

	// Only rewrite if the remote command contains $(...) which PowerShell would
	// try to evaluate locally
	if (!remoteCommand.includes('$(')) {
		return commandLine;
	}

	// Don't rewrite if the remote command contains PowerShell variables that
	// the user actually wants expanded locally (e.g., $env:USERNAME)
	if (remoteCommand.includes('$env:') || remoteCommand.includes('$PSVersionTable')) {
		return commandLine;
	}

	// Replace double quotes with single quotes for the remote command.
	// If the remote command itself contains single quotes, we need to escape them
	// for the shell using the pattern: 'text'\''more text'
	const escapedRemote = remoteCommand.includes("'")
		? remoteCommand.replace(/'/g, "'\\''")
		: remoteCommand;

	const suffix = commandLine.slice(prefix.length + remoteCommand.length + 2); // after the closing "
	const rewritten = `${prefix}'${escapedRemote}'${suffix}`;

	reasons.push('SSH $() re-quoted from double to single quotes to prevent local evaluation');
	return rewritten;
}

/**
 * Detects SSH nohup commands that launch background processes without
 * redirecting stdout/stderr. Without redirection, PowerShell's SSH client
 * hangs waiting for the stdout pipe to close.
 *
 * Example:
 *   ssh server "nohup app &" → ssh server "nohup app > /dev/null 2>&1 &"
 */
function rewriteSshNohupRedirect(commandLine: string, reasons: string[]): string {
	// Match: ssh [flags] host "nohup ... &" where there's no > redirect
	// We look for the pattern ending with & inside quotes, preceded by nohup,
	// without any > or 2> in between
	const sshNohupPattern = /^(ssh(?:\.exe)?\s+(?:-[A-Za-z]\s+(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*[^\s]+\s+)(["'])(nohup\s+.*?)(\s*&\s*)\2$/;

	const match = commandLine.match(sshNohupPattern);
	if (!match) {
		return commandLine;
	}

	const prefix = match[1]; // ssh [flags] host
	const quote = match[2];  // " or '
	const nohupCmd = match[3]; // nohup ...
	// match[4] = & portion

	// Check if output is already redirected
	if (nohupCmd.includes('>') || nohupCmd.includes('2>&1')) {
		return commandLine;
	}

	const rewritten = `${prefix}${quote}${nohupCmd} > /dev/null 2>&1 &${quote}`;

	reasons.push('SSH nohup redirect added to prevent PowerShell SSH hang');
	return rewritten;
}
