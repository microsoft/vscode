/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { isPowerShell } from '../../runInTerminalHelpers.js';
import type { ICommandLineRewriter, ICommandLineRewriterOptions, ICommandLineRewriterResult } from './commandLineRewriter.js';

export interface IExtractedCdPrefix {
	/** The directory path that was extracted from the cd command */
	directory: string;
	/** The command to run after the cd */
	command: string;
}

/**
 * Extracts a cd prefix from a command line, returning the directory and remaining command.
 * Does not check if the directory matches the current cwd - just extracts the pattern.
 */
export function extractCdPrefix(commandLine: string, shell: string, os: OperatingSystem): IExtractedCdPrefix | undefined {
	const isPwsh = isPowerShell(shell, os);

	const cdPrefixMatch = commandLine.match(
		isPwsh
			? /^(?:cd(?: \/d)?|Set-Location(?: -Path)?) (?<dir>[^\s]+) ?(?:&&|;)\s+(?<suffix>.+)$/i
			: /^cd (?<dir>[^\s]+) &&\s+(?<suffix>.+)$/
	);
	const cdDir = cdPrefixMatch?.groups?.dir;
	const cdSuffix = cdPrefixMatch?.groups?.suffix;
	if (cdDir && cdSuffix) {
		// Remove any surrounding quotes
		let cdDirPath = cdDir;
		if (cdDirPath.startsWith('"') && cdDirPath.endsWith('"')) {
			cdDirPath = cdDirPath.slice(1, -1);
		}
		return { directory: cdDirPath, command: cdSuffix };
	}
	return undefined;
}

export class CommandLineCdPrefixRewriter extends Disposable implements ICommandLineRewriter {
	rewrite(options: ICommandLineRewriterOptions): ICommandLineRewriterResult | undefined {
		if (!options.cwd) {
			return undefined;
		}

		const isPwsh = isPowerShell(options.shell, options.os);

		// Re-write the command if it starts with `cd <dir> && <suffix>` or `cd <dir>; <suffix>`
		// to just `<suffix>` if the directory matches the current terminal's cwd. This simplifies
		// the result in the chat by removing redundancies that some models like to add.
		const cdPrefixMatch = options.commandLine.match(
			isPwsh
				? /^(?:cd(?: \/d)?|Set-Location(?: -Path)?) (?<dir>[^\s]+) ?(?:&&|;)\s+(?<suffix>.+)$/i
				: /^cd (?<dir>[^\s]+) &&\s+(?<suffix>.+)$/
		);
		const cdDir = cdPrefixMatch?.groups?.dir;
		const cdSuffix = cdPrefixMatch?.groups?.suffix;
		if (cdDir && cdSuffix) {
			// Remove any surrounding quotes
			let cdDirPath = cdDir;
			if (cdDirPath.startsWith('"') && cdDirPath.endsWith('"')) {
				cdDirPath = cdDirPath.slice(1, -1);
			}
			// Normalize trailing slashes
			cdDirPath = cdDirPath.replace(/(?:[\\\/])$/, '');
			let cwdFsPath = options.cwd.fsPath.replace(/(?:[\\\/])$/, '');
			// Case-insensitive comparison on Windows
			if (options.os === OperatingSystem.Windows) {
				cdDirPath = cdDirPath.toLowerCase();
				cwdFsPath = cwdFsPath.toLowerCase();
			}
			if (cdDirPath === cwdFsPath) {
				return { rewritten: cdSuffix, reasoning: 'Removed redundant cd command' };
			}
		}
		return undefined;
	}
}
