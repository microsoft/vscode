/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { OperatingSystem } from '../../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalChatAgentToolsSettingId } from '../common/terminalChatAgentToolsConfiguration.js';
import { isPowerShell } from './runInTerminalHelpers.js';

interface IAutoApproveRule {
	regex: RegExp;
	sourceText: string;
}

export class CommandLineAutoApprover extends Disposable {
	private _denyListRules: IAutoApproveRule[] = [];
	private _allowListRules: IAutoApproveRule[] = [];
	private _allowListCommandLineRules: IAutoApproveRule[] = [];
	private _denyListCommandLineRules: IAutoApproveRule[] = [];

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
		const { denyListRules, allowListRules, allowListCommandLineRules, denyListCommandLineRules } = this._mapAutoApproveConfigToRules(this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoApprove));
		this._allowListRules = allowListRules;
		this._denyListRules = denyListRules;
		this._allowListCommandLineRules = allowListCommandLineRules;
		this._denyListCommandLineRules = denyListCommandLineRules;
	}

	isCommandAutoApproved(command: string, shell: string, os: OperatingSystem): { isAutoApproved: boolean; reason: string } {
		// Check the deny list to see if this command requires explicit approval
		for (const rule of this._denyListRules) {
			if (this._commandMatchesRegex(rule.regex, command, shell, os)) {
				return { isAutoApproved: false, reason: `Command '${command}' is denied by deny list rule: ${rule.sourceText}` };
			}
		}

		// Check the allow list to see if the command is allowed to run without explicit approval
		for (const rule of this._allowListRules) {
			if (this._commandMatchesRegex(rule.regex, command, shell, os)) {
				return { isAutoApproved: true, reason: `Command '${command}' is approved by allow list rule: ${rule.sourceText}` };
			}
		}

		// TODO: LLM-based auto-approval https://github.com/microsoft/vscode/issues/253267

		// Fallback is always to require approval
		return { isAutoApproved: false, reason: `Command '${command}' has no matching auto approve entries` };
	}

	isCommandLineAutoApproved(commandLine: string): { isAutoApproved: boolean; reason: string } {
		// Check the deny list first to see if this command line requires explicit approval
		for (const rule of this._denyListCommandLineRules) {
			if (rule.regex.test(commandLine)) {
				return { isAutoApproved: false, reason: `Command line '${commandLine}' is denied by deny list rule: ${rule.sourceText}` };
			}
		}

		// Check if the full command line matches any of the allow list command line regexes
		for (const rule of this._allowListCommandLineRules) {
			if (rule.regex.test(commandLine)) {
				return { isAutoApproved: true, reason: `Command line '${commandLine}' is approved by allow list rule: ${rule.sourceText}` };
			}
		}
		return { isAutoApproved: false, reason: `Command line '${commandLine}' has no matching auto approve entries` };
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

	private _mapAutoApproveConfigToRules(config: unknown): {
		denyListRules: IAutoApproveRule[];
		allowListRules: IAutoApproveRule[];
		allowListCommandLineRules: IAutoApproveRule[];
		denyListCommandLineRules: IAutoApproveRule[];
	} {
		if (!config || typeof config !== 'object') {
			return {
				denyListRules: [],
				allowListRules: [],
				allowListCommandLineRules: [],
				denyListCommandLineRules: []
			};
		}

		const denyListRules: IAutoApproveRule[] = [];
		const allowListRules: IAutoApproveRule[] = [];
		const allowListCommandLineRules: IAutoApproveRule[] = [];
		const denyListCommandLineRules: IAutoApproveRule[] = [];

		Object.entries(config).forEach(([key, value]) => {
			if (typeof value === 'boolean') {
				const regex = this._convertAutoApproveEntryToRegex(key);
				// IMPORTANT: Only true and false are used, null entries need to be ignored
				if (value === true) {
					allowListRules.push({ regex, sourceText: key });
				} else if (value === false) {
					denyListRules.push({ regex, sourceText: key });
				}
			} else if (typeof value === 'object' && value !== null) {
				// Handle object format like { approve: true/false, matchCommandLine: true/false }
				const objectValue = value as { approve?: boolean; matchCommandLine?: boolean };
				if (typeof objectValue.approve === 'boolean') {
					const regex = this._convertAutoApproveEntryToRegex(key);
					if (objectValue.approve === true) {
						if (objectValue.matchCommandLine === true) {
							allowListCommandLineRules.push({ regex, sourceText: key });
						} else {
							allowListRules.push({ regex, sourceText: key });
						}
					} else if (objectValue.approve === false) {
						if (objectValue.matchCommandLine === true) {
							denyListCommandLineRules.push({ regex, sourceText: key });
						} else {
							denyListRules.push({ regex, sourceText: key });
						}
					}
				}
			}
		});

		return {
			denyListRules,
			allowListRules,
			allowListCommandLineRules,
			denyListCommandLineRules
		};
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
