/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../../../base/common/platform.js';
import type { URI } from '../../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import type { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { isPowerShell } from './runInTerminalHelpers.js';
import type { IRunInTerminalInputParams } from './tools/runInTerminalTool.js';
import { type TreeSitterCommandParser } from './treeSitterCommandParser.js';

export class CommandSimplifier {
	constructor(
		private readonly _osBackend: Promise<OperatingSystem>,
		private readonly _treeSitterCommandParser: TreeSitterCommandParser,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
	}

	async rewriteIfNeeded(args: IRunInTerminalInputParams, instance: Pick<ITerminalInstance, 'getCwdResource'> | undefined, shell: string): Promise<string> {
		const os = await this._osBackend;

		let commandLine = args.command;
		commandLine = await this._removeRedundantCdPrefix(instance, commandLine, os, shell);
		commandLine = await this._rewriteUnsupportedPwshChainOperators(commandLine, os, shell);

		return commandLine;
	}

	private async _removeRedundantCdPrefix(instance: Pick<ITerminalInstance, 'getCwdResource'> | undefined, commandLine: string, os: OperatingSystem, shell: string): Promise<string> {
		const isPwsh = isPowerShell(shell, os);

		// Re-write the command if it starts with `cd <dir> && <suffix>` or `cd <dir>; <suffix>`
		// to just `<suffix>` if the directory matches the current terminal's cwd. This simplifies
		// the result in the chat by removing redundancies that some models like to add.
		const cdPrefixMatch = commandLine.match(
			isPwsh
				? /^(?:cd(?: \/d)?|Set-Location(?: -Path)?) (?<dir>[^\s]+) ?(?:&&|;)\s+(?<suffix>.+)$/i
				: /^cd (?<dir>[^\s]+) &&\s+(?<suffix>.+)$/
		);
		const cdDir = cdPrefixMatch?.groups?.dir;
		const cdSuffix = cdPrefixMatch?.groups?.suffix;
		if (cdDir && cdSuffix) {
			let cwd: URI | undefined;

			// Get the current session terminal's cwd
			if (instance) {
				cwd = await instance.getCwdResource();
			}

			// If a terminal is not available, use the workspace root
			if (!cwd) {
				const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
				if (workspaceFolders.length === 1) {
					cwd = workspaceFolders[0].uri;
				}
			}

			// Re-write the command if it matches the cwd
			if (cwd) {
				// Remove any surrounding quotes
				let cdDirPath = cdDir;
				if (cdDirPath.startsWith('"') && cdDirPath.endsWith('"')) {
					cdDirPath = cdDirPath.slice(1, -1);
				}
				// Normalize trailing slashes
				cdDirPath = cdDirPath.replace(/(?:[\\\/])$/, '');
				let cwdFsPath = cwd.fsPath.replace(/(?:[\\\/])$/, '');
				// Case-insensitive comparison on Windows
				if (os === OperatingSystem.Windows) {
					cdDirPath = cdDirPath.toLowerCase();
					cwdFsPath = cwdFsPath.toLowerCase();
				}
				if (cdDirPath === cwdFsPath) {
					return cdSuffix;
				}
			}
		}
		return commandLine;
	}

	private async _rewriteUnsupportedPwshChainOperators(commandLine: string, os: OperatingSystem, shell: string) {
		// TODO: This should just be Windows PowerShell in the future when the powershell grammar
		// supports chain operators https://github.com/airbus-cert/tree-sitter-powershell/issues/27
		if (isPowerShell(shell, os)) {
			try {
				const doubleAmpersandCaptures = await this._treeSitterCommandParser.extractPwshDoubleAmpersandChainOperators(commandLine);
				for (const capture of doubleAmpersandCaptures.reverse()) {
					commandLine = `${commandLine.substring(0, capture.node.startIndex)};${commandLine.substring(capture.node.endIndex)}`;
				}
			} catch {
				// Swallow tree sitter failures
			}
		}
		return commandLine;
	}
}
