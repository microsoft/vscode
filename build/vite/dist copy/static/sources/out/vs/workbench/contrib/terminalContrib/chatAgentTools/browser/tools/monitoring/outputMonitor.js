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
import { timeout } from '../../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { isObject, isString } from '../../../../../../../base/common/types.js';
import { localize } from '../../../../../../../nls.js';
import { IChatWidgetService } from '../../../../../chat/browser/chat.js';
import { ChatElicitationRequestPart } from '../../../../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatModel } from '../../../../../chat/common/model/chatModel.js';
import { IChatService } from '../../../../../chat/common/chatService/chatService.js';
import { ChatRequestTextPart } from '../../../../../chat/common/requestParser/chatParserTypes.js';
import { OffsetRange } from '../../../../../../../editor/common/core/ranges/offsetRange.js';
import { ChatAgentLocation, ChatPermissionLevel } from '../../../../../chat/common/constants.js';
import { getTextResponseFromStream, ILanguageModelsService } from '../../../../../chat/common/languageModels.js';
import { ITaskService } from '../../../../../tasks/common/taskService.js';
import { OutputMonitorState } from './types.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { ITerminalLogService } from '../../../../../../../platform/terminal/common/terminal.js';
let OutputMonitor = class OutputMonitor extends Disposable {
    get state() { return this._state; }
    _formatLastLineForLog(output) {
        if (!output) {
            return '<empty>';
        }
        const lastLine = output.trimEnd().split(/\r?\n/).pop() ?? '';
        if (!lastLine) {
            return '<empty>';
        }
        // Avoid logging potentially sensitive values from common secret prompts.
        if (this._isSensitivePrompt(lastLine)) {
            return '<redacted>';
        }
        // Keep logs bounded.
        return lastLine.length > 200 ? lastLine.slice(0, 200) + '…' : lastLine;
    }
    _formatOptionsForLog(options) {
        if (!options.length) {
            return '[]';
        }
        // Keep bounded and single-line.
        const maxOptions = 12;
        const shown = options.slice(0, maxOptions).map(o => o.replace(/\r?\n/g, 'return'));
        const suffix = options.length > maxOptions ? `, …(+${options.length - maxOptions})` : '';
        return `[${shown.join(', ')}${suffix}]`;
    }
    get pollingResult() { return this._pollingResult; }
    get outputMonitorTelemetryCounters() { return this._outputMonitorTelemetryCounters; }
    constructor(_execution, _pollFn, invocationContext, token, command, _languageModelsService, _taskService, _chatService, _chatWidgetService, _configurationService, _logService, _terminalService) {
        super();
        this._execution = _execution;
        this._pollFn = _pollFn;
        this._languageModelsService = _languageModelsService;
        this._taskService = _taskService;
        this._chatService = _chatService;
        this._chatWidgetService = _chatWidgetService;
        this._configurationService = _configurationService;
        this._logService = _logService;
        this._terminalService = _terminalService;
        this._state = OutputMonitorState.PollingForIdle;
        /**
         * Flag to track if user has inputted since idle was detected.
         * This is used to skip showing prompts if the user already provided input.
         */
        this._userInputtedSinceIdleDetected = false;
        this._userInputListener = this._register(new MutableDisposable());
        this._outputMonitorTelemetryCounters = {
            inputToolManualAcceptCount: 0,
            inputToolManualRejectCount: 0,
            inputToolManualChars: 0,
            inputToolAutoAcceptCount: 0,
            inputToolAutoChars: 0,
            inputToolManualShownCount: 0,
            inputToolFreeFormInputShownCount: 0,
            inputToolFreeFormInputCount: 0,
        };
        this._onDidFinishCommand = this._register(new Emitter());
        this.onDidFinishCommand = this._onDidFinishCommand.event;
        this._asyncMode = false;
        this._command = '';
        this._sessionResource = invocationContext?.sessionResource;
        this._command = command;
        this._invocationContext = invocationContext;
        this._register(toDisposable(() => this._currentMonitoringCts?.dispose()));
        // Start async to ensure listeners are set up
        timeout(0).then(() => {
            this._currentMonitoringCts = new CancellationTokenSource(token);
            this._startMonitoring(command, invocationContext, this._currentMonitoringCts.token);
        });
    }
    async _startMonitoring(command, invocationContext, token) {
        const pollStartTime = Date.now();
        let resources;
        let output;
        let extended = false;
        try {
            while (!token.isCancellationRequested) {
                switch (this._state) {
                    case OutputMonitorState.PollingForIdle: {
                        this._logService.trace(`OutputMonitor: Entering PollingForIdle (extended=${extended})`);
                        this._state = await this._waitForIdle(this._execution, extended, token);
                        this._logService.trace(`OutputMonitor: PollingForIdle completed -> state=${OutputMonitorState[this._state]}`);
                        continue;
                    }
                    case OutputMonitorState.Timeout: {
                        this._logService.trace(`OutputMonitor: Entering Timeout state (extended=${extended})`);
                        const shouldContinuePolling = await this._handleTimeoutState(command, invocationContext, extended, token);
                        if (shouldContinuePolling) {
                            extended = true;
                            this._state = OutputMonitorState.PollingForIdle;
                            continue;
                        }
                        else if (this._asyncMode) {
                            // In async mode, wait for new data instead of stopping on timeout
                            this._logService.trace('OutputMonitor: Async mode - timeout reached, waiting for new terminal data');
                            extended = false;
                            await this._waitForNewData(token);
                            if (token.isCancellationRequested) {
                                break;
                            }
                            this._state = OutputMonitorState.PollingForIdle;
                            continue;
                        }
                        else {
                            this._promptPart?.hide();
                            this._promptPart = undefined;
                            break;
                        }
                    }
                    case OutputMonitorState.Cancelled:
                        break;
                    case OutputMonitorState.Idle: {
                        this._logService.trace('OutputMonitor: Entering Idle handler');
                        const idleResult = await this._handleIdleState(token);
                        if (idleResult.shouldContinuePolling) {
                            this._logService.trace('OutputMonitor: Idle handler -> continue polling');
                            this._state = OutputMonitorState.PollingForIdle;
                            continue;
                        }
                        else if (this._asyncMode) {
                            // In async mode, wait for new terminal data before monitoring again.
                            // This avoids expensive LLM calls while the terminal sits idle.
                            this._logService.trace('OutputMonitor: Async mode - waiting for new terminal data before next monitoring cycle');
                            await this._waitForNewData(token);
                            if (token.isCancellationRequested) {
                                break;
                            }
                            this._state = OutputMonitorState.PollingForIdle;
                            continue;
                        }
                        else {
                            this._logService.trace(`OutputMonitor: Idle handler -> stop polling (hasResources=${!!idleResult.resources}, outputLen=${idleResult.output?.length ?? 0})`);
                            resources = idleResult.resources;
                            output = idleResult.output;
                        }
                        break;
                    }
                }
                if (this._state === OutputMonitorState.Idle || this._state === OutputMonitorState.Cancelled || this._state === OutputMonitorState.Timeout) {
                    break;
                }
            }
            if (token.isCancellationRequested) {
                this._state = OutputMonitorState.Cancelled;
            }
        }
        finally {
            this._logService.trace(`OutputMonitor: Monitoring finished (state=${OutputMonitorState[this._state]}, duration=${Date.now() - pollStartTime}ms)`);
            this._pollingResult = {
                state: this._state,
                output: output ?? this._execution.getOutput(),
                pollDurationMs: Date.now() - pollStartTime,
                resources
            };
            // Clean up idle input listener if still active
            this._userInputListener.clear();
            const promptPart = this._promptPart;
            this._promptPart = undefined;
            if (promptPart) {
                try {
                    promptPart.hide();
                }
                catch (err) {
                    this._logService.error('OutputMonitor: Failed to hide prompt', err);
                }
            }
            this._onDidFinishCommand.fire();
        }
    }
    /**
     * Continues monitoring in background mode with a new cancellation token.
     * In background mode, the monitor re-polls for idle and handles prompts
     * whenever new terminal data arrives, rather than stopping after the first
     * idle detection. Resource cost is bounded because the monitor only wakes
     * on new terminal data (via {@link _waitForNewData}) and each idle cycle
     * is capped by the standard polling timeouts.
     */
    continueMonitoringAsync(token) {
        this._asyncMode = true;
        // Cancel and dispose any in-progress monitoring run to avoid two concurrent loops
        this._currentMonitoringCts?.dispose();
        this._currentMonitoringCts = new CancellationTokenSource(token);
        this._state = OutputMonitorState.PollingForIdle;
        this._startMonitoring(this._command, this._invocationContext, this._currentMonitoringCts.token);
    }
    /**
     * Waits for new terminal data or cancellation. Used in background mode
     * to avoid polling and LLM calls while the terminal is quiet.
     */
    _waitForNewData(token) {
        return new Promise(resolve => {
            if (token.isCancellationRequested) {
                resolve();
                return;
            }
            const cleanup = () => {
                dataListener.dispose();
                tokenListener.dispose();
                disposedListener.dispose();
            };
            const dataListener = this._execution.instance.onData(() => {
                cleanup();
                resolve();
            });
            const tokenListener = token.onCancellationRequested(() => {
                cleanup();
                resolve();
            });
            // Resolve when the terminal instance is disposed to avoid waiting forever
            const disposedListener = this._execution.instance.onDisposed(() => {
                cleanup();
                resolve();
            });
        });
    }
    async _handleIdleState(token) {
        const output = this._execution.getOutput(this._lastPromptMarker);
        this._logService.trace(`OutputMonitor: Idle output summary: len=${output.length}, lastLine=${this._formatLastLineForLog(output)}`);
        if (detectsNonInteractiveHelpPattern(output)) {
            this._logService.trace('OutputMonitor: Idle -> non-interactive help pattern detected, stopping');
            return { shouldContinuePolling: false, output };
        }
        // Check for VS Code's task finish messages (like "press any key to close the terminal").
        // If the execution is a task and the output contains a VS Code task finish message,
        // always treat it as a stop signal regardless of task active state (which can be stale).
        const isTask = this._execution.task !== undefined;
        if (isTask && detectsVSCodeTaskFinishMessage(output)) {
            this._logService.trace('OutputMonitor: Idle -> VS Code task finish message detected, stopping');
            // Task is finished, ignore the "press any key to close" message
            return { shouldContinuePolling: false, output };
        }
        // Check for generic "press any key" prompts from scripts.
        // Only shown for non-task executions since task finish messages are handled above.
        if (!isTask && detectsGenericPressAnyKeyPattern(output)) {
            this._logService.trace('OutputMonitor: Idle -> generic "press any key" detected');
            const autoReply = this._configurationService.getValue("chat.tools.terminal.autoReplyToPrompts" /* TerminalChatAgentToolsSettingId.AutoReplyToPrompts */) || this._isAutopilotMode();
            if (autoReply) {
                this._logService.trace('OutputMonitor: Auto-reply enabled -> not showing free-form prompt for "press any key", stopping');
                this._cleanupIdleInputListener();
                return { shouldContinuePolling: false, output };
            }
            this._logService.trace('OutputMonitor: Requesting free-form input for "press any key"');
            // Register a marker to track this prompt position so we don't re-detect it
            const currentMarker = this._execution.instance.registerMarker();
            if (currentMarker) {
                this._lastPromptMarker = currentMarker;
            }
            this._cleanupIdleInputListener();
            this._outputMonitorTelemetryCounters.inputToolFreeFormInputShownCount++;
            const lastLine = output.trimEnd().split(/\r?\n/).pop() || '';
            const receivedTerminalInput = await this._requestFreeFormTerminalInput(token, this._execution, {
                prompt: lastLine,
                options: [],
                detectedRequestForFreeFormInput: true
            }, true /* acceptAnyKey */);
            if (receivedTerminalInput) {
                this._logService.trace('OutputMonitor: Free-form input received for "press any key", continue polling');
                await timeout(200);
                return { shouldContinuePolling: true };
            }
            else {
                this._logService.trace('OutputMonitor: Free-form input declined for "press any key", stopping');
                return { shouldContinuePolling: false };
            }
        }
        // Check if user already inputted since idle was detected (before we even got here)
        if (this._userInputtedSinceIdleDetected) {
            this._logService.trace('OutputMonitor: User input detected since idle; skipping prompt and continuing polling');
            this._cleanupIdleInputListener();
            return { shouldContinuePolling: true };
        }
        // In async mode, skip the LLM-based prompt detection to avoid expensive calls
        // on every idle cycle. Instead, use regex-based detection for input-required
        // patterns (passwords, [Y/n], etc.) which were already detected in _waitForIdle
        // but need elicitation UI shown here.
        if (this._asyncMode) {
            if (detectsInputRequiredPattern(output)) {
                this._logService.trace('OutputMonitor: Async mode - input-required pattern detected, showing free-form input');
                const autoReply = this._configurationService.getValue("chat.tools.terminal.autoReplyToPrompts" /* TerminalChatAgentToolsSettingId.AutoReplyToPrompts */) || this._isAutopilotMode();
                if (!autoReply) {
                    const currentMarker = this._execution.instance.registerMarker();
                    if (currentMarker) {
                        this._lastPromptMarker = currentMarker;
                    }
                    this._cleanupIdleInputListener();
                    this._outputMonitorTelemetryCounters.inputToolFreeFormInputShownCount++;
                    const lastLine = output.trimEnd().split(/\r?\n/).pop() || '';
                    const receivedTerminalInput = await this._requestFreeFormTerminalInput(token, this._execution, {
                        prompt: lastLine,
                        options: [],
                        detectedRequestForFreeFormInput: true
                    });
                    if (receivedTerminalInput) {
                        this._logService.trace('OutputMonitor: Async mode - free-form input received, continue polling');
                        await timeout(200);
                        return { shouldContinuePolling: true };
                    }
                }
            }
            this._cleanupIdleInputListener();
            return { shouldContinuePolling: false, output };
        }
        this._logService.trace('OutputMonitor: Determining user input options via language model');
        const confirmationPrompt = await this._determineUserInputOptions(this._execution, token);
        this._logService.trace(`OutputMonitor: Input options result: ${confirmationPrompt ? `prompt=${this._formatLastLineForLog(confirmationPrompt.prompt)}, options=${confirmationPrompt.options.length} ${this._formatOptionsForLog(confirmationPrompt.options)}, freeForm=${!!confirmationPrompt.detectedRequestForFreeFormInput}` : 'none'}`);
        // Check again after the async LLM call - user may have inputted while we were analyzing
        if (this._userInputtedSinceIdleDetected) {
            this._logService.trace('OutputMonitor: User input arrived during input-option analysis; continuing polling');
            this._cleanupIdleInputListener();
            return { shouldContinuePolling: true };
        }
        if (confirmationPrompt?.detectedRequestForFreeFormInput) {
            // Check again right before showing prompt
            if (this._userInputtedSinceIdleDetected) {
                this._logService.trace('OutputMonitor: User input arrived before showing free-form prompt; continuing polling');
                this._cleanupIdleInputListener();
                return { shouldContinuePolling: true };
            }
            const autoReply = this._configurationService.getValue("chat.tools.terminal.autoReplyToPrompts" /* TerminalChatAgentToolsSettingId.AutoReplyToPrompts */) || this._isAutopilotMode();
            if (autoReply) {
                this._logService.trace('OutputMonitor: Auto-reply enabled -> not propagating free-form prompt, stopping');
                this._cleanupIdleInputListener();
                return { shouldContinuePolling: false, output };
            }
            // Clean up the input listener now - the prompt will set up its own
            this._cleanupIdleInputListener();
            this._outputMonitorTelemetryCounters.inputToolFreeFormInputShownCount++;
            this._logService.trace('OutputMonitor: Showing free-form input elicitation');
            const receivedTerminalInput = await this._requestFreeFormTerminalInput(token, this._execution, confirmationPrompt);
            if (receivedTerminalInput) {
                // Small delay to ensure input is processed
                this._logService.trace('OutputMonitor: Free-form input received; continuing polling');
                await timeout(200);
                // Continue polling as we sent the input
                return { shouldContinuePolling: true };
            }
            else {
                // User declined
                this._logService.trace('OutputMonitor: Free-form input declined; stopping');
                return { shouldContinuePolling: false };
            }
        }
        if (confirmationPrompt?.options.length) {
            this._logService.trace(`OutputMonitor: Showing option-based input flow (options=${confirmationPrompt.options.length})`);
            const suggestedOptionResult = await this._selectAndHandleOption(confirmationPrompt, token);
            this._logService.trace(`OutputMonitor: Suggested option result: ${suggestedOptionResult?.suggestedOption ? 'hasSuggestion' : 'none'} (autoSent=${!!suggestedOptionResult?.sentToTerminal})`);
            if (suggestedOptionResult?.sentToTerminal) {
                // Continue polling as we sent the input
                this._cleanupIdleInputListener();
                return { shouldContinuePolling: true };
            }
            // Check again after LLM call - user may have inputted while we were selecting option
            if (this._userInputtedSinceIdleDetected) {
                this._logService.trace('OutputMonitor: User input arrived during option selection; continuing polling');
                this._cleanupIdleInputListener();
                return { shouldContinuePolling: true };
            }
            // Clean up the input listener now - the prompt will set up its own
            this._cleanupIdleInputListener();
            this._logService.trace('OutputMonitor: Showing confirmation elicitation for suggested option');
            const confirmed = await this._confirmRunInTerminal(token, suggestedOptionResult?.suggestedOption ?? confirmationPrompt.options[0], this._execution, confirmationPrompt);
            if (confirmed) {
                // Continue polling as we sent the input
                this._logService.trace('OutputMonitor: Option confirmed/sent; continuing polling');
                return { shouldContinuePolling: true };
            }
            else {
                // User declined
                this._logService.trace('OutputMonitor: Option declined; stopping');
                this._execution.instance.focus(true);
                return { shouldContinuePolling: false };
            }
        }
        // Clean up input listener before custom poll
        this._cleanupIdleInputListener();
        // Let custom poller override if provided
        const custom = await this._pollFn?.(this._execution, token, this._taskService);
        this._logService.trace(`OutputMonitor: Custom poller result: ${custom ? 'provided' : 'none'}`);
        const resources = custom?.resources;
        return { resources, shouldContinuePolling: false, output: custom?.output ?? output };
    }
    async _handleTimeoutState(_command, _invocationContext, _extended, _token) {
        // Stop after extended polling (2 minutes) without notifying user
        if (_extended) {
            this._logService.info('OutputMonitor: Extended polling timeout reached after 2 minutes');
            this._state = OutputMonitorState.Cancelled;
            return false;
        }
        // Continue polling with exponential backoff
        return true;
    }
    /**
     * Single bounded polling pass that returns when:
     *  - terminal becomes inactive/idle, or
     *  - timeout window elapses.
     */
    async _waitForIdle(execution, extendedPolling, token) {
        const maxWaitMs = extendedPolling ? 120000 /* PollingConsts.ExtendedPollingMaxDuration */ : 20000 /* PollingConsts.FirstPollingMaxDuration */;
        const maxInterval = 10000 /* PollingConsts.MaxPollingIntervalDuration */;
        let currentInterval = 500 /* PollingConsts.MinPollingDuration */;
        let waited = 0;
        let consecutiveIdleEvents = 0;
        let hasReceivedData = false;
        const onDataDisposable = execution.instance.onData((_data) => {
            hasReceivedData = true;
        });
        try {
            while (!token.isCancellationRequested && waited < maxWaitMs) {
                const waitTime = Math.min(currentInterval, maxWaitMs - waited);
                try {
                    await timeout(waitTime, token);
                }
                catch (err) {
                    if (token.isCancellationRequested) {
                        return OutputMonitorState.Cancelled;
                    }
                    throw err;
                }
                waited += waitTime;
                currentInterval = Math.min(currentInterval * 2, maxInterval);
                const currentOutput = execution.getOutput();
                if (detectsNonInteractiveHelpPattern(currentOutput)) {
                    this._logService.trace(`OutputMonitor: waitForIdle -> non-interactive help detected (waited=${waited}ms)`);
                    this._state = OutputMonitorState.Idle;
                    this._setupIdleInputListener();
                    return this._state;
                }
                const promptResult = detectsInputRequiredPattern(currentOutput);
                if (promptResult) {
                    this._logService.trace(`OutputMonitor: waitForIdle -> input-required pattern detected (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentOutput)})`);
                    this._state = OutputMonitorState.Idle;
                    this._setupIdleInputListener();
                    return this._state;
                }
                if (hasReceivedData) {
                    consecutiveIdleEvents = 0;
                    hasReceivedData = false;
                }
                else {
                    consecutiveIdleEvents++;
                }
                const recentlyIdle = consecutiveIdleEvents >= 2 /* PollingConsts.MinIdleEvents */;
                const isActive = execution.isActive ? await execution.isActive() : undefined;
                this._logService.trace(`OutputMonitor: waitForIdle check: waited=${waited}ms, recentlyIdle=${recentlyIdle}, isActive=${isActive}`);
                if (recentlyIdle && isActive !== true) {
                    this._logService.trace(`OutputMonitor: waitForIdle -> recentlyIdle && !active (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentOutput)})`);
                    this._state = OutputMonitorState.Idle;
                    this._setupIdleInputListener();
                    return this._state;
                }
            }
        }
        finally {
            onDataDisposable.dispose();
        }
        if (token.isCancellationRequested) {
            return OutputMonitorState.Cancelled;
        }
        return OutputMonitorState.Timeout;
    }
    /**
     * Sets up a listener for user input that triggers immediately when idle is detected.
     * This ensures we catch any input that happens between idle detection and prompt creation.
     */
    _setupIdleInputListener() {
        this._userInputtedSinceIdleDetected = false;
        this._logService.trace('OutputMonitor: Setting up idle input listener');
        // Set up new listener (MutableDisposable auto-disposes previous)
        this._userInputListener.value = this._execution.instance.onDidInputData(() => {
            this._userInputtedSinceIdleDetected = true;
            this._logService.trace('OutputMonitor: Detected user terminal input while idle');
        });
    }
    /**
     * Cleans up the idle input listener and resets the flag.
     */
    _cleanupIdleInputListener() {
        this._userInputtedSinceIdleDetected = false;
        this._userInputListener.clear();
    }
    async _determineUserInputOptions(execution, token) {
        if (token.isCancellationRequested) {
            this._logService.trace('OutputMonitor: determineUserInputOptions cancelled before start');
            return;
        }
        const model = await this._getLanguageModel();
        if (!model) {
            this._logService.trace('OutputMonitor: determineUserInputOptions no language model available');
            return undefined;
        }
        const lastLines = execution.getOutput(this._lastPromptMarker).trimEnd().split('\n').slice(-15).join('\n');
        this._logService.trace(`OutputMonitor: determineUserInputOptions analyzing lastLines (len=${lastLines.length})`);
        if (detectsNonInteractiveHelpPattern(lastLines)) {
            return undefined;
        }
        const promptText = `Analyze the following terminal output. If it contains a prompt requesting user input (such as a confirmation, selection, or yes/no question) that appears at the VERY END of the output and has NOT already been answered (i.e., there is no user response or subsequent output after the prompt), extract the prompt text. IMPORTANT: Only detect prompts that are at the end of the output with no content following them - if there is any output after the prompt, the prompt has already been answered and you should return null. The prompt may ask to choose from a set. If so, extract the possible options as a JSON object with keys 'prompt', 'options' (an array of strings or an object with option to description mappings), and 'freeFormInput': false. If no options are provided, and free form input is requested, return a JSON object with keys 'prompt', 'options', 'freeFormInput': true, and 'input'. The 'input' field should be the exact text to type only when the output explicitly states what to type (for example, Type "exit" to quit). If there is no explicit input, set 'input' to null. For Enter, set 'input' to "\\r". If the option is ambiguous, return null.
			Examples:
			1. Output: "Do you want to overwrite? (y/n)"
				Response: {"prompt": "Do you want to overwrite?", "options": ["y", "n"], "freeFormInput": false}

			2. Output: "Confirm: [Y] Yes  [A] Yes to All  [N] No  [L] No to All  [C] Cancel"
				Response: {"prompt": "Confirm", "options": ["Y", "A", "N", "L", "C"], "freeFormInput": false}

			3. Output: "Accept license terms? (yes/no)"
				Response: {"prompt": "Accept license terms?", "options": ["yes", "no"], "freeFormInput": false}

			4. Output: "Press Enter to continue"
				Response: {"prompt": "Press Enter to continue", "options": ["Enter"], "freeFormInput": false}

			5. Output: "Type Yes to proceed"
				Response: {"prompt": "Type Yes to proceed", "options": ["Yes"], "freeFormInput": false}

			6. Output: "Continue [y/N]"
				Response: {"prompt": "Continue", "options": ["y", "N"], "freeFormInput": false}

			7. Output: "Password:"
				Response: {"prompt": "Password:", "freeFormInput": true, "options": [], "input": null}
			8. Output: "press ctrl-c to detach, ctrl-d to kill"
				Response: null
			9. Output: "Continue (y/n)? y"
				Response: null (the prompt was already answered with 'y')
			10. Output: "Do you want to proceed? (yes/no)\nyes\nProceeding with operation..."
				Response: null (the prompt was already answered and there is subsequent output)

			Alternatively, the prompt may request free form input, for example:
			1. Output: "Enter your username:"
				Response: {"prompt": "Enter your username:", "freeFormInput": true, "options": [], "input": null}
			2. Output: "Password:"
				Response: {"prompt": "Password:", "freeFormInput": true, "options": [], "input": null}
			3. Output: "Press any key to continue..."
				Response: {"prompt": "Press any key to continue...", "freeFormInput": true, "options": [], "input": "\\r"}
			4. Output: "Type 'exit' to quit the game."
				Response: {"prompt": "Type 'exit' to quit the game.", "freeFormInput": true, "options": [], "input": "exit"}
			Now, analyze this output:
			${lastLines}
			`;
        const response = await this._languageModelsService.sendChatRequest(model, undefined, [{ role: 1 /* ChatMessageRole.User */, content: [{ type: 'text', value: promptText }] }], {}, token);
        const responseText = await getTextResponseFromStream(response);
        try {
            const match = responseText.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                if (isObject(parsed) &&
                    Object.hasOwn(parsed, 'prompt') && isString(parsed.prompt) &&
                    Object.hasOwn(parsed, 'options') &&
                    Object.hasOwn(parsed, 'freeFormInput') && typeof parsed.freeFormInput === 'boolean') {
                    const obj = parsed;
                    if (this._lastPrompt === obj.prompt) {
                        this._logService.trace('OutputMonitor: determineUserInputOptions ignoring duplicate prompt');
                        return;
                    }
                    if (obj.freeFormInput === true) {
                        const suggestedInput = isString(obj.input) && obj.input.trim().length ? obj.input.trim() : undefined;
                        return { prompt: obj.prompt, options: [], detectedRequestForFreeFormInput: true, suggestedInput };
                    }
                    if (Array.isArray(obj.options) && obj.options.every(isString)) {
                        return { prompt: obj.prompt, options: obj.options, detectedRequestForFreeFormInput: obj.freeFormInput };
                    }
                    else if (isObject(obj.options) && Object.values(obj.options).every(isString)) {
                        const keys = Object.keys(obj.options);
                        if (keys.length === 0) {
                            return undefined;
                        }
                        const descriptions = keys.map(key => obj.options[key]);
                        return { prompt: obj.prompt, options: keys, descriptions, detectedRequestForFreeFormInput: obj.freeFormInput };
                    }
                }
            }
        }
        catch (err) {
            this._logService.trace('OutputMonitor: Failed to parse confirmation prompt from language model response', err);
        }
        return undefined;
    }
    _isSensitivePrompt(prompt) {
        return /(password|passphrase|token|api\s*key|secret)/i.test(prompt);
    }
    /**
     * Returns true if the current session is in Autopilot mode (not Bypass Approvals).
     * In Autopilot, terminal prompts should be auto-replied to so the agent can
     * work autonomously from start to finish.
     */
    _isAutopilotMode() {
        if (!this._sessionResource) {
            return false;
        }
        // Check the live widget picker level
        const widget = this._chatWidgetService.getWidgetBySessionResource(this._sessionResource)
            ?? this._chatWidgetService.lastFocusedWidget;
        if (widget?.input.currentModeInfo.permissionLevel === ChatPermissionLevel.Autopilot) {
            return true;
        }
        // Fall back to the request-stamped level
        const model = this._chatService.getSession(this._sessionResource);
        const request = model?.getRequests().at(-1);
        return request?.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot;
    }
    async _selectAndHandleOption(confirmationPrompt, token) {
        if (!confirmationPrompt?.options.length) {
            return undefined;
        }
        const autoReply = this._configurationService.getValue("chat.tools.terminal.autoReplyToPrompts" /* TerminalChatAgentToolsSettingId.AutoReplyToPrompts */) || this._isAutopilotMode();
        let model = this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)[0]?.input.currentLanguageModel;
        if (model) {
            const models = await this._safeSelectLanguageModels({ vendor: 'copilot', family: model.replaceAll('copilot/', '') });
            model = models[0];
        }
        if (!model) {
            model = await this._getLanguageModel();
        }
        const prompt = confirmationPrompt.prompt;
        const options = confirmationPrompt.options;
        const currentMarker = this._execution.instance.registerMarker();
        if (!currentMarker) {
            // Unable to register marker, so cannot track prompt location
            return undefined;
        }
        this._lastPromptMarker = currentMarker;
        this._lastPrompt = prompt;
        let suggestedOption = '';
        if (model) {
            try {
                const promptText = `Given the following confirmation prompt and options from a terminal output, which option is the default?\nPrompt: "${prompt}"\nOptions: ${JSON.stringify(options)}\nRespond with only the option string.`;
                const response = await this._languageModelsService.sendChatRequest(model, undefined, [
                    { role: 1 /* ChatMessageRole.User */, content: [{ type: 'text', value: promptText }] }
                ], {}, token);
                suggestedOption = (await getTextResponseFromStream(response)).trim();
            }
            catch (err) {
                this._logService.trace('OutputMonitor: Failed to get suggested option from model', err);
            }
        }
        else if (!autoReply) {
            return undefined;
        }
        let validOption;
        let index;
        if (!suggestedOption) {
            // No suggestion from LLM - fall back to first option if autoReply is enabled
            if (autoReply) {
                validOption = options[0];
                index = 0;
                this._logService.trace(`OutputMonitor: No LLM suggestion, falling back to first option: ${validOption}`);
            }
            else {
                return;
            }
        }
        else {
            const match = matchTerminalPromptOption(confirmationPrompt.options, suggestedOption);
            if (!match.option || match.index === -1) {
                // LLM suggestion didn't match any option - fall back to first option if autoReply is enabled
                if (autoReply) {
                    validOption = options[0];
                    index = 0;
                    this._logService.trace(`OutputMonitor: LLM suggestion '${suggestedOption}' didn't match options, falling back to first option: ${validOption}`);
                }
                else {
                    return;
                }
            }
            else {
                validOption = match.option;
                index = match.index;
            }
        }
        let sentToTerminal = false;
        if (autoReply) {
            await this._execution.instance.sendText(validOption, true);
            this._outputMonitorTelemetryCounters.inputToolAutoAcceptCount++;
            this._outputMonitorTelemetryCounters.inputToolAutoChars += validOption?.length || 0;
            sentToTerminal = true;
        }
        const description = confirmationPrompt.descriptions?.[index];
        return description ? { suggestedOption: { description, option: validOption }, sentToTerminal } : { suggestedOption: validOption, sentToTerminal };
    }
    async _requestFreeFormTerminalInput(token, execution, confirmationPrompt, acceptAnyKey = false) {
        const focusTerminalSelection = Symbol('focusTerminalSelection');
        const { promise: userPrompt, part } = this._createElicitationPart(token, execution.sessionResource, new MarkdownString(localize('poll.terminal.inputRequest', "The terminal is awaiting input.")), new MarkdownString(localize('poll.terminal.requireInput', "{0}\nPlease provide the required input to the terminal.\n\n", confirmationPrompt.prompt)), '', localize('poll.terminal.enterInput', 'Focus terminal'), undefined, () => {
            this._showInstance(execution.instance.instanceId);
            return focusTerminalSelection;
        });
        let inputDataDisposable = Disposable.None;
        let instanceDisposedDisposable = Disposable.None;
        const inputPromise = new Promise(resolve => {
            let settled = false;
            const settle = (value, state) => {
                if (settled) {
                    return;
                }
                settled = true;
                part.hide();
                inputDataDisposable.dispose();
                instanceDisposedDisposable.dispose();
                this._state = state;
                resolve(value);
            };
            inputDataDisposable = this._register(execution.instance.onDidInputData((data) => {
                // For "press any key" prompts, accept any non-empty input
                // For other free-form inputs (like passwords), only accept on Enter
                if ((acceptAnyKey && data.length > 0) || (!acceptAnyKey && (data === '\r' || data === '\n' || data === '\r\n'))) {
                    this._outputMonitorTelemetryCounters.inputToolFreeFormInputCount++;
                    settle(true, OutputMonitorState.PollingForIdle);
                }
            }));
            instanceDisposedDisposable = this._register(execution.instance.onDisposed(() => {
                settle(false, OutputMonitorState.Cancelled);
            }));
        });
        const disposeListeners = () => {
            inputDataDisposable.dispose();
            instanceDisposedDisposable.dispose();
        };
        const result = await Promise.race([userPrompt, inputPromise]);
        if (result === focusTerminalSelection) {
            execution.instance.focus(true);
            return await inputPromise;
        }
        if (result === undefined) {
            disposeListeners();
            // Prompt was dismissed without providing input
            return false;
        }
        disposeListeners();
        return !!result;
    }
    async _confirmRunInTerminal(token, suggestedOption, execution, confirmationPrompt) {
        const suggestedOptionValue = isString(suggestedOption) ? suggestedOption : suggestedOption.option;
        const focusTerminalSelection = Symbol('focusTerminalSelection');
        let inputDataDisposable = Disposable.None;
        let instanceDisposedDisposable = Disposable.None;
        const { promise: userPrompt, part } = this._createElicitationPart(token, execution.sessionResource, new MarkdownString(localize('poll.terminal.confirmRequired', "The terminal is awaiting input.")), new MarkdownString(localize('poll.terminal.confirmRunDetail', "{0}\n Do you want to send `{1}`{2} followed by `Enter` to the terminal?", confirmationPrompt.prompt, suggestedOptionValue, isString(suggestedOption) ? '' : suggestedOption.description ? ' (' + suggestedOption.description + ')' : '')), '', localize('poll.terminal.acceptRun', 'Allow'), localize('poll.terminal.rejectRun', 'Focus Terminal'), async (value) => {
            let option = undefined;
            if (value === true) {
                option = suggestedOptionValue;
            }
            else if (typeof value === 'object' && Object.hasOwn(value, 'label')) {
                option = value.label.split(' (')[0];
            }
            this._outputMonitorTelemetryCounters.inputToolManualAcceptCount++;
            this._outputMonitorTelemetryCounters.inputToolManualChars += option?.length || 0;
            return option;
        }, () => {
            this._showInstance(execution.instance.instanceId);
            this._outputMonitorTelemetryCounters.inputToolManualRejectCount++;
            return focusTerminalSelection;
        }, getMoreActions(suggestedOption, confirmationPrompt));
        const inputPromise = new Promise(resolve => {
            let settled = false;
            const settle = (value, state) => {
                if (settled) {
                    return;
                }
                settled = true;
                part.hide();
                inputDataDisposable.dispose();
                instanceDisposedDisposable.dispose();
                this._state = state;
                resolve(value);
            };
            inputDataDisposable = this._register(execution.instance.onDidInputData(() => {
                settle(true, OutputMonitorState.PollingForIdle);
            }));
            instanceDisposedDisposable = this._register(execution.instance.onDisposed(() => {
                settle(false, OutputMonitorState.Cancelled);
            }));
        });
        const disposeListeners = () => {
            inputDataDisposable.dispose();
            instanceDisposedDisposable.dispose();
        };
        const optionToRun = await Promise.race([userPrompt, inputPromise]);
        if (optionToRun === focusTerminalSelection) {
            execution.instance.focus(true);
            return await inputPromise;
        }
        if (optionToRun === true) {
            disposeListeners();
            return true;
        }
        if (typeof optionToRun === 'string' && optionToRun.length) {
            execution.instance.focus(true);
            disposeListeners();
            await execution.instance.sendText(optionToRun, true);
            return optionToRun;
        }
        disposeListeners();
        return optionToRun;
    }
    _showInstance(instanceId) {
        if (!instanceId) {
            return;
        }
        const instance = this._terminalService.getInstanceFromId(instanceId);
        if (!instance) {
            return;
        }
        this._terminalService.setActiveInstance(instance);
        this._terminalService.revealActiveTerminal(true);
    }
    // Helper to create, register, and wire a ChatElicitationRequestPart. Returns the promise that
    // resolves when the part is accepted/rejected and the registered part itself so callers can
    // attach additional listeners (e.g., onDidRequestHide) or compose with other promises.
    _createElicitationPart(token, sessionResource, title, detail, subtitle, acceptLabel, rejectLabel, onAccept, onReject, moreActions) {
        const chatModel = sessionResource && this._chatService.getSession(sessionResource);
        if (!(chatModel instanceof ChatModel)) {
            throw new Error('No model');
        }
        // In async mode the last request may be an implicit (hidden) steering request.
        // Attach the elicitation to the last visible request so it renders in the UI.
        const requests = chatModel.getRequests();
        let request;
        if (this._asyncMode) {
            // In async mode the previous response is already complete.
            // Create a new system-initiated request so the data model properly
            // represents a finished response followed by a new request/response
            // rather than reopening the completed response.
            const message = localize('terminalPromptDetected', "Terminal is waiting for input");
            const parts = [new ChatRequestTextPart(new OffsetRange(0, message.length), { startColumn: 1, startLineNumber: 1, endColumn: 1, endLineNumber: 1 }, message)];
            request = chatModel.addRequest({ text: message, parts }, { variables: [] }, 0, // attempt
            undefined, // modeInfo
            undefined, // chatAgent
            undefined, // slashCommand
            undefined, // confirmation
            undefined, // locationData
            undefined, // attachments
            undefined, // isCompleteAddedRequest
            undefined, // modelId
            undefined, // userSelectedTools
            undefined, // id
            true, // isSystemInitiated
            localize('backgroundTaskInputNeeded', "Background task `{0}` input needed", this._command));
        }
        else {
            request = requests.findLast(r => !r.isSystemInitiated) ?? requests.at(-1);
        }
        if (!request) {
            throw new Error('No request');
        }
        let part;
        const asyncRequest = this._asyncMode ? request : undefined;
        const promise = new Promise(resolve => {
            const thePart = part = new ChatElicitationRequestPart(title, detail, subtitle, acceptLabel, rejectLabel, async (value) => {
                try {
                    const r = await (onAccept ? onAccept(value) : undefined);
                    resolve(r);
                    // Don't hide if return value is a Symbol (e.g., focusTerminalSelection)
                    // This keeps the elicitation visible while user focuses terminal to provide input
                    if (typeof r === 'symbol') {
                        return "pending" /* ElicitationState.Pending */;
                    }
                }
                catch {
                    resolve(undefined);
                }
                thePart.hide();
                this._promptPart = undefined;
                asyncRequest?.response?.complete();
                return "accepted" /* ElicitationState.Accepted */;
            }, async () => {
                try {
                    const r = await (onReject ? onReject() : undefined);
                    resolve(r);
                    // Don't hide if return value is a Symbol (e.g., focusTerminalSelection)
                    // This keeps the elicitation visible while user focuses terminal to provide input
                    if (typeof r === 'symbol') {
                        return "pending" /* ElicitationState.Pending */;
                    }
                }
                catch {
                    resolve(undefined);
                }
                thePart.hide();
                this._promptPart = undefined;
                asyncRequest?.response?.complete();
                return "rejected" /* ElicitationState.Rejected */;
            }, undefined, // source
            moreActions, () => this._outputMonitorTelemetryCounters.inputToolManualShownCount++);
            chatModel.acceptResponseProgress(request, thePart);
            this._promptPart = thePart;
        });
        this._register(token.onCancellationRequested(() => {
            part.hide();
            asyncRequest?.response?.complete();
        }));
        return { promise, part };
    }
    async _getLanguageModel() {
        const fastModels = await this._safeSelectLanguageModels({ vendor: 'copilot', id: 'copilot-fast' });
        if (fastModels.length) {
            return fastModels[0];
        }
        const widget = this._chatWidgetService.lastFocusedWidget ?? this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)[0];
        const currentModel = widget?.input.currentLanguageModel;
        if (currentModel) {
            const currentFamilyModels = await this._safeSelectLanguageModels({ vendor: 'copilot', family: currentModel.replaceAll('copilot/', '') });
            if (currentFamilyModels.length) {
                return currentFamilyModels[0];
            }
        }
        const copilotModels = await this._safeSelectLanguageModels({ vendor: 'copilot' });
        if (copilotModels.length) {
            return copilotModels[0];
        }
        return undefined;
    }
    async _safeSelectLanguageModels(selector) {
        try {
            return await this._languageModelsService.selectLanguageModels(selector);
        }
        catch (error) {
            this._logService.trace('OutputMonitor: selectLanguageModels failed', { selector, error });
            return [];
        }
    }
};
OutputMonitor = __decorate([
    __param(5, ILanguageModelsService),
    __param(6, ITaskService),
    __param(7, IChatService),
    __param(8, IChatWidgetService),
    __param(9, IConfigurationService),
    __param(10, ITerminalLogService),
    __param(11, ITerminalService)
], OutputMonitor);
export { OutputMonitor };
function getMoreActions(suggestedOption, confirmationPrompt) {
    const moreActions = [];
    const moreOptions = confirmationPrompt.options.filter(a => a !== (isString(suggestedOption) ? suggestedOption : suggestedOption.option));
    let i = 0;
    for (const option of moreOptions) {
        const label = option + (confirmationPrompt.descriptions ? ' (' + confirmationPrompt.descriptions[i] + ')' : '');
        const action = {
            label,
            tooltip: label,
            id: `terminal.poll.send.${option}`,
            class: undefined,
            enabled: true,
            run: async () => { }
        };
        i++;
        moreActions.push(action);
    }
    return moreActions.length ? moreActions : undefined;
}
export function matchTerminalPromptOption(options, suggestedOption) {
    const normalize = (value) => value.replace(/['"`]/g, '').trim().replace(/[.,:;]+$/, '');
    const normalizedSuggestion = normalize(suggestedOption);
    if (!normalizedSuggestion) {
        return { option: undefined, index: -1 };
    }
    const candidates = [normalizedSuggestion];
    const firstWhitespaceToken = normalizedSuggestion.split(/\s+/)[0];
    if (firstWhitespaceToken && firstWhitespaceToken !== normalizedSuggestion) {
        candidates.push(firstWhitespaceToken);
    }
    const firstAlphaNum = normalizedSuggestion.match(/[A-Za-z0-9]+/);
    if (firstAlphaNum?.[0] && firstAlphaNum[0] !== normalizedSuggestion && firstAlphaNum[0] !== firstWhitespaceToken) {
        candidates.push(firstAlphaNum[0]);
    }
    for (const candidate of candidates) {
        const exactIndex = options.findIndex(opt => normalize(opt) === candidate);
        if (exactIndex !== -1) {
            return { option: options[exactIndex], index: exactIndex };
        }
        const lowerCandidate = candidate.toLowerCase();
        const ciIndex = options.findIndex(opt => normalize(opt).toLowerCase() === lowerCandidate);
        if (ciIndex !== -1) {
            return { option: options[ciIndex], index: ciIndex };
        }
    }
    return { option: undefined, index: -1 };
}
export function detectsInputRequiredPattern(cursorLine) {
    return [
        // PowerShell-style multi-option line (supports [?] Help and optional default suffix) ending
        // in whitespace
        /\s*(?:\[[^\]]\]\s+[^\[\s][^\[]*\s*)+(?:\(default is\s+"[^"]+"\):)?\s+$/,
        // Bracketed/parenthesized yes/no pairs at end of line: (y/n), [Y/n], (yes/no), [no/yes]
        /(?:\(|\[)\s*(?:y(?:es)?\s*\/\s*n(?:o)?|n(?:o)?\s*\/\s*y(?:es)?)\s*(?:\]|\))\s+$/i,
        // Same as above but allows a preceding '?' or ':' and optional wrappers e.g.
        // "Continue? (y/n)" or "Overwrite: [yes/no]"
        /[?:]\s*(?:\(|\[)?\s*y(?:es)?\s*\/\s*n(?:o)?\s*(?:\]|\))?\s+$/i,
        // Confirmation prompts ending with (y) e.g. "Ok to proceed? (y)"
        /\(y\)\s*$/i,
        // Line ends with ':'
        /:\s*$/,
        // Line contains (END) which is common in pagers
        /\(END\)$/,
        // Password prompt
        /password[:]?$/i,
        // Line ends with '?'
        /\?\s*(?:\([a-z\s]+\))?$/i,
        // "Press a key" or "Press any key"
        /press a(?:ny)? key/i,
    ].some(e => e.test(cursorLine));
}
export function detectsNonInteractiveHelpPattern(cursorLine) {
    return [
        /press [h?]\s*(?:\+\s*enter)?\s*to (?:show|open|display|get|see)\s*(?:available )?(?:help|commands|options)/i,
        /press h\s*(?:or\s*\?)?\s*(?:\+\s*enter)?\s*for (?:help|commands|options)/i,
        /press \?\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:help|commands|options|list)/i,
        /type\s*[h?]\s*(?:\+\s*enter)?\s*(?:for|to see|to show)\s*(?:help|commands|options)/i,
        /hit\s*[h?]\s*(?:\+\s*enter)?\s*(?:for|to see|to show)\s*(?:help|commands|options)/i,
        /press o\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:open|launch)(?:\s*(?:the )?(?:app|application|browser)|\s+in\s+(?:the\s+)?browser)?/i,
        /press r\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:restart|reload|refresh)(?:\s*(?:the )?(?:server|dev server|service))?/i,
        /press q\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:quit|exit|stop)(?:\s*(?:the )?(?:server|app|process))?/i,
        /press u\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:show|print|display)\s*(?:the )?(?:server )?urls?/i
    ].some(e => e.test(cursorLine));
}
/**
 * Localized task finish messages from VS Code's terminalTaskSystem.
 * These are the same strings used when tasks complete.
 */
