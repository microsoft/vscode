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
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isNumber } from '../../../../../../base/common/types.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { isCI, isMacintosh } from '../../../../../../base/common/platform.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { trackIdleOnPrompt } from './executeStrategy.js';
import { createAltBufferPromise, setupRecreatingStartMarker, stripCommandEchoAndPrompt } from './strategyHelpers.js';
/**
 * This strategy is used when the terminal has rich shell integration/command detection is
 * available, meaning every sequence we rely upon should be exactly where we expect it to be. In
 * particular (`633;`) `A, B, E, C, D` all happen in exactly that order. While things still could go
 * wrong in this state, minimal verification is done in this mode since rich command detection is a
 * strong signal that it's behaving correctly.
 */
let RichExecuteStrategy = class RichExecuteStrategy extends Disposable {
    constructor(_instance, _commandDetection, _configurationService, _logService) {
        super();
        this._instance = _instance;
        this._commandDetection = _commandDetection;
        this._configurationService = _configurationService;
        this._logService = _logService;
        this.type = 'rich';
        this._startMarker = this._register(new MutableDisposable());
        this._onDidCreateStartMarker = this._register(new Emitter);
        this.onDidCreateStartMarker = this._onDidCreateStartMarker.event;
    }
    async execute(commandLine, token, commandId) {
        const store = new DisposableStore();
        try {
            // Ensure xterm is available
            this._log('Waiting for xterm');
            const xterm = await this._instance.xtermReadyPromise;
            if (!xterm) {
                throw new Error('Xterm is not available');
            }
            const alternateBufferPromise = createAltBufferPromise(xterm, store, this._log.bind(this));
            const idlePollInterval = this._configurationService.getValue("chat.tools.terminal.idlePollInterval" /* TerminalChatAgentToolsSettingId.IdlePollInterval */) ?? 1000;
            const onDone = Promise.race([
                Event.toPromise(this._commandDetection.onCommandFinished, store).then(e => {
                    this._log('onDone via end event');
                    return {
                        'type': 'success',
                        command: e
                    };
                }),
                Event.toPromise(token.onCancellationRequested, store).then(() => {
                    this._log('onDone via cancellation');
                }),
                Event.toPromise(this._instance.onDisposed, store).then(() => {
                    this._log('onDone via terminal disposal');
                    return { type: 'disposal' };
                }),
                trackIdleOnPrompt(this._instance, idlePollInterval, store, idlePollInterval).then(() => {
                    this._log('onDone via idle prompt');
                }),
            ]);
            const markerRecreation = setupRecreatingStartMarker(xterm, this._startMarker, m => this._onDidCreateStartMarker.fire(m), store, this._log.bind(this));
            // Execute the command
            this._log(`Executing command line \`${commandLine}\``);
            markerRecreation.dispose();
            const forceBracketedPasteMode = isMacintosh;
            this._instance.runCommand(commandLine, true, commandId, forceBracketedPasteMode);
            // Wait for the terminal to idle
            this._log('Waiting for done event');
            const onDoneResult = await Promise.race([onDone, alternateBufferPromise.then(() => ({ type: 'alternateBuffer' }))]);
            if (onDoneResult && onDoneResult.type === 'disposal') {
                throw new Error('The terminal was closed');
            }
            if (onDoneResult && onDoneResult.type === 'alternateBuffer') {
                this._log('Detected alternate buffer entry, skipping output capture');
                return {
                    output: undefined,
                    exitCode: undefined,
                    error: 'alternateBuffer',
                    didEnterAltBuffer: true
                };
            }
            const finishedCommand = onDoneResult && onDoneResult.type === 'success' ? onDoneResult.command : undefined;
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            const endMarker = store.add(xterm.raw.registerMarker());
            // Assemble final result
            let output;
            const additionalInformationLines = [];
            if (finishedCommand) {
                const commandOutput = finishedCommand?.getOutput();
                if (commandOutput !== undefined) {
                    this._log('Fetched output via finished command');
                    // On some platforms (e.g. Windows/PowerShell), shell integration
                    // markers can misfire and getOutput() includes the command echo.
                    // Strip it defensively — the function is a no-op when the output
                    // is already clean.
                    output = stripCommandEchoAndPrompt(commandOutput, commandLine, this._log.bind(this));
                }
            }
            if (output === undefined) {
                try {
                    output = xterm.getContentsAsText(this._startMarker.value, endMarker);
                    this._log('Fetched output via markers');
                    // The marker-based output includes the command echo and trailing
                    // prompt lines. Strip them to isolate the actual command output.
                    if (output !== undefined) {
                        output = stripCommandEchoAndPrompt(output, commandLine, this._log.bind(this));
                    }
                }
                catch {
                    this._log('Failed to fetch output via markers');
                    additionalInformationLines.push('Failed to retrieve command output');
                }
            }
            if (output !== undefined && output.trim().length === 0) {
                additionalInformationLines.push('Command produced no output');
            }
            const exitCode = finishedCommand?.exitCode;
            if (isNumber(exitCode) && exitCode > 0) {
                additionalInformationLines.push(`Command exited with code ${exitCode}`);
            }
            return {
                output,
                additionalInformation: additionalInformationLines.length > 0 ? additionalInformationLines.join('\n') : undefined,
                exitCode,
            };
        }
        finally {
            store.dispose();
        }
    }
    _log(message) {
        const msg = `RunInTerminalTool#Rich: ${message}`;
        if (isCI) {
            this._logService.info(msg);
        }
        else {
            this._logService.debug(msg);
        }
    }
};
RichExecuteStrategy = __decorate([
    __param(2, IConfigurationService),
    __param(3, ITerminalLogService)
], RichExecuteStrategy);
export { RichExecuteStrategy };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmljaEV4ZWN1dGVTdHJhdGVneS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL2V4ZWN1dGVTdHJhdGVneS9yaWNoRXhlY3V0ZVN0cmF0ZWd5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM1RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUU3RixPQUFPLEVBQUUsaUJBQWlCLEVBQXNFLE1BQU0sc0JBQXNCLENBQUM7QUFFN0gsT0FBTyxFQUFFLHNCQUFzQixFQUFFLDBCQUEwQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFHckg7Ozs7OztHQU1HO0FBQ0ksSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVO0lBT2xELFlBQ2tCLFNBQTRCLEVBQzVCLGlCQUE4QyxFQUN4QyxxQkFBNkQsRUFDL0QsV0FBaUQ7UUFFdEUsS0FBSyxFQUFFLENBQUM7UUFMUyxjQUFTLEdBQVQsU0FBUyxDQUFtQjtRQUM1QixzQkFBaUIs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