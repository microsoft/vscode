/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IErdosAiSettingsService } from '../../erdosAiSettings/common/settingsService.js';

/**
 * Bash command parser that uses extension host for real parsing via bash-parser
 * Uses the npm bash-parser library running in Node.js extension host environment
 */
export class BashCommandExtractor {
	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IErdosAiSettingsService private readonly settingsService: IErdosAiSettingsService
	) {}

	/**
	 * Check if a bash script should be auto-accepted based on settings
	 * @param script The bash script to check
	 * @returns True if should auto-accept, false otherwise
	 */
	public async checkAutoAccept(script: string): Promise<boolean> {
		const autoAcceptTerminal = await this.settingsService.getAutoAcceptTerminal();
		if (!autoAcceptTerminal) {
			return false;
		}

		const mode = await this.settingsService.getTerminalAutoAcceptMode();
		const allowList = await this.settingsService.getTerminalAllowList();
		const denyList = await this.settingsService.getTerminalDenyList();

		// Use extension host for parsing with bash-parser
		const result = await this.commandService.executeCommand('erdosAi.parseBashCommands', script);
		const commands = result as string[] || [];

		if (commands.length === 0) {
			return false;
		}

		let shouldAutoAccept: boolean;
		if (mode === 'allow-list') {
			// All commands must be in allow list
			shouldAutoAccept = commands.every(cmd => allowList.includes(cmd));
		} else {
			// None of the commands should be in deny list
			shouldAutoAccept = !commands.some(cmd => denyList.includes(cmd));
		}
		
		return shouldAutoAccept;
	}
}