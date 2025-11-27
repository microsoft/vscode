/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IChatTerminalToolInvocationData } from '../../../../chat/common/chatService.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';

export class TerminalCommandArtifactCollector {
	constructor(
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) { }

	async capture(
		toolSpecificData: IChatTerminalToolInvocationData,
		instance: ITerminalInstance,
		commandId: string | undefined,
	): Promise<void> {
		if (commandId) {
			try {
				toolSpecificData.terminalCommandUri = this._createTerminalCommandUri(instance, commandId);
			} catch (error) {
				this._logService.warn(`RunInTerminalTool: Failed to create terminal command URI for ${commandId}`, error);
			}

			const command = await this._tryGetCommand(instance, commandId);
			if (command) {
				toolSpecificData.terminalCommandState = {
					exitCode: command.exitCode,
					timestamp: command.timestamp,
					duration: command.duration
				};
				this._applyTheme(toolSpecificData, instance);
				return;
			}
		}

		this._applyTheme(toolSpecificData, instance);
	}

	private _applyTheme(toolSpecificData: IChatTerminalToolInvocationData, instance: ITerminalInstance): void {
		const theme = instance.xterm?.getXtermTheme();
		if (theme) {
			toolSpecificData.terminalTheme = { background: theme.background, foreground: theme.foreground };
		}
	}

	private _createTerminalCommandUri(instance: ITerminalInstance, commandId: string): URI {
		const params = new URLSearchParams(instance.resource.query);
		params.set('command', commandId);
		return instance.resource.with({ query: params.toString() });
	}

	private async _tryGetCommand(instance: ITerminalInstance, commandId: string) {
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		return commandDetection?.commands.find(c => c.id === commandId);
	}
}
