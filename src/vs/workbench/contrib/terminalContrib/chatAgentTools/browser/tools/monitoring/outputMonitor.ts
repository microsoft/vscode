/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarker as XtermMarker } from '@xterm/xterm';
import { IAction } from '../../../../../../../base/common/actions.js';
import { timeout, type MaybePromise } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable, type IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { isObject, isString } from '../../../../../../../base/common/types.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { IChatWidgetService } from '../../../../../chat/browser/chat.js';
import { ChatElicitationRequestPart } from '../../../../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatModel } from '../../../../../chat/common/model/chatModel.js';
import { ElicitationState, IChatService } from '../../../../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../../chat/common/constants.js';
import { ChatMessageRole, ILanguageModelsService } from '../../../../../chat/common/languageModels.js';
import { IToolInvocationContext } from '../../../../../chat/common/tools/languageModelToolsService.js';
import { ITaskService } from '../../../../../tasks/common/taskService.js';
import { ILinkLocation } from '../../taskHelpers.js';
import { IConfirmationPrompt, IExecution, IPollingResult, OutputMonitorState, PollingConsts } from './types.js';
import { getTextResponseFromStream } from './utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { ITerminalLogService } from '../../../../../../../platform/terminal/common/terminal.js';

export interface IOutputMonitor extends Disposable {
	readonly pollingResult: IPollingResult & { pollDurationMs: number } | undefined;
	readonly outputMonitorTelemetryCounters: IOutputMonitorTelemetryCounters;

	readonly onDidFinishCommand: Event<void>;
}

export interface IOutputMonitorTelemetryCounters {
	inputToolManualAcceptCount: number;
	inputToolManualRejectCount: number;
	inputToolManualChars: number;
	inputToolAutoAcceptCount: number;
	inputToolAutoChars: number;
	inputToolManualShownCount: number;
	inputToolFreeFormInputShownCount: number;
	inputToolFreeFormInputCount: number;
}

export class OutputMonitor extends Disposable implements IOutputMonitor {
	private _state: OutputMonitorState = OutputMonitorState.PollingForIdle;
	get state(): OutputMonitorState { return this._state; }

	private _formatLastLineForLog(output: string | undefined): string {
		if (!output) {
			return '<empty>';
		}
		const lastLine = output.trimEnd().split(/\r?\n/).pop() ?? '';
		if (!lastLine) {
			return '<empty>';
		}
		// Avoid logging potentially sensitive values from common secret prompts.
		if (/(password|passphrase|token|api\s*key|secret)/i.test(lastLine)) {
			return '<redacted>';
		}
		// Keep logs bounded.
		return lastLine.length > 200 ? lastLine.slice(0, 200) + '…' : lastLine;
	}

	private _formatOptionsForLog(options: readonly string[]): string {
		if (!options.length) {
			return '[]';
		}
		// Keep bounded and single-line.
		const maxOptions = 12;
		const shown = options.slice(0, maxOptions).map(o => o.replace(/\r?\n/g, 'return'));
		const suffix = options.length > maxOptions ? `, …(+${options.length - maxOptions})` : '';
		return `[${shown.join(', ')}${suffix}]`;
	}

	private _lastPromptMarker: XtermMarker | undefined;

	private _lastPrompt: string | undefined;

	private _promptPart: ChatElicitationRequestPart | undefined;

	private _pollingResult: IPollingResult & { pollDurationMs: number } | undefined;
	get pollingResult(): IPollingResult & { pollDurationMs: number } | undefined { return this._pollingResult; }

	/**
	 * Flag to track if user has inputted since idle was detected.
	 * This is used to skip showing prompts if the user already provided input.
	 */
	private _userInputtedSinceIdleDetected = false;
	private readonly _userInputListener = this._register(new MutableDisposable<IDisposable>());

	private readonly _outputMonitorTelemetryCounters: IOutputMonitorTelemetryCounters = {
		inputToolManualAcceptCount: 0,
		inputToolManualRejectCount: 0,
		inputToolManualChars: 0,
		inputToolAutoAcceptCount: 0,
		inputToolAutoChars: 0,
		inputToolManualShownCount: 0,
		inputToolFreeFormInputShownCount: 0,
		inputToolFreeFormInputCount: 0,
	};
	get outputMonitorTelemetryCounters(): Readonly<IOutputMonitorTelemetryCounters> { return this._outputMonitorTelemetryCounters; }

