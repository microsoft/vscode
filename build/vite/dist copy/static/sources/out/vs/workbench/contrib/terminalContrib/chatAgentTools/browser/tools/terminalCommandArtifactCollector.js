/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { getCommandOutputSnapshot } from '../../../../terminal/browser/chatTerminalCommandMirror.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
let TerminalCommandArtifactCollector = class TerminalCommandArtifactCollector {
    constructor(_logService) {
        this._logService = _logService;
    }
    async capture(toolSpecificData, instance, commandId) {
        if (commandId) {
            try {
                toolSpecificData.terminalCommandUri = this._createTerminalCommandUri(instance, commandId);
            }
            catch (error) {
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
    async _captureCommandOutput(instance, command) {
        try {
            await instance.xtermReadyPromise;
        }
        catch {
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
    async _capturePartialCommandOutput(instance, commandId) {
        try {
            await instance.xtermReadyPromise;
        }
        catch {
            return undefined;
        }
        const xterm = instance.xterm;
        if (!xterm) {
            return undefined;
        }
        // Try to find the current/partial command
        const commandDetection = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        const currentCommand = commandDetection?.currentCommand;
        if (currentCommand && currentCommand.id === commandId) {
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
                }
                catch (error) {
                    this._logService.debug(`RunInTerminalTool: Failed to capture partial command output`, error);
                }
            }
        }
        return undefined;
    }
    _applyTheme(toolSpecificData, instance) {
        const theme = instance.xterm?.getXtermTheme();
        if (theme) {
            toolSpecificData.terminalTheme = { background: theme.background, foreground: theme.foreground };
        }
    }
    _createTerminalCommandUri(instance, commandId) {
        const params = new URLSearchParams(instance.resource.query);
        params.set('command', commandId);
        return instance.resource.with({ query: params.toString() });
    }
    async _tryGetCommand(instance, commandId) {
        const commandDetection = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        return commandDetection?.commands.find(c => c.id === commandId);
    }
};
TerminalCommandArtifactCollector = __decorate([
    __param(0, ITerminalLogService)
], TerminalCommandArtifactCollector);
export { TerminalCommandArtifactCollector };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb21tYW5kQXJ0aWZhY3RDb2xsZWN0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy90ZXJtaW5hbENvbW1hbmRBcnRpZmFjdENvbGxlY3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUtoRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUVyRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUV0RixJQUFNLGdDQUFnQyxHQUF0QyxNQUFNLGdDQUFnQztJQUM1QyxZQUN1QyxXQUFnQztRQUFoQyxnQkFBVyxHQUFYLFdBQVcsQ0FBcUI7SUFDbkUsQ0FBQztJQUVMLEtBQUssQ0FBQyxPQUFPLENBQ1osZ0JBQWlELEVBQ2pELFFBQTJCLEVBQzNCLFNBQTZCO1FBRTdCLElBQUksU0FBUyxFQUFFLENBQUM7WUFDZixJQUFJLENBQUM7Z0JBQ0osZ0JBQWdCLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUMzRixDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZ0VBQWdFLFNBQVMsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNHLENBQUM7WUFFRCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQy9ELElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ2IsZ0JBQWdCLENBQUMsb0JBQW9CLEdBQUc7b0JBQ3ZDLFFBQVEsRUFBRSxPQUFP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