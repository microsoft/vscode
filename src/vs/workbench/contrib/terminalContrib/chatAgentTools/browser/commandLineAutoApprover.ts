/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { OperatingSystem } from '../../../../../base/common/platform.js';
import { escapeRegExpCharacters, regExpLeadsToEndlessLoop } from '../../../../../base/common/strings.js';
import { isObject } from '../../../../../base/common/types.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { ConfigurationTarget, IConfigurationService, type IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalChatAgentToolsSettingId } from '../common/terminalChatAgentToolsConfiguration.js';
import { isPowerShell } from './runInTerminalHelpers.js';

export interface IAutoApproveRule {
	regex: RegExp;
	regexCaseInsensitive: RegExp;
	sourceText: string;
	sourceTarget: ConfigurationTarget;
	isDefaultRule: boolean;
}

export interface ICommandApprovalResultWithReason {
	result: ICommandApprovalResult;
	reason: string;
	rule?: IAutoApproveRule;
}

export type ICommandApprovalResult = 'approved' | 'denied' | 'noMatch';

const neverMatchRegex = /(?!.*)/;
const transientEnvVarRegex = /^[A-Z_][A-Z0-9_]*=/i;

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
			if (
				e.affectsConfiguration(TerminalChatAgentToolsSettingId.AutoApprove) ||
				e.affectsConfiguration(TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules) ||
				e.affectsConfiguration(TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible)
			) {
				this.updateConfiguration();
			}
		}));
	}

	updateConfiguration() {
		let configValue = this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoApprove);
		const configInspectValue = this._configurationService.inspect(TerminalChatAgentToolsSettingId.AutoApprove);
		const deprecatedValue = this._configurationService.getValue(TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible);
		if (deprecatedValue && typeof deprecatedValue === 'object' && configValue && typeof configValue === 'object') {
			configValue = {
				...configValue,
				...deprecatedValue
			};
		}

		const {
			denyListRules,
			allowListRules,
			allowListCommandLineRules,
			denyListCommandLineRules
		} = this._mapAutoApproveConfigToRules(configValue, configInspectValue);
		this._allowListRules = allowListRules;
		this._denyListRules = denyListRules;
		this._allowListCommandLineRules = allowListCommandLineRules;
		this._denyListCommandLineRules = denyListCommandLineRules;
	}

	isCommandAutoApproved(command: string, shell: string, os: OperatingSystem): ICommandApprovalResultWithReason {
		// Check if the command has a transient environment variable assignment prefix which we
		// always deny for now as it can easily lead to execute other commands
		if (transientEnvVarRegex.test(command)) {
			return {
				result: 'denied',
				reason: `Command '${command}' is denied because it contains transient environment variables`
			};
		}

		// Check the deny list to see if this command requires explicit approval
		for (const rule of this._denyListRules) {
			if (this._commandMatchesRule(rule, command, shell, os)) {
				return {
					result: 'denied',
					rule,
					reason: `Command '${command}' is denied by deny list rule: ${rule.sourceText}`
				};
			}
		}

		// Check the allow list to see if the command is allowed to run without explicit approval
		for (const rule of this._allowListRules) {
			if (this._commandMatchesRule(rule, command, shell, os)) {
				return {
					result: 'approved',
					rule,
					reason: `Command '${command}' is approved by allow list rule: ${rule.sourceText}`
				};
			}
		}

		// TODO: LLM-based auto-approval https://github.com/microsoft/vscode/issues/253267

		// Fallback is always to require approval
		return {
			result: 'noMatch',
			reason: `Command '${command}' has no matching auto approve entries`
		};
	}

	isCommandLineAutoApproved(commandLine: string): ICommandApprovalResultWithReason {
		// Check the deny list first to see if this command line requires explicit approval
		for (const rule of this._denyListCommandLineRules) {
			if (rule.regex.test(commandLine)) {
				return {
					result: 'denied',
					rule,
					reason: `Command line '${commandLine}' is denied by deny list rule: ${rule.sourceText}`
				};
			}
		}

		// Check if the full command line matches any of the allow list command line regexes
		for (const rule of this._allowListCommandLineRules) {
			if (rule.regex.test(commandLine)) {
				return {
					result: 'approved',
					rule,
					reason: `Command line '${commandLine}' is approved by allow list rule: ${rule.sourceText}`
				};
			}
		}
		return {
			result: 'noMatch',
			reason: `Command line '${commandLine}' has no matching auto approve entries`
		};
	}

	private _commandMatchesRule(rule: IAutoApproveRule, command: string, shell: string, os: OperatingSystem): boolean {
		const isPwsh = isPowerShell(shell, os);

		// PowerShell is case insensitive regardless of platform
		if ((isPwsh ? rule.regexCaseInsensitive : rule.regex).test(command)) {
			return true;
		} else if (isPwsh && command.startsWith('(')) {
			// Allow ignoring of the leading ( for PowerShell commands as it's a command pattern to
			// operate on the output of a command. For example `(Get-Content README.md) ...`
			if (rule.regexCaseInsensitive.test(command.slice(1))) {
				return true;
			}
		}
		return false;
	}

	private _mapAutoApproveConfigToRules(config: unknown, configInspectValue: IConfigurationValue<Readonly<unknown>>): {
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

		const ignoreDefaults = this._configurationService.getValue(TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules) === true;

		for (const [key, value] of Object.entries(config)) {
			const defaultValue = configInspectValue?.default?.value;
			const isDefaultRule = !!(
				isObject(defaultValue) &&
				Object.prototype.hasOwnProperty.call(defaultValue, key) &&
				structuralEquals((defaultValue as Record<string, unknown>)[key], value)
			);
			function checkTarget(inspectValue: Readonly<unknown> | undefined): boolean {
				return (
					isObject(inspectValue) &&
					Object.prototype.hasOwnProperty.call(inspectValue, key) &&
					structuralEquals((inspectValue as Record<string, unknown>)[key], value)
				);
			}
			const sourceTarget = (
				checkTarget(configInspectValue.workspaceFolder) ? ConfigurationTarget.WORKSPACE_FOLDER
					: checkTarget(configInspectValue.workspaceValue) ? ConfigurationTarget.WORKSPACE
						: checkTarget(configInspectValue.userRemoteValue) ? ConfigurationTarget.USER_REMOTE
							: checkTarget(configInspectValue.userLocalValue) ? ConfigurationTarget.USER_LOCAL
								: checkTarget(configInspectValue.userValue) ? ConfigurationTarget.USER
									: checkTarget(configInspectValue.applicationValue) ? ConfigurationTarget.APPLICATION
										: ConfigurationTarget.DEFAULT
			);

			// If default rules are disabled, ignore entries that come from the default config
			if (ignoreDefaults && isDefaultRule && sourceTarget === ConfigurationTarget.DEFAULT) {
				continue;
			}

			if (typeof value === 'boolean') {
				const { regex, regexCaseInsensitive } = this._convertAutoApproveEntryToRegex(key);
				// IMPORTANT: Only true and false are used, null entries need to be ignored
				if (value === true) {
					allowListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
				} else if (value === false) {
					denyListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
				}
			} else if (typeof value === 'object' && value !== null) {
				// Handle object format like { approve: true/false, matchCommandLine: true/false }
				const objectValue = value as { approve?: boolean; matchCommandLine?: boolean };
				if (typeof objectValue.approve === 'boolean') {
					const { regex, regexCaseInsensitive } = this._convertAutoApproveEntryToRegex(key);
					if (objectValue.approve === true) {
						if (objectValue.matchCommandLine === true) {
							allowListCommandLineRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
						} else {
							allowListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
						}
					} else if (objectValue.approve === false) {
						if (objectValue.matchCommandLine === true) {
							denyListCommandLineRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
						} else {
							denyListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
						}
					}
				}
			}
		}

		return {
			denyListRules,
			allowListRules,
			allowListCommandLineRules,
			denyListCommandLineRules
		};
	}

	private _convertAutoApproveEntryToRegex(value: string): { regex: RegExp; regexCaseInsensitive: RegExp } {
		const regex = this._doConvertAutoApproveEntryToRegex(value);
		if (regex.flags.includes('i')) {
			return { regex, regexCaseInsensitive: regex };
		}
		return { regex, regexCaseInsensitive: new RegExp(regex.source, regex.flags + 'i') };
	}

	private _doConvertAutoApproveEntryToRegex(value: string): RegExp {
		// If it's wrapped in `/`, it's in regex format and should be converted directly
		// Support all standard JavaScript regex flags: d, g, i, m, s, u, v, y
		const regexMatch = value.match(/^\/(?<pattern>.+)\/(?<flags>[dgimsuvy]*)$/);
		const regexPattern = regexMatch?.groups?.pattern;
		if (regexPattern) {
			let flags = regexMatch.groups?.flags;
			// Remove global flag as it changes how the regex state works which we need to handle
			// internally
			if (flags) {
				flags = flags.replaceAll('g', '');
			}

			// Allow .* as users expect this would match everything
			if (regexPattern === '.*') {
				return new RegExp(regexPattern);

			}

			try {
				const regex = new RegExp(regexPattern, flags || undefined);
				if (regExpLeadsToEndlessLoop(regex)) {
					return neverMatchRegex;
				}

				return regex;
			} catch (error) {
				return neverMatchRegex;
			}
		}

		// The empty string should be ignored, rather than approve everything
		if (value === '') {
			return neverMatchRegex;
		}

		let sanitizedValue: string;

		// Match both path separators it if looks like a path
		if (value.includes('/') || value.includes('\\')) {
			// Replace path separators with placeholders first, apply standard sanitization, then
			// apply special path handling
			let pattern = value.replace(/[/\\]/g, '%%PATH_SEP%%');
			pattern = escapeRegExpCharacters(pattern);
			pattern = pattern.replace(/%%PATH_SEP%%*/g, '[/\\\\]');
			sanitizedValue = `^(?:\\.[/\\\\])?${pattern}`;
		}

		// Escape regex special characters for non-path strings
		else {
			sanitizedValue = escapeRegExpCharacters(value);
		}

		// Regular strings should match the start of the command line and be a word boundary
		return new RegExp(`^${sanitizedValue}\\b`);
	}
}