	private readonly _onDidFinishCommand = this._register(new Emitter<void>());
	readonly onDidFinishCommand: Event<void> = this._onDidFinishCommand.event;

	constructor(
		private readonly _execution: IExecution,
		private readonly _pollFn: ((execution: IExecution, token: CancellationToken, taskService: ITaskService) => Promise<IPollingResult | undefined>) | undefined,
		invocationContext: IToolInvocationContext | undefined,
		token: CancellationToken,
		command: string,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ITaskService private readonly _taskService: ITaskService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();

		// Start async to ensure listeners are set up
		timeout(0).then(() => {
			this._startMonitoring(command, invocationContext, token);
		});
	}

	private async _startMonitoring(
		command: string,
		invocationContext: IToolInvocationContext | undefined,
		token: CancellationToken
	): Promise<void> {
		const pollStartTime = Date.now();

		let modelOutputEvalResponse;
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
						} else {
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
						if (idleResult.shouldContinuePollling) {
							this._logService.trace('OutputMonitor: Idle handler -> continue polling');
							this._state = OutputMonitorState.PollingForIdle;
							continue;
						} else {
							this._logService.trace(`OutputMonitor: Idle handler -> stop polling (hasResources=${!!idleResult.resources}, hasModelEval=${!!idleResult.modelOutputEvalResponse}, outputLen=${idleResult.output?.length ?? 0})`);
							resources = idleResult.resources;
							modelOutputEvalResponse = idleResult.modelOutputEvalResponse;
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
		} finally {
			this._logService.trace(`OutputMonitor: Monitoring finished (state=${OutputMonitorState[this._state]}, duration=${Date.now() - pollStartTime}ms)`);
			this._pollingResult = {
				state: this._state,
				output: output ?? this._execution.getOutput(),
				modelOutputEvalResponse: token.isCancellationRequested ? 'Cancelled' : modelOutputEvalResponse,
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
				} catch (err) {
					this._logService.error('OutputMonitor: Failed to hide prompt', err);
				}
			}
			this._onDidFinishCommand.fire();
		}
	}


	private async _handleIdleState(token: CancellationToken): Promise<{ resources?: ILinkLocation[]; modelOutputEvalResponse?: string; shouldContinuePollling: boolean; output?: string }> {
		const output = this._execution.getOutput(this._lastPromptMarker);
		this._logService.trace(`OutputMonitor: Idle output summary: len=${output.length}, lastLine=${this._formatLastLineForLog(output)}`);

		if (detectsNonInteractiveHelpPattern(output)) {
			this._logService.trace('OutputMonitor: Idle -> non-interactive help pattern detected, stopping');
			return { shouldContinuePollling: false, output };
		}

		// Check for VS Code's task finish messages (like "press any key to close the terminal").
		// These should only be ignored if it's a task AND the task is finished.
		// Otherwise, "press any key to continue" from scripts should prompt the user.
		const isTask = this._execution.task !== undefined;
		const isTaskInactive = this._execution.isActive ? !(await this._execution.isActive()) : true;
		if (isTask && isTaskInactive && detectsVSCodeTaskFinishMessage(output)) {
			this._logService.trace('OutputMonitor: Idle -> VS Code task finish message detected for inactive task, stopping');
			// Task is finished, ignore the "press any key to close" message
			return { shouldContinuePollling: false, output };
		}

		// Check for generic "press any key" prompts from scripts.
		// These should be treated as free-form input to let the user press a key.
		if ((!isTask || !isTaskInactive) && detectsGenericPressAnyKeyPattern(output)) {
			this._logService.trace('OutputMonitor: Idle -> generic "press any key" detected, requesting free-form input');
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
				return { shouldContinuePollling: true };
			} else {
				this._logService.trace('OutputMonitor: Free-form input declined for "press any key", stopping');
				return { shouldContinuePollling: false };
			}
		}

		// Check if user already inputted since idle was detected (before we even got here)
		if (this._userInputtedSinceIdleDetected) {
			this._logService.trace('OutputMonitor: User input detected since idle; skipping prompt and continuing polling');
			this._cleanupIdleInputListener();
			return { shouldContinuePollling: true };
		}

		this._logService.trace('OutputMonitor: Determining user input options via language model');
		const confirmationPrompt = await this._determineUserInputOptions(this._execution, token);
		this._logService.trace(`OutputMonitor: Input options result: ${confirmationPrompt ? `prompt=${this._formatLastLineForLog(confirmationPrompt.prompt)}, options=${confirmationPrompt.options.length} ${this._formatOptionsForLog(confirmationPrompt.options)}, freeForm=${!!confirmationPrompt.detectedRequestForFreeFormInput}` : 'none'}`);

		// Check again after the async LLM call - user may have inputted while we were analyzing
		if (this._userInputtedSinceIdleDetected) {
			this._logService.trace('OutputMonitor: User input arrived during input-option analysis; continuing polling');
			this._cleanupIdleInputListener();
			return { shouldContinuePollling: true };
		}

		if (confirmationPrompt?.detectedRequestForFreeFormInput) {
			// Check again right before showing prompt
			if (this._userInputtedSinceIdleDetected) {
				this._logService.trace('OutputMonitor: User input arrived before showing free-form prompt; continuing polling');
				this._cleanupIdleInputListener();
				return { shouldContinuePollling: true };
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
				return { shouldContinuePollling: true };
			} else {
				// User declined
				this._logService.trace('OutputMonitor: Free-form input declined; stopping');
				return { shouldContinuePollling: false };
			}
		}

		if (confirmationPrompt?.options.length) {
			this._logService.trace(`OutputMonitor: Showing option-based input flow (options=${confirmationPrompt.options.length})`);
			const suggestedOptionResult = await this._selectAndHandleOption(confirmationPrompt, token);
			this._logService.trace(`OutputMonitor: Suggested option result: ${suggestedOptionResult?.suggestedOption ? 'hasSuggestion' : 'none'} (autoSent=${!!suggestedOptionResult?.sentToTerminal})`);
			if (suggestedOptionResult?.sentToTerminal) {
				// Continue polling as we sent the input
				this._cleanupIdleInputListener();
				return { shouldContinuePollling: true };
			}
			// Check again after LLM call - user may have inputted while we were selecting option
			if (this._userInputtedSinceIdleDetected) {
				this._logService.trace('OutputMonitor: User input arrived during option selection; continuing polling');
				this._cleanupIdleInputListener();
				return { shouldContinuePollling: true };
			}
			// Clean up the input listener now - the prompt will set up its own
			this._cleanupIdleInputListener();
			this._logService.trace('OutputMonitor: Showing confirmation elicitation for suggested option');
			const confirmed = await this._confirmRunInTerminal(token, suggestedOptionResult?.suggestedOption ?? confirmationPrompt.options[0], this._execution, confirmationPrompt);
			if (confirmed) {
				// Continue polling as we sent the input
				this._logService.trace('OutputMonitor: Option confirmed/sent; continuing polling');
				return { shouldContinuePollling: true };
			} else {
				// User declined
				this._logService.trace('OutputMonitor: Option declined; stopping');
				this._execution.instance.focus(true);
				return { shouldContinuePollling: false };
			}
		}

		// Clean up input listener before custom poll/error assessment
		this._cleanupIdleInputListener();

		// Let custom poller override if provided
		const custom = await this._pollFn?.(this._execution, token, this._taskService);
		this._logService.trace(`OutputMonitor: Custom poller result: ${custom ? 'provided' : 'none'}`);
		const resources = custom?.resources;
		const modelOutputEvalResponse = await this._assessOutputForErrors(this._execution.getOutput(), token);
		return { resources, modelOutputEvalResponse, shouldContinuePollling: false, output: custom?.output ?? output };
	}

	private async _handleTimeoutState(_command: string, _invocationContext: IToolInvocationContext | undefined, _extended: boolean, _token: CancellationToken): Promise<boolean> {
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
	private async _waitForIdle(
		execution: IExecution,
		extendedPolling: boolean,
		token: CancellationToken,
	): Promise<OutputMonitorState> {

		const maxWaitMs = extendedPolling ? PollingConsts.ExtendedPollingMaxDuration : PollingConsts.FirstPollingMaxDuration;
		const maxInterval = PollingConsts.MaxPollingIntervalDuration;
		let currentInterval = PollingConsts.MinPollingDuration;
		let waited = 0;
		let consecutiveIdleEvents = 0;
		let hasReceivedData = false;
		const onDataDisposable = execution.instance.onData((_data) => {
			hasReceivedData = true;
		});

		try {
			while (!token.isCancellationRequested && waited < maxWaitMs) {
				const waitTime = Math.min(currentInterval, maxWaitMs - waited);
				await timeout(waitTime, token);
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
				} else {
					consecutiveIdleEvents++;
				}

				const recentlyIdle = consecutiveIdleEvents >= PollingConsts.MinIdleEvents;
				const isActive = execution.isActive ? await execution.isActive() : undefined;
				this._logService.trace(`OutputMonitor: waitForIdle check: waited=${waited}ms, recentlyIdle=${recentlyIdle}, isActive=${isActive}`);
				if (recentlyIdle && isActive !== true) {
					this._logService.trace(`OutputMonitor: waitForIdle -> recentlyIdle && !active (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentOutput)})`);
					this._state = OutputMonitorState.Idle;
					this._setupIdleInputListener();
					return this._state;
				}
			}
		} finally {
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
	private _setupIdleInputListener(): void {
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
	private _cleanupIdleInputListener(): void {
		this._userInputtedSinceIdleDetected = false;
		this._userInputListener.clear();
	}

	private async _assessOutputForErrors(buffer: string, token: CancellationToken): Promise<string | undefined> {
		const model = await this._getLanguageModel();
		if (!model) {
			return 'No models available';
		}

		const response = await this._languageModelsService.sendChatRequest(
			model,
			new ExtensionIdentifier('core'),
			[{ role: ChatMessageRole.User, content: [{ type: 'text', value: `Evaluate this terminal output to determine if there were errors. If there are errors, return them. Otherwise, return undefined: ${buffer}.` }] }],
			{},
			token
		);

		try {
			const responseFromStream = getTextResponseFromStream(response);
			await Promise.all([response.result, responseFromStream]);
			return await responseFromStream;
		} catch (err) {
			return 'Error occurred ' + err;
		}
	}

	private async _determineUserInputOptions(execution: IExecution, token: CancellationToken): Promise<IConfirmationPrompt | undefined> {
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

		const promptText =
			`Analyze the following terminal output. If it contains a prompt requesting user input (such as a confirmation, selection, or yes/no question) that appears at the VERY END of the output and has NOT already been answered (i.e., there is no user response or subsequent output after the prompt), extract the prompt text. IMPORTANT: Only detect prompts that are at the end of the output with no content following them - if there is any output after the prompt, the prompt has already been answered and you should return null. The prompt may ask to choose from a set. If so, extract the possible options as a JSON object with keys 'prompt', 'options' (an array of strings or an object with option to description mappings), and 'freeFormInput': false. If no options are provided, and free form input is requested, for example: Password:, return the word freeFormInput. For example, if the options are "[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [C] Cancel", the option to description mappings would be {"Y": "Yes", "A": "Yes to All", "N": "No", "L": "No to All", "C": "Cancel"}. If there is no such prompt, return null. If the option is ambiguous, return null.
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
				Response: {"prompt": "Password:", "freeFormInput": true, "options": []}
			8. Output: "press ctrl-c to detach, ctrl-d to kill"
				Response: null
			9. Output: "Continue (y/n)? y"
				Response: null (the prompt was already answered with 'y')
			10. Output: "Do you want to proceed? (yes/no)\nyes\nProceeding with operation..."
				Response: null (the prompt was already answered and there is subsequent output)

			Alternatively, the prompt may request free form input, for example:
			1. Output: "Enter your username:"
				Response: {"prompt": "Enter your username:", "freeFormInput": true, "options": []}
			2. Output: "Password:"
				Response: {"prompt": "Password:", "freeFormInput": true, "options": []}
			3. Output: "Press any key to continue..."
				Response: {"prompt": "Press any key to continue...", "freeFormInput": true, "options": []}
			Now, analyze this output:
			${lastLines}
			`;

		const response = await this._languageModelsService.sendChatRequest(model, new ExtensionIdentifier('core'), [{ role: ChatMessageRole.User, content: [{ type: 'text', value: promptText }] }], {}, token);
		const responseText = await getTextResponseFromStream(response);
		try {
			const match = responseText.match(/\{[\s\S]*\}/);
			if (match) {
				const parsed = JSON.parse(match[0]) as unknown;
				if (
					isObject(parsed) &&
					Object.hasOwn(parsed, 'prompt') && isString((parsed as Record<string, unknown>).prompt) &&
					Object.hasOwn(parsed, 'options') &&
					Object.hasOwn(parsed, 'freeFormInput') && typeof (parsed as Record<string, unknown>).freeFormInput === 'boolean'
				) {
					const obj = parsed as { prompt: string; options: unknown; freeFormInput: boolean };
					if (this._lastPrompt === obj.prompt) {
						this._logService.trace('OutputMonitor: determineUserInputOptions ignoring duplicate prompt');
						return;
					}
					if (obj.freeFormInput === true) {
						return { prompt: obj.prompt, options: [], detectedRequestForFreeFormInput: true };
					}
					if (Array.isArray(obj.options) && obj.options.every(isString)) {
						return { prompt: obj.prompt, options: obj.options, detectedRequestForFreeFormInput: obj.freeFormInput };
					} else if (isObject(obj.options) && Object.values(obj.options).every(isString)) {
						const keys = Object.keys(obj.options);
						if (keys.length === 0) {
							return undefined;
						}
						const descriptions = keys.map(key => (obj.options as Record<string, string>)[key]);
						return { prompt: obj.prompt, options: keys, descriptions, detectedRequestForFreeFormInput: obj.freeFormInput };
					}
				}
			}
		} catch (err) {
			this._logService.trace('OutputMonitor: Failed to parse confirmation prompt from language model response', err);
		}
		return undefined;
	}

	private async _selectAndHandleOption(
		confirmationPrompt: IConfirmationPrompt | undefined,
		token: CancellationToken,
	): Promise<ISuggestedOptionResult | undefined> {
		if (!confirmationPrompt?.options.length) {
			return undefined;
		}
		const model = this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)[0]?.input.currentLanguageModel;
		if (!model) {
			return undefined;
		}

		const models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', family: model.replaceAll('copilot/', '') });
		if (!models.length) {
			return undefined;
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

		const promptText = `Given the following confirmation prompt and options from a terminal output, which option is the default?\nPrompt: "${prompt}"\nOptions: ${JSON.stringify(options)}\nRespond with only the option string.`;
		const response = await this._languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('core'), [
			{ role: ChatMessageRole.User, content: [{ type: 'text', value: promptText }] }
		], {}, token);

		const suggestedOption = (await getTextResponseFromStream(response)).trim();
		const autoReply = this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoReplyToPrompts);
		let validOption: string;
		let index: number;

		if (!suggestedOption) {
			// No suggestion from LLM - fall back to first option if autoReply is enabled
			if (autoReply) {
				validOption = options[0];
				index = 0;
				this._logService.trace(`OutputMonitor: No LLM suggestion, falling back to first option: ${validOption}`);
			} else {
				return;
			}
		} else {
			const match = matchTerminalPromptOption(confirmationPrompt.options, suggestedOption);
			if (!match.option || match.index === -1) {
				// LLM suggestion didn't match any option - fall back to first option if autoReply is enabled
				if (autoReply) {
					validOption = options[0];
					index = 0;
					this._logService.trace(`OutputMonitor: LLM suggestion '${suggestedOption}' didn't match options, falling back to first option: ${validOption}`);
				} else {
					return;
				}
			} else {
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

	private async _requestFreeFormTerminalInput(token: CancellationToken, execution: IExecution, confirmationPrompt: IConfirmationPrompt, acceptAnyKey: boolean = false): Promise<boolean> {
		const focusTerminalSelection = Symbol('focusTerminalSelection');
		const { promise: userPrompt, part } = this._createElicitationPart<boolean | typeof focusTerminalSelection>(
			token,
			execution.sessionResource,
			new MarkdownString(localize('poll.terminal.inputRequest', "The terminal is awaiting input.")),
			new MarkdownString(localize('poll.terminal.requireInput', "{0}\nPlease provide the required input to the terminal.\n\n", confirmationPrompt.prompt)),
			'',
			localize('poll.terminal.enterInput', 'Focus terminal'),
			undefined,
			() => {
				this._showInstance(execution.instance.instanceId);
				return focusTerminalSelection;
			}
		);

		let inputDataDisposable: IDisposable = Disposable.None;
		let instanceDisposedDisposable: IDisposable = Disposable.None;
		const inputPromise = new Promise<boolean>(resolve => {
			let settled = false;
			const settle = (value: boolean, state: OutputMonitorState) => {
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

	private async _confirmRunInTerminal(token: CancellationToken, suggestedOption: SuggestedOption, execution: IExecution, confirmationPrompt: IConfirmationPrompt): Promise<string | boolean | undefined> {
		const suggestedOptionValue = isString(suggestedOption) ? suggestedOption : suggestedOption.option;
		const focusTerminalSelection = Symbol('focusTerminalSelection');
		let inputDataDisposable: IDisposable = Disposable.None;
		let instanceDisposedDisposable: IDisposable = Disposable.None;
		const { promise: userPrompt, part } = this._createElicitationPart<string | boolean | typeof focusTerminalSelection | undefined>(
			token,
			execution.sessionResource,
			new MarkdownString(localize('poll.terminal.confirmRequired', "The terminal is awaiting input.")),
			new MarkdownString(localize('poll.terminal.confirmRunDetail', "{0}\n Do you want to send `{1}`{2} followed by `Enter` to the terminal?", confirmationPrompt.prompt, suggestedOptionValue, isString(suggestedOption) ? '' : suggestedOption.description ? ' (' + suggestedOption.description + ')' : '')),
			'',
			localize('poll.terminal.acceptRun', 'Allow'),
			localize('poll.terminal.rejectRun', 'Focus Terminal'),
			async (value: IAction | true) => {
				let option: string | undefined = undefined;
				if (value === true) {
					option = suggestedOptionValue;
				} else if (typeof value === 'object' && Object.hasOwn(value, 'label')) {
					option = value.label.split(' (')[0];
				}
				this._outputMonitorTelemetryCounters.inputToolManualAcceptCount++;
				this._outputMonitorTelemetryCounters.inputToolManualChars += option?.length || 0;
				return option;
			},
			() => {
				this._showInstance(execution.instance.instanceId);
				this._outputMonitorTelemetryCounters.inputToolManualRejectCount++;
				return focusTerminalSelection;
			},
			getMoreActions(suggestedOption, confirmationPrompt)
		);
		const inputPromise = new Promise<boolean>(resolve => {
			let settled = false;
			const settle = (value: boolean, state: OutputMonitorState) => {
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

	private _showInstance(instanceId?: number): void {
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
	private _createElicitationPart<T>(
		token: CancellationToken,
		sessionResource: URI | undefined,
		title: MarkdownString,
		detail: MarkdownString,
		subtitle: string,
		acceptLabel: string,
		rejectLabel?: string,
		onAccept?: (value: IAction | true) => MaybePromise<T | undefined>,
		onReject?: () => MaybePromise<T | undefined>,
		moreActions?: IAction[] | undefined
	): { promise: Promise<T | undefined>; part: ChatElicitationRequestPart } {
		const chatModel = sessionResource && this._chatService.getSession(sessionResource);
		if (!(chatModel instanceof ChatModel)) {
			throw new Error('No model');
		}
		const request = chatModel.getRequests().at(-1);
		if (!request) {
			throw new Error('No request');
		}
		let part!: ChatElicitationRequestPart;
		const promise = new Promise<T | undefined>(resolve => {
			const thePart = part = new ChatElicitationRequestPart(
				title,
				detail,
				subtitle,
				acceptLabel,
				rejectLabel,
				async (value: IAction | true) => {
					try {
						const r = await (onAccept ? onAccept(value) : undefined);
						resolve(r as T | undefined);
						// Don't hide if return value is a Symbol (e.g., focusTerminalSelection)
						// This keeps the elicitation visible while user focuses terminal to provide input
						if (typeof r === 'symbol') {
							return ElicitationState.Pending;
						}
					} catch {
						resolve(undefined);
					}
					thePart.hide();
					this._promptPart = undefined;
					return ElicitationState.Accepted;
				},
				async () => {
					try {
						const r = await (onReject ? onReject() : undefined);
						resolve(r as T | undefined);
						// Don't hide if return value is a Symbol (e.g., focusTerminalSelection)
						// This keeps the elicitation visible while user focuses terminal to provide input
						if (typeof r === 'symbol') {
							return ElicitationState.Pending;
						}
					} catch {
						resolve(undefined);
					}
					thePart.hide();
					this._promptPart = undefined;
					return ElicitationState.Rejected;
				},
				undefined, // source
				moreActions,
				() => this._outputMonitorTelemetryCounters.inputToolManualShownCount++
			);

			chatModel.acceptResponseProgress(request, thePart);
			this._promptPart = thePart;
		});

		this._register(token.onCancellationRequested(() => part.hide()));

		return { promise, part };
	}

	private async _getLanguageModel(): Promise<string | undefined> {
		let models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', id: 'copilot-fast' });

		// Fallback to gpt-4o-mini if copilot-fast is not available for backwards compatibility
		if (!models.length) {
			models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
		}

		return models.length ? models[0] : undefined;
	}
}

function getMoreActions(suggestedOption: SuggestedOption, confirmationPrompt: IConfirmationPrompt): IAction[] | undefined {
	const moreActions: IAction[] = [];
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

type SuggestedOption = string | { description: string; option: string };
interface ISuggestedOptionResult {
	suggestedOption?: SuggestedOption;
	sentToTerminal?: boolean;
}

export function matchTerminalPromptOption(options: readonly string[], suggestedOption: string): { option: string | undefined; index: number } {
	const normalize = (value: string) => value.replace(/['"`]/g, '').trim().replace(/[.,:;]+$/, '');

	const normalizedSuggestion = normalize(suggestedOption);
	if (!normalizedSuggestion) {
		return { option: undefined, index: -1 };
	}

	const candidates: string[] = [normalizedSuggestion];
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

export function detectsInputRequiredPattern(cursorLine: string): boolean {
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

export function detectsNonInteractiveHelpPattern(cursorLine: string): boolean {
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
];

/**
 * Detects VS Code's specific task completion messages like:
 * - "Press any key to close the terminal."
 * - "Terminal will be reused by tasks, press any key to close it."
 * These appear when a task finishes and should be ignored if the task is done.
 * Note: These messages may be prefixed with " * " by VS Code and may have line wrapping
 * that can split words across lines (e.g., "t\no" instead of "to").
 */
export function detectsVSCodeTaskFinishMessage(cursorLine: string): boolean {
	// Remove all whitespace to handle line wrapping that splits words mid-word
	const normalized = cursorLine.replace(/\s/g, '').toLowerCase();
	return taskFinishMessages.some(msg => normalized.includes(msg.replace(/\s/g, '').toLowerCase()));
}

/**
 * Detects generic "press any key" prompts from scripts (not VS Code task messages).
 * These should prompt the user to interact with the terminal.
 */
export function detectsGenericPressAnyKeyPattern(cursorLine: string): boolean {
	// Match "press any key" but exclude VS Code task-specific messages
	if (detectsVSCodeTaskFinishMessage(cursorLine)) {
		return false;
	}
	return /press a(?:ny)? key/i.test(cursorLine);
}
