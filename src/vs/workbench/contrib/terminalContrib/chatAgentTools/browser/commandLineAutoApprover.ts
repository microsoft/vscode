/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { OperatingSystem } from '../../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalChatAgentToolsSettingId } from '../common/terminalChatAgentToolsConfiguration.js';
import { isPowerShell } from './runInTerminalHelpers.js';

export class CommandLineAutoApprover extends Disposable {
	private _denyListRegexes: RegExp[] = [];
	private _allowListRegexes: RegExp[] = [];
	private _allowListCommandLineRegexes: RegExp[] = [];
	private _denyListCommandLineRegexes: RegExp[] = [];

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this.updateConfiguration();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalChatAgentToolsSettingId.AutoApprove)) {
				this.updateConfiguration();
			}
		}));
	}

	updateConfiguration() {
		const { denyList, allowList, allowListCommandLine, denyListCommandLine } = this._mapAutoApproveConfigToRegexList(this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoApprove));
		this._allowListRegexes = allowList;
		this._denyListRegexes = denyList;
		this._allowListCommandLineRegexes = allowListCommandLine;
		this._denyListCommandLineRegexes = denyListCommandLine;
	}

	isCommandAutoApproved(command: string, shell: string, os: OperatingSystem): boolean {
		// Check the deny list to see if this command requires explicit approval
		for (const regex of this._denyListRegexes) {
			if (this._commandMatchesRegex(regex, command, shell, os)) {
				return false;
			}
		}

		// Check the allow list to see if the command is allowed to run without explicit approval
		for (const regex of this._allowListRegexes) {
			if (this._commandMatchesRegex(regex, command, shell, os)) {
				return true;
			}
		}

		// TODO: LLM-based auto-approval https://github.com/microsoft/vscode/issues/253267

		// Fallback is always to require approval
		return false;
	}

	isCommandLineAutoApproved(commandLine: string): boolean {
		// Check the deny list first to see if this command line requires explicit approval
		for (const regex of this._denyListCommandLineRegexes) {
			if (regex.test(commandLine)) {
				return false;
			}
		}

		// Check if the full command line matches any of the allow list command line regexes
		for (const regex of this._allowListCommandLineRegexes) {
			if (regex.test(commandLine)) {
				return true;
			}
		}
		return false;
	}

	private _commandMatchesRegex(regex: RegExp, command: string, shell: string, os: OperatingSystem): boolean {
		if (regex.test(command)) {
			return true;
		} else if (isPowerShell(shell, os) && command.startsWith('(')) {
			// Allow ignoring of the leading ( for PowerShell commands as it's a command pattern to
			// operate on the output of a command. For example `(Get-Content README.md) ...`
			if (regex.test(command.slice(1))) {
				return true;
			}
		}
		return false;
	}

	private _mapAutoApproveConfigToRegexList(config: unknown): { denyList: RegExp[]; allowList: RegExp[]; allowListCommandLine: RegExp[]; denyListCommandLine: RegExp[] } {
		if (!config || typeof config !== 'object') {
			return { denyList: [], allowList: [], allowListCommandLine: [], denyListCommandLine: [] };
		}

		const denyList: RegExp[] = [];
		const allowList: RegExp[] = [];
		const allowListCommandLine: RegExp[] = [];
		const denyListCommandLine: RegExp[] = [];

		Object.entries(config).forEach(([key, value]) => {
			if (typeof value === 'boolean') {
				const regex = this._convertAutoApproveEntryToRegex(key);
				// IMPORTANT: Only true and false are used, null entries need to be ignored
				if (value === true) {
					allowList.push(regex);
				} else if (value === false) {
					denyList.push(regex);
				}
			} else if (typeof value === 'object' && value !== null) {
				// Handle object format like { approve: true/false, matchCommandLine: true/false }
				const objectValue = value as { approve?: boolean; matchCommandLine?: boolean };
				if (typeof objectValue.approve === 'boolean') {
					const regex = this._convertAutoApproveEntryToRegex(key);
					if (objectValue.approve === true) {
						if (objectValue.matchCommandLine === true) {
							allowListCommandLine.push(regex);
						} else {
							allowList.push(regex);
						}
					} else if (objectValue.approve === false) {
						if (objectValue.matchCommandLine === true) {
							denyListCommandLine.push(regex);
						} else {
							denyList.push(regex);
						}
					}
				}
			}
		});

		return { denyList, allowList, allowListCommandLine, denyListCommandLine };
	}

	private _convertAutoApproveEntryToRegex(value: string): RegExp {
		// If it's wrapped in `/`, it's in regex format and should be converted directly
		// Support all standard JavaScript regex flags: d, g, i, m, s, u, v, y
		const regexMatch = value.match(/^\/(?<pattern>.+)\/(?<flags>[dgimsuvy]*)$/);
		const regexPattern = regexMatch?.groups?.pattern;
		if (regexPattern) {
			let flags = regexMatch.groups?.flags;
			// Remove global flag as it can cause confusion
			if (flags) {
				flags = flags.replaceAll('g', '');
			}
			return new RegExp(regexPattern, flags || undefined);
		}

		// Escape regex special characters
		const sanitizedValue = value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

		// Regular strings should match the start of the command line and be a word boundary
		return new RegExp(`^${sanitizedValue}\\b`);
	}
}
