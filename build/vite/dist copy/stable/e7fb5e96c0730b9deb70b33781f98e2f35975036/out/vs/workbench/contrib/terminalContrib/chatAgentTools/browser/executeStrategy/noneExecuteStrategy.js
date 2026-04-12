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
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { waitForIdle, waitForIdleWithPromptHeuristics } from './executeStrategy.js';
import { createAltBufferPromise, setupRecreatingStartMarker, stripCommandEchoAndPrompt } from './strategyHelpers.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
/**
 * This strategy is used when no shell integration is available. There are very few extension APIs
 * available in this case. This uses similar strategies to the basic integration strategy, but
 * with `sendText` instead of `shellIntegration.executeCommand` and relying on idle events instead
 * of execution events.
 */
let NoneExecuteStrategy = class NoneExecuteStrategy extends Disposable {
    constructor(_instance, _hasReceivedUserInput, _configurationService, _logService) {
        super();
        this._instance = _instance;
        this._hasReceivedUserInput = _hasReceivedUserInput;
        this._configurationService = _configurationService;
        this._logService = _logService;
        this.type = 'none';
        this._startMarker = this._register(new MutableDisposable());
        this._onDidCreateStartMarker = this._register(new Emitter);
        this.onDidCreateStartMarker = this._onDidCreateStartMarker.event;
    }
    async execute(commandLine, token, commandId) {
        const store = new DisposableStore();
        try {
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            // Ensure xterm is available
            this._log('Waiting for xterm');
            const xterm = await this._instance.xtermReadyPromise;
            if (!xterm) {
                throw new Error('Xterm is not available');
            }
            const alternateBufferPromise = createAltBufferPromise(xterm, store, this._log.bind(this));
            const idlePollInterval = this._configurationService.getValue("chat.tools.terminal.idlePollInterval" /* TerminalChatAgentToolsSettingId.IdlePollInterval */) ?? 1000;
            // Wait for the terminal to idle before executing the command
            this._log('Waiting for idle');
            await waitForIdle(this._instance.onData, idlePollInterval);
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            const markerRecreation = setupRecreatingStartMarker(xterm, this._startMarker, m => this._onDidCreateStartMarker.fire(m), store, this._log.bind(this));
            if (this._hasReceivedUserInput()) {
                this._log('Command timed out, sending SIGINT and retrying');
                // Send SIGINT (Ctrl+C)
                await this._instance.sendText('\x03', false);
                await waitForIdle(this._instance.onData, 100);
            }
            // Execute the command
            // IMPORTANT: This uses `sendText` not `runCommand` since when no shell integration
            // is used as sending ctrl+c before a shell is initialized (eg. PSReadLine) can result
            // in failure (https://github.com/microsoft/vscode/issues/258989)
            this._log(`Executing command line \`${commandLine}\``);
            markerRecreation.dispose();
            const startLine = this._startMarker.value?.line;
            const forceBracketedPasteMode = isMacintosh;
            this._instance.sendText(commandLine, true, forceBracketedPasteMode);
            // Wait for the cursor to move past the command line before
            // starting idle detection. Without this, the idle poll may
            // resolve immediately on the existing prompt if the shell
            // hasn't started processing the command yet.
            if (startLine !== undefined) {
                this._log('Waiting for cursor to move past start line');
                const cursorMovedPromise = new Promise(resolve => {
                    const check = () => {
                        const buffer = xterm.raw.buffer.active;
                        const cursorLine = buffer.baseY + buffer.cursorY;
                        if (cursorLine > startLine) {
                            resolve();
                        }
                    };
                    const listener = this._instance.onData(() => check());
                    store.add(listener);
                    check();
                });
                const cursorMoveTimeout = new Promise(resolve => {
                    const handle = setTimeout(() => resolve('timeout'), 1000);
                    store.add({ dispose: () => clearTimeout(handle) });
                });
                const raceResult = await Promise.race([cursorMovedPromise, cursorMoveTimeout]);
                if (raceResult === 'timeout') {
                    this._log('Cursor did not move past start line before timeout, proceeding with idle detection');
                }
            }
            // Assume the command is done when it's idle
            this._log('Waiting for idle with prompt heuristics');
            const promptResultOrAltBuffer = await Promise.race([
                waitForIdleWithPromptHeuristics(this._instance.onData, this._instance, idlePollInterval, idlePollInterval * 10),
                alternateBufferPromise.then(() => 'alternateBuffer')
            ]);
            if (promptResultOrAltBuffer === 'alternateBuffer') {
                this._log('Detected alternate buffer entry, skipping output capture');
                return {
                    output: undefined,
                    additionalInformation: undefined,
                    exitCode: undefined,
                    error: 'alternateBuffer',
                    didEnterAltBuffer: true,
                };
            }
            const promptResult = promptResultOrAltBuffer;
            this._log(`Prompt detection result: ${promptResult.detected ? 'detected' : 'not detected'} - ${promptResult.reason}`);
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            const endMarker = store.add(xterm.raw.registerMarker());
            // Assemble final result - exit code is not available without shell integration
            let output;
            const additionalInformationLines = [];
            try {
                output = xterm.getContentsAsText(this._startMarker.value, endMarker);
                this._log('Fetched output via markers');
                // The marker-based output includes the command echo (the line where the
                // command was typed) and the next prompt line. Strip them to isolate
                // only the actual command output. The first line always contains the
                // command echo (since the start marker is placed at the cursor before
                // sendText), and trailing lines that look like shell prompts are removed.
                if (output !== undefined) {
                    output = stripCommandEchoAndPrompt(output, commandLine, this._log.bind(this));
                }
            }
            catch {
                this._log('Failed to fetch output via markers');
                additionalInformationLines.push('Failed to retrieve command output');
            }
            if (output !== undefined && output.trim().length === 0) {
                additionalInformationLines.push('Command produced no output');
            }
            return {
                output,
                additionalInformation: additionalInformationLines.length > 0 ? additionalInformationLines.join('\n') : undefined,
                exitCode: undefined,
            };
        }
        finally {
            store.dispose();
        }
    }
    _log(message) {
        this._logService.debug(`RunInTerminalTool#None: ${message}`);
    }
};
NoneExecuteStrategy = __decorate([
    __param(2, IConfigurationService),
    __param(3, ITerminalLogService)
], NoneExecuteStrategy);
export { NoneExecuteStrategy };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9uZUV4ZWN1dGVTdHJhdGVneS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL2V4ZWN1dGVTdHJhdGVneS9ub25lRXhlY3V0ZVN0cmF0ZWd5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxXQUFXLEVBQUUsK0JBQStCLEVBQXNFLE1BQU0sc0JBQXNCLENBQUM7QUFHeEosT0FBTyxFQUFFLHNCQUFzQixFQUFFLDBCQUEwQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFckgsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRXhFOzs7OztHQUtHO0FBQ0ksSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVO0lBUWxELFlBQ2tCLFNBQTRCLEVBQzVCLHFCQUFvQyxFQUM5QixxQkFBNkQsRUFDL0QsV0FBaUQ7UUFFdEUsS0FBSyxFQUFFLENBQUM7UUFMUyxjQUFTLEdBQVQsU0FBUyxDQUFtQjtRQUM1QiwwQkFBcUIsR0FBckIscUJBQXFCLENBQWU7UUFDYiwwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQzlDLGdCQUFXLEdBQVgsV0FBVyxDQUFxQjtRQVg5RCxTQUFJLEdBQUcsTUFBTSxDQUFDO1FBQ04saUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUJBQWlCLEVBQWdCLENBQUMsQ0FBQztRQUdyRSw0QkFBdUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBaUMsQ0FBQyxDQUFDO1FBQzFGLDJCQUFzQixHQUFvQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDO0lBU3BHLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLFdBQW1CLEVBQUUsS0FBd0IsRUFBRSxTQUFrQjtRQUM5RSxNQUFNLEtBQUssR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQ3BDLElBQUksQ0FBQztZQUNKLElBQUksS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7Z0JBQ25DLE1BQU0sSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1lBQy9CLENBQUM7WUFFRCw0QkFBNEI7WUFDNUIsSUFBSSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1lBQy9CLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQztZQUNyRCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1lBQzNDLENBQUM7WUFDRCxNQUFNLHNCQUFzQixHQUFHLHNCQUFzQixDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUUxRixNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLCtGQUEwRCxJQUFJLElBQUksQ0FBQztZQUUvSCw2REFBNkQ7WUFDN0QsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQzlCLE1BQU0sV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLGdCQUFnQixDQUFDLENBQUM7WUFDM0QsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztnQkFDbkMsTUFBTSxJQUFJLGlCQUFpQixFQUFFLENBQUM7WUFDL0IsQ0FBQztZQUVELE1BQU0sZ0JBQWdCLEdBQUcsMEJBQTBCLENBQ2xELEtBQUssRUFDTCxJQUFJLENBQUMsWUFBWSxFQUNqQixDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQ3pDLEtBQUssRUFDTCxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FDcEIsQ0FBQztZQUVGLElBQUksSUFBSSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQztnQkFDbEMsSUFBSSxDQUFDLElBQUksQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDO2dCQUM1RCx1QkFBdUI7Z0JBQ3ZCLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUM3QyxNQUFNLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQztZQUMvQyxDQUFDO1lBRUQsc0JBQXNCO1lBQ3RCLG1GQUFtRjtZQUNuRixzRkFBc0Y7WUFDdEYsaUVBQWlFO1lBQ2pFLElBQUksQ0FBQyxJQUFJLENBQUMsNEJBQTRCLFdBQVcsSUFBSSxDQUFDLENBQUM7WUFDdkQsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDM0IsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDO1lBQ2hELE1BQU0sdUJBQXVCLEdBQUcsV0FBVyxDQUFDO1lBQzVDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxJQUFJLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztZQUVwRSwyREFBMkQ7WUFDM0QsMkRBQTJEO1lBQzNELDBEQUEwRDtZQUMxRCw2Q0FBNkM7WUFDN0MsSUFBSSxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsNENBQTRDLENBQUMsQ0FBQztnQkFDeEQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLE9BQU8sQ0FBTyxPQUFPLENBQUMsRUFBRTtvQkFDdEQsTUFBTSxLQUFLLEdBQUcsR0FBRyxFQUFFO3dCQUNsQixNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7d0JBQ3ZDLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQzt3QkFDakQsSUFBSSxVQUFVLEdBQUcsU0FBUyxFQUFFLENBQUM7NEJBQzVCLE9BQU8sRUFBRSxDQUFDO3dCQUNYLENBQUM7b0JBQ0YsQ0FBQyxDQUFDO29CQUNGLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7b0JBQ3RELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3BCLEtBQUssRUFBRSxDQUFDO2dCQUNULENBQUMsQ0FBQyxDQUFDO2dCQUVILE1BQU0saUJBQWlCLEdBQUcsSUFBSSxPQUFPLENBQVksT0FBTyxDQUFDLEVBQUU7b0JBQzFELE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQzFELEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDcEQsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsTUFBTSxVQUFVLEdBQUcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO2dCQUMvRSxJQUFJLFVBQVUsS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDOUIsSUFBSSxDQUFDLElBQUksQ0FBQyxvRkFBb0YsQ0FBQyxDQUFDO2dCQUNqRyxDQUFDO1lBQ0YsQ0FBQztZQUdELDRDQUE0QztZQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDLHlDQUF5QyxDQUFDLENBQUM7WUFDckQsTUFBTSx1QkFBdUIsR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUM7Z0JBQ2xELCtCQUErQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEdBQUcsRUFBRSxDQUFDO2dCQUMvRyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsaUJBQTBCLENBQUM7YUFDN0QsQ0FBQyxDQUFDO1lBQ0gsSUFBSSx1QkFBdUIsS0FBSyxpQkFBaUIsRUFBRSxDQUFDO2dCQUNuRCxJQUFJLENBQUMsSUFBSSxDQUFDLDBEQUEwRCxDQUFDLENBQUM7Z0JBQ3RFLE9BQU87b0JBQ04sTUFBTSxFQUFFLFNBQVM7b0JBQ2pCLHFCQUFxQixFQUFFLFNBQVM7b0JBQ2hDLFFBQVEsRUFBRSxTQUFTO29CQUNuQixLQUFLLEVBQUUsaUJBQWlCO29CQUN4QixpQkFBaUIsRUFBRSxJQUFJO2lCQUN2QixDQUFDO1lBQ0gsQ0FBQztZQUNELE1BQU0sWUFBWSxHQUFHLHVCQUF1QixDQUFDO1lBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsNEJBQTRCLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsY0FBYyxNQUFNLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBRXRILElBQUksS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7Z0JBQ25DLE1BQU0sSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1lBQy9CLENBQUM7WUFDRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztZQUV4RCwrRUFBK0U7WUFDL0UsSUFBSSxNQUEwQixDQUFDO1lBQy9CLE1BQU0sMEJBQTBCLEdBQWEsRUFBRSxDQUFDO1lBQ2hELElBQUksQ0FBQztnQkFDSixNQUFNLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUNyRSxJQUFJLENBQUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLENBQUM7Z0JBRXhDLHdFQUF3RTtnQkFDeEUscUVBQXFFO2dCQUNyRSxxRUFBcUU7Z0JBQ3JFLHNFQUFzRTtnQkFDdEUsMEVBQTBFO2dCQUMxRSxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDMUIsTUFBTSxHQUFHLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDL0UsQ0FBQztZQUNGLENBQUM7WUFBQyxNQUFNLENBQUM7Z0JBQ1IsSUFBSSxDQUFDLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO2dCQUNoRCwwQkFBMEIsQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsQ0FBQztZQUN0RSxDQUFDO1lBRUQsSUFBSSxNQUFNLEtBQUssU0FBUyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3hELDBCQUEwQixDQUFDLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1lBQy9ELENBQUM7WUFFRCxPQUFPO2dCQUNOLE1BQU07Z0JBQ04scUJBQXFCLEVBQUUsMEJBQTBCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO2dCQUNoSCxRQUFRLEVBQUUsU0FBUzthQUNuQixDQUFDO1FBQ0gsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pCLENBQUM7SUFDRixDQUFDO0lBRU8sSUFBSSxDQUFDLE9BQWU7UUFDM0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsMkJBQTJCLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDOUQsQ0FBQztDQUNELENBQUE7QUE5SlksbUJBQW1CO0lBVzdCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxtQkFBbUIsQ0FBQTtHQVpULG1CQUFtQixDQThKL0IifQ==