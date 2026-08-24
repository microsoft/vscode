/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IChatTerminalToolInvocationData } from '../../../../chat/common/chatService/chatService.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { getCommandOutputSnapshot } from '../../../../terminal/browser/chatTerminalCommandMirror.js';
import { TerminalCapability, type ITerminalCommand } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
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
				const snapshot = await this._captureCommandOutput(instance, command);
				if (snapshot) {
					toolSpecificData.terminalCommandOutput = snapshot;
				}
				this._applyTheme(toolSpecificData, instance);
				return;
			}

			// Command not found in finished commands - try to capture current/partial command output
			const partialSnapshot = await this._capturePartialCommandOutput(instance, commandId);
			if (partialSnapshot) {
				toolSpecificData.terminalCommandOutput = partialSnapshot;
				this._logService.debug(`RunInTerminalTool: Captured partial command output for ${commandId}`);
			}
		}

		this._applyTheme(toolSpecificData, instance);
	}

	private async _captureCommandOutput(instance: ITerminalInstance, command: ITerminalCommand): Promise<IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined> {
		try {
			await instance.xtermReadyPromise;
		} catch {
			return undefined;
		}
		const xterm = instance.xterm;
		if (!xterm) {
			return undefined;
		}

		return getCommandOutputSnapshot(xterm, command, (reason, error) => {
			const suffix = reason === 'fallback' ? ' (fallback)' : '';
			this._logService.debug(`RunInTerminalTool: Failed to snapshot command output${suffix}`, error);
		});
	}

	/**
	 * Captures output from a partial/current command that hasn't finished yet.
	 * This is used when the command is cancelled mid-execution.
	 */
	private async _capturePartialCommandOutput(instance: ITerminalInstance, commandId: string): Promise<IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined> {
		try {
			await instance.xtermReadyPromise;
		} catch {
			return undefined;
		}
		const xterm = instance.xterm;
		if (!xterm) {
			return undefined;
		}

		// Try to find the current/partial command
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const currentCommand = commandDetection?.currentCommand;
		if (currentCommand && (currentCommand as { id?: string }).id === commandId) {
			// Use commandExecutedMarker from partial command
			const executedMarker = currentCommand.commandExecutedMarker;
			if (executedMarker && !executedMarker.isDisposed) {
				try {
					// Get text from executed marker to current cursor position
					const raw = xterm.raw;
					const buffer = raw.buffer.active;
					const endLine = buffer.baseY + buffer.cursorY;
					const startLine = executedMarker.line;
					const lineCount = Math.max(endLine - startLine, 0);

					if (lineCount > 0) {
						const text = await xterm.getRangeAsVT(executedMarker, undefined, true);
						if (text) {
							return { text, lineCount };
						}
					}
				} catch (error) {
					this._logService.debug(`RunInTerminalTool: Failed to capture partial command output`, error);
				}
			}
		}

		return undefined;
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
