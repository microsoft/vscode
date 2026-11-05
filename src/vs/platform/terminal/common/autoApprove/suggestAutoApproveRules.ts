/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';

// Some commands should not be recommended as they are too permissive generally. This only
// applies to sub-commands, we still want to offer approving of the exact the command line
// however as it's very specific.
const neverAutoApproveCommands = new Set([
	// Shell interpreters
	'bash', 'sh', 'zsh', 'fish', 'ksh', 'csh', 'tcsh', 'dash',
	'pwsh', 'powershell', 'powershell.exe', 'cmd', 'cmd.exe',
	// Script interpreters
	'python', 'python3', 'node', 'ruby', 'perl', 'php', 'lua',
	// Direct execution commands
	'eval', 'exec', 'source', 'sudo', 'su', 'doas',
	// Network tools that can download and execute code
	'curl', 'wget', 'invoke-restmethod', 'invoke-webrequest', 'irm', 'iwr',
]);

// Commands where we want to suggest the sub-command (eg. `foo bar` instead of `foo`)
const commandsWithSubcommands = new Set(['git', 'npm', 'npx', 'yarn', 'docker', 'kubectl', 'cargo', 'dotnet', 'mvn', 'gradle']);

// Commands where we want to suggest the sub-command of a sub-command (eg. `foo bar baz`
// instead of `foo`)
const commandsWithSubSubCommands = new Set(['npm run', 'yarn run']);

/** Finds the first non-flag argument at or after `startIndex`. */
function findNextNonFlagArg(parts: string[], startIndex: number): number | undefined {
	for (let i = startIndex; i < parts.length; i++) {
		if (!parts[i].startsWith('-')) {
			return i;
		}
	}
	return undefined;
}

/** Suggests terminal auto-approve rule keys for the sub-commands that are not yet approved. */
export function suggestAutoApproveRuleKeys(commandLine: string, unapprovedSubCommands: readonly string[]): { readonly subCommandKeys: readonly string[]; readonly offerExactCommandLine: boolean } {
	// For each unapproved sub-command (within the overall command line), decide whether to
	// suggest new rules for the command, a sub-command, a sub-command of a sub-command or to
	// not suggest at all.
	//
	// This includes support for detecting flags between the commands, so `mvn -DskipIT test a`
	// would suggest `mvn -DskipIT test` as that's more useful than only suggesting the exact
	// command line.
	const subCommandKeys = Array.from(new Set(coalesce(unapprovedSubCommands.map(command => {
		const parts = command.trim().split(/\s+/);
		const baseCommand = parts[0].toLowerCase();

		// Security check: Never suggest auto-approval for dangerous interpreter commands
		if (neverAutoApproveCommands.has(baseCommand)) {
			return undefined;
		}

		if (commandsWithSubcommands.has(baseCommand)) {
			// Find the first non-flag argument after the command
			const subCommandIndex = findNextNonFlagArg(parts, 1);
			if (subCommandIndex !== undefined) {
				// Check if this is a sub-sub-command case
				const baseSubCommand = `${parts[0]} ${parts[subCommandIndex]}`.toLowerCase();
				if (commandsWithSubSubCommands.has(baseSubCommand)) {
					// Look for the second non-flag argument after the first subcommand
					const subSubCommandIndex = findNextNonFlagArg(parts, subCommandIndex + 1);
					if (subSubCommandIndex !== undefined) {
						// Include everything from command to sub-sub-command (including flags)
						return parts.slice(0, subSubCommandIndex + 1).join(' ');
					}
					return undefined;
				} else {
					// Include everything from command to subcommand (including flags)
					return parts.slice(0, subCommandIndex + 1).join(' ');
				}
			}
			return undefined;
		} else {
			return parts[0];
		}
	}))));

	// Allow exact command line, don't do this if it's just the first sub-command's first
	// word or if it's an exact match for special sub-commands
	const firstSubcommandFirstWord = unapprovedSubCommands.length > 0 ? unapprovedSubCommands[0].split(' ')[0] : '';
	const offerExactCommandLine = (
		firstSubcommandFirstWord !== commandLine &&
		!commandsWithSubcommands.has(commandLine) &&
		!commandsWithSubSubCommands.has(commandLine)
	);

	return { subCommandKeys, offerExactCommandLine };
}
