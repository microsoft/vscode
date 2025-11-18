/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IChatTerminalToolInvocationData } from '../../../../chat/common/chatService.js';
import { CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES } from '../../../../chat/common/constants.js';
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
		fallbackOutput?: string
	): Promise<void> {
		if (commandId) {
			try {
				toolSpecificData.terminalCommandUri = this._createTerminalCommandUri(instance, commandId);
			} catch (error) {
				this._logService.warn(`RunInTerminalTool: Failed to create terminal command URI for ${commandId}`, error);
			}

			const serialized = await this._tryGetSerializedCommandOutput(toolSpecificData, instance, commandId);
			if (serialized) {
				toolSpecificData.terminalCommandOutput = { text: serialized.text, truncated: serialized.truncated };
				toolSpecificData.terminalCommandState = {
					exitCode: serialized.exitCode,
					timestamp: serialized.timestamp,
					duration: serialized.duration
				};
				this._applyTheme(toolSpecificData, instance);
				return;
			}
		}

		if (fallbackOutput !== undefined) {
			const normalized = fallbackOutput.replace(/\r\n/g, '\n');
			toolSpecificData.terminalCommandOutput = { text: normalized, truncated: false };
			this._applyTheme(toolSpecificData, instance);
		}
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

	private async _tryGetSerializedCommandOutput(toolSpecificData: IChatTerminalToolInvocationData, instance: ITerminalInstance, commandId: string): Promise<{ text: string; truncated?: boolean; exitCode?: number; timestamp?: number; duration?: number } | undefined> {
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const command = commandDetection?.commands.find(c => c.id === commandId);

		if (!command?.endMarker) {
			return undefined;
		}

		const xterm = await instance.xtermReadyPromise;
		if (!xterm) {
			return undefined;
		}

		try {
			const result = await xterm.getCommandOutputAsHtml(command, CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES);
			return {
				text: result.text,
				truncated: result.truncated,
				exitCode: command.exitCode,
				timestamp: command.timestamp,
				duration: command.duration
			};
		} catch (error) {
			this._logService.warn(`RunInTerminalTool: Failed to serialize command output for ${commandId}`, error);
			return undefined;
		}
	}
}
