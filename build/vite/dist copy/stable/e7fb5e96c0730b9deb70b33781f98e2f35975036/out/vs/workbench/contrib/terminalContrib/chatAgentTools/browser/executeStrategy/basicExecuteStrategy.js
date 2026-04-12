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
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { trackIdleOnPrompt, waitForIdle } from './executeStrategy.js';
import { createAltBufferPromise, setupRecreatingStartMarker, stripCommandEchoAndPrompt } from './strategyHelpers.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
/**
 * This strategy is used when shell integration is enabled, but rich command detection was not
 * declared by the shell script. This is the large spectrum between rich command detection and no
 * shell integration, here are some problems that are expected:
 *
 * - `133;C` command executed may not happen.
 * - `633;E` comamnd line reporting will likely not happen, so the command line contained in the
 *   execution start and end events will be of low confidence and chances are it will be wrong.
 * - Execution tracking may be incorrect, particularly when `executeCommand` calls are overlapped,
 *   such as Python activating the environment at the same time as Copilot executing a command. So
 *   the end event for the execution may actually correspond to a different command.
 *
 * This strategy focuses on trying to get the most accurate output given these limitations and
 * unknowns. Basically we cannot fully trust the extension APIs in this case, so polling of the data
 * stream is used to detect idling, and we listen to the terminal's data stream instead of the
 * execution's data stream.
 *
 * This is best effort with the goal being the output is accurate, though it may contain some
 * content above and below the command output, such as prompts or even possibly other command
 * output. We lean on the LLM to be able to differentiate the actual output from prompts and bad
 * output when it's not ideal.
 */
let BasicExecuteStrategy = class BasicExecuteStrategy extends Disposable {
    constructor(_instance, _hasReceivedUserInput, _commandDetection, _configurationService, _logService) {
        super();
        this._instance = _instance;
        this._hasReceivedUserInput = _hasReceivedUserInput;
        this._commandDetection = _commandDetection;
        this._configurationService = _configurationService;
        this._logService = _logService;
        this.type = 'basic';
        this._startMarker = this._register(new MutableDisposable());
        this._onDidCreateStartMarker = this._register(new Emitter);
        this.onDidCreateStartMarker = this._onDidCreateStartMarker.event;
    }
    async execute(commandLine, token, commandId) {
        const store = new DisposableStore();
        try {
            const idlePollInterval = this._configurationService.getValue("chat.tools.terminal.idlePollInterval" /* TerminalChatAgentToolsSettingId.IdlePollInterval */) ?? 1000;
            const idlePromptPromise = trackIdleOnPrompt(this._instance, idlePollInterval, store, idlePollInterval);
            const onDone = Promise.race([
                Event.toPromise(this._commandDetection.onCommandFinished, store).then(e => {
                    // When shell integration is basic, it means that the end execution event is
                    // often misfired since we don't have command line verification. Because of this
                    // we make sure the prompt is idle after the end execution event happens.
                    this._log('onDone 1 of 2 via end event, waiting for short idle prompt');
                    return idlePromptPromise.then(() => {
                        this._log('onDone 2 of 2 via short idle prompt');
                        return {
                            'type': 'success',
                            command: e
                        };
                    });
                }),
                Event.toPromise(token.onCancellationRequested, store).then(() => {
                    this._log('onDone via cancellation');
                }),
                Event.toPromise(this._instance.onDisposed, store).then(() => {
                    this._log('onDone via terminal disposal');
                    return { type: 'disposal' };
                }),
                // A longer idle prompt event is used here as a catch all for unexpected cases where
                // the end event doesn't fire for some reason.
                trackIdleOnPrompt(this._instance, idlePollInterval * 3, store, idlePollInterval).then(() => {
                    this._log('onDone long idle prompt');
                }),
            ]);
            // Ensure xterm is available
            this._log('Waiting for xterm');
            const xterm = await this._instance.xtermReadyPromise;
            if (!xterm) {
                throw new Error('Xterm is not available');
            }
            const alternateBufferPromise = createAltBufferPromise(xterm, store, this._log.bind(this));
            // Wait for the terminal to idle before executing the command
            this._log('Waiting for idle');
            await waitForIdle(this._instance.onData, idlePollInterval);
            const markerRecreation = setupRecreatingStartMarker(xterm, this._startMarker, m => this._onDidCreateStartMarker.fire(m), store, this._log.bind(this));
            if (this._hasReceivedUserInput()) {
                this._log('Command timed out, sending SIGINT and retrying');
                // Send SIGINT (Ctrl+C)
                await this._instance.sendText('\x03', false);
                await waitForIdle(this._instance.onData, 100);
            }
            // Execute the command
            if (commandId) {
                this._log(`In basic execute strategy: skipping pre-bound command id ${commandId} because basic shell integration executes via sendText`);
            }
            // IMPORTANT: This uses `sendText` not `runCommand` since when basic shell integration
            // is used as it's more common to not recognize the prompt input which would result in
            // ^C being sent and also to return the exit code of 130 when from the shell when that
            // occurs.
            this._log(`Executing command line \`${commandLine}\``);
            markerRecreation.dispose();
            const forceBracketedPasteMode = isMacintosh;
            this._instance.sendText(commandLine, true, forceBracketedPasteMode);
            // Wait for the next end execution event - note that this may not correspond to the actual
            // execution requested
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
            if (finishedCommand) {
                this._log(`Finished command id=${finishedCommand.id ?? 'none'} for requested=${commandId ?? 'none'}`);
            }
            else if (commandId) {
                this._log(`No finished command surfaced for requested=${commandId}`);
            }
            // Wait for the terminal to idle
            this._log('Waiting for idle');
            await waitForIdle(this._instance.onData, idlePollInterval);
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
        this._logService.debug(`RunInTerminalTool#Basic: ${message}`);
    }
};
BasicExecuteStrategy = __decorate([
    __param(3, IConfigurationService),
    __param(4, ITerminalLogService)
], BasicExecuteStrategy);
export { BasicExecuteStrategy };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzaWNFeGVjdXRlU3RyYXRlZ3kuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci9leGVjdXRlU3RyYXRlZ3kvYmFzaWNFeGVjdXRlU3RyYXRlZ3kudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUV6RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsV0FBVyxFQUFzRSxNQUFNLHNCQUFzQixDQUFDO0FBRzFJLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSwwQkFBMEIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRXJILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUV4RTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBcUJHO0FBQ0ksSUFBTSxvQkFBb0IsR0FBMUIsTUFBTSxvQkFBcUIsU0FBUSxVQUFVO0lBUW5ELFlBQ2tCLFNBQTRCLEVBQzVCLHFCQUFvQyxFQUNwQyxpQkFBOEMsRUFDeEMscUJBQTZELEVBQy9ELFdBQWlEO1FBRXRFLEtBQUssRUFBRSxDQUFDO1FBTlMsY0FB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