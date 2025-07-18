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
		const { denyList, allowList } = this._mapAutoApproveConfigToRegexList(this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoApprove));
		this._allowListRegexes = allowList;
		this._denyListRegexes = denyList;
	}

	isAutoApproved(command: string, shell: string, os: OperatingSystem): boolean {
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

	private _mapAutoApproveConfigToRegexList(config: unknown): { denyList: RegExp[]; allowList: RegExp[] } {
		if (!config || typeof config !== 'object') {
			return { denyList: [], allowList: [] };
		}

		const denyList: RegExp[] = [];
		const allowList: RegExp[] = [];

		Object.entries(config).forEach(([key, value]) => {
			if (typeof value === 'boolean') {
				const regex = this._convertAutoApproveEntryToRegex(key);
				// IMPORTANT: Only true and false are used, null entries need to be ignored
				if (value === true) {
					allowList.push(regex);
				} else if (value === false) {
					denyList.push(regex);
				}
			}
		});

		return { denyList, allowList };
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
