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
	private _autoApproveRegexes: { regex: RegExp; approved: boolean }[] = [];

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
		this._autoApproveRegexes = this._mapAutoApproveConfigToRegexList(this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoApprove));
	}

	isAutoApproved(command: string, shell: string, os: OperatingSystem): boolean {
		// Check all patterns in the auto approve list
		// Deny patterns (false) take precedence over allow patterns (true)
		let hasAllowMatch = false;
		let hasDenyMatch = false;

		for (const { regex, approved } of this._autoApproveRegexes) {
			if (this._commandMatchesRegex(regex, command, shell, os)) {
				if (approved) {
					hasAllowMatch = true;
				} else {
					hasDenyMatch = true;
				}
			}
		}

		// If there's a deny match, always require approval
		if (hasDenyMatch) {
			return false;
		}

		// If there's an allow match and no deny match, auto-approve
		if (hasAllowMatch) {
			return true;
		}

		// TODO: LLM-based auto-approval https://github.com/microsoft/vscode/issues/253267

		// Fallback is always to require approval
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

	private _mapAutoApproveConfigToRegexList(config: unknown): { regex: RegExp; approved: boolean }[] {
		if (!config || typeof config !== 'object') {
			return [];
		}
		return Object.entries(config)
			.map(([key, value]) => {
				if (typeof value === 'boolean') {
					const regex = this._convertAutoApproveEntryToRegex(key);
					return { regex, approved: value };
				}
				return undefined;
			})
			.filter(e => !!e);
	}

	private _convertAutoApproveEntryToRegex(value: string): RegExp {
		// If it's wrapped in `/`, it's in regex format and should be converted directly
		if (value.match(/^\/.+\/$/)) {
			return new RegExp(value.slice(1, -1));
		}

		// Escape regex special characters
		const sanitizedValue = value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

		// Regular strings should match the start of the command line and be a word boundary
		return new RegExp(`^${sanitizedValue}\\b`);
	}
}