const taskFinishMessages = [
    // "Terminal will be reused by tasks, press any key to close it."
    localize('closeTerminal', "Terminal will be reused by tasks, press any key to close it."),
    localize('reuseTerminal', "Terminal will be reused by tasks, press any key to close it."),
    // "Press any key to close the terminal." (with exit code placeholder removed for matching)
    localize('exitCode.closeTerminal', "Press any key to close the terminal."),
    localize('exitCode.reuseTerminal', "Press any key to close the terminal."),
    // Punctuation variant: "The terminal will be reused by tasks. Press any key to close."
    localize('reuseTerminal.pressClose', "The terminal will be reused by tasks. Press any key to close."),
];
const normalizedTaskFinishMessages = taskFinishMessages.map(msg => msg.replace(/[\s.,:;!?"'`()[\]{}<>\-_/\\]+/g, '').toLowerCase());
/**
 * Detects VS Code's specific task completion messages like:
 * - "Press any key to close the terminal."
 * - "Terminal will be reused by tasks, press any key to close it."
 * These appear when a task finishes and should be ignored if the task is done.
 * Note: These messages may be prefixed with " * " by VS Code and may have line wrapping
 * that can split words across lines (e.g., "t\no" instead of "to").
 */
export function detectsVSCodeTaskFinishMessage(cursorLine) {
    // Be tolerant to whitespace, punctuation, and line wrapping that can split words mid-word.
    const compact = cursorLine.replace(/[\s.,:;!?"'`()[\]{}<>\-_/\\]+/g, '').toLowerCase();
    return normalizedTaskFinishMessages.some(msg => compact.includes(msg));
}
/**
 * Detects generic "press any key" prompts from scripts (not VS Code task messages).
 * These should prompt the user to interact with the terminal.
 */
export function detectsGenericPressAnyKeyPattern(cursorLine) {
    // Match "press any key" but exclude VS Code task-specific messages
    if (detectsVSCodeTaskFinishMessage(cursorLine)) {
        return false;
    }
    return /press a(?:ny)? key/i.test(cursorLine);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0TW9uaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL21vbml0b3Jpbmcvb3V0cHV0TW9uaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUloRyxPQUFPLEVBQUUsT0FBTyxFQUFxQixNQUFNLDJDQUEyQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFvQixNQUFNLCtDQUErQyxDQUFDO0FBQzlILE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFL0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzlILE9BQU8sRUFBRSxTQUFTLEVBQW9CLE1BQU0sK0NBQStDLENBQUM7QUFDNUYsT0FBTyxFQUFvQixZQUFZLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN2RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDNUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNB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