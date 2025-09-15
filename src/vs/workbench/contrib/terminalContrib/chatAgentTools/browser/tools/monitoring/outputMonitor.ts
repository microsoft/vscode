/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarker as XtermMarker } from '@xterm/xterm';
import { IAction } from '../../../../../../../base/common/actions.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { isObject, isString } from '../../../../../../../base/common/types.js';
import { localize } from '../../../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { IChatWidgetService } from '../../../../../chat/browser/chat.js';
import { ChatElicitationRequestPart } from '../../../../../chat/browser/chatElicitationRequestPart.js';
import { ChatModel } from '../../../../../chat/common/chatModel.js';
import { IChatService } from '../../../../../chat/common/chatService.js';
import { ChatAgentLocation } from '../../../../../chat/common/constants.js';
import { ChatMessageRole, ILanguageModelsService } from '../../../../../chat/common/languageModels.js';
import { IToolInvocationContext } from '../../../../../chat/common/languageModelToolsService.js';
import { ITaskService } from '../../../../../tasks/common/taskService.js';
import { detectsInputRequiredPattern } from '../../executeStrategy/executeStrategy.js';
import { ILinkLocation } from '../../taskHelpers.js';
import { IConfirmationPrompt, IExecution, IPollingResult, OutputMonitorState, PollingConsts } from './types.js';
import { getTextResponseFromStream } from './utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';

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

	private _lastPromptMarker: XtermMarker | undefined;

	private _lastPrompt: string | undefined;

	private _promptPart: ChatElicitationRequestPart | undefined;

	private _pollingResult: IPollingResult & { pollDurationMs: number } | undefined;
	get pollingResult(): IPollingResult & { pollDurationMs: number } | undefined { return this._pollingResult; }

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
		invocationContext: IToolInvocationContext,
		token: CancellationToken,
		command: string,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ITaskService private readonly _taskService: ITaskService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		// Start async to ensure listeners are set up
		timeout(0).then(() => {
			this._startMonitoring(command, invocationContext, token);
		});
	}

	private async _startMonitoring(
		command: string,
		invocationContext: IToolInvocationContext,
		token: CancellationToken
	): Promise<void> {
		const pollStartTime = Date.now();

		let modelOutputEvalResponse;
		let resources;

		let extended = false;
		try {
			while (!token.isCancellationRequested) {
				switch (this._state) {
					case OutputMonitorState.PollingForIdle: {
						this._state = await this._waitForIdle(this._execution, extended, token);
						continue;
					}
					case OutputMonitorState.Timeout: {
						const shouldContinuePolling = await this._handleTimeoutState(command, invocationContext, extended, token);
						if (shouldContinuePolling) {
							extended = true;
							continue;
						} else {
							this._promptPart?.hide();
							this._promptPart?.dispose();
							this._promptPart = undefined;
							break;
						}
					}
					case OutputMonitorState.Cancelled:
						break;
					case OutputMonitorState.Idle: {
						const idleResult = await this._handleIdleState(token);
						if (idleResult.shouldContinuePollling) {
							continue;
						} else {
							resources = idleResult.resources;
							modelOutputEvalResponse = idleResult.modelOutputEvalResponse;
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
			this._pollingResult = {
				state: this._state,
				output: this._execution.getOutput(),
				modelOutputEvalResponse: token.isCancellationRequested ? 'Cancelled' : modelOutputEvalResponse,
				pollDurationMs: Date.now() - pollStartTime,
				resources
			};
			this._promptPart?.hide();
			this._promptPart?.dispose();
			this._promptPart = undefined;
			this._onDidFinishCommand.fire();
		}
	}


	private async _handleIdleState(token: CancellationToken): Promise<{ resources?: ILinkLocation[]; modelOutputEvalResponse?: string; shouldContinuePollling: boolean }> {
		const confirmationPrompt = await this._determineUserInputOptions(this._execution, token);

		if (confirmationPrompt?.detectedRequestForFreeFormInput) {
			this._outputMonitorTelemetryCounters.inputToolFreeFormInputShownCount++;
			const focusedTerminal = await this._requestFreeFormTerminalInput(token, this._execution, confirmationPrompt);
			if (focusedTerminal) {
				await new Promise<void>(resolve => {
					const disposable = this._execution.instance.onData(data => {
						if (data === '\r' || data === '\n' || data === '\r\n') {
							this._outputMonitorTelemetryCounters.inputToolFreeFormInputCount++;
							disposable.dispose();
							resolve();
						}
					});
				});
				// Small delay to ensure input is processed
				await timeout(200);
				// Continue polling as we sent the input
				return { shouldContinuePollling: true };
			} else {
				// User declined
				return { shouldContinuePollling: false };
			}
		}

		if (confirmationPrompt?.options.length) {
			const suggestedOptionResult = await this._selectAndHandleOption(confirmationPrompt, token);
			if (suggestedOptionResult?.sentToTerminal) {
				// Continue polling as we sent the input
				return { shouldContinuePollling: true };
			}
			const confirmed = await this._confirmRunInTerminal(token, suggestedOptionResult?.suggestedOption ?? confirmationPrompt.options[0], this._execution, confirmationPrompt);
			if (confirmed) {
				// Continue polling as we sent the input
				return { shouldContinuePollling: true };
			} else {
				// User declined
				this._execution.instance.focus(true);
				return { shouldContinuePollling: false };
			}
		}

		// Let custom poller override if provided
		const custom = await this._pollFn?.(this._execution, token, this._taskService);
		const resources = custom?.resources;
		const modelOutputEvalResponse = await this._assessOutputForErrors(this._execution.getOutput(), token);
		return { resources, modelOutputEvalResponse, shouldContinuePollling: false };
	}

	private async _handleTimeoutState(command: string, invocationContext: IToolInvocationContext, extended: boolean, token: CancellationToken): Promise<boolean> {
		let continuePollingPart: ChatElicitationRequestPart | undefined;
		if (extended) {
			this._state = OutputMonitorState.Cancelled;
			return false;
		}
		extended = true;

		const { promise: p, part } = await this._promptForMorePolling(command, token, invocationContext);
		let continuePollingDecisionP: Promise<boolean> | undefined = p;
		continuePollingPart = part;

		// Start another polling pass and race it against the user's decision
		const nextPollP = this._waitForIdle(this._execution, extended, token)
			.catch((): IPollingResult => ({
				state: OutputMonitorState.Cancelled,
				output: this._execution.getOutput(),
				modelOutputEvalResponse: 'Cancelled'
			}));

		const race = await Promise.race([
			continuePollingDecisionP.then(v => ({ kind: 'decision' as const, v })),
			nextPollP.then(r => ({ kind: 'poll' as const, r }))
		]);

		if (race.kind === 'decision') {
			try { continuePollingPart?.hide(); continuePollingPart?.dispose?.(); } catch { /* noop */ }
			continuePollingPart = undefined;

			// User explicitly declined to keep waiting, so finish with the timed-out result
			if (race.v === false) {
				this._state = OutputMonitorState.Cancelled;
				return false;
			}

			// User accepted; keep polling (the loop iterates again).
			// Clear the decision so we don't race on a resolved promise.
			continuePollingDecisionP = undefined;
			return true;
		} else {
			// A background poll completed while waiting for a decision
			const r = race.r;

			if (r === OutputMonitorState.Idle || r === OutputMonitorState.Cancelled || r === OutputMonitorState.Timeout) {
				try { continuePollingPart?.hide(); continuePollingPart?.dispose?.(); } catch { /* noop */ }
				continuePollingPart = undefined;
				continuePollingDecisionP = undefined;

				return false;
			}

			// Still timing out; loop and race again with the same prompt.
			return true;
		}
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
		let currentOutput: string | undefined;
		let onDataDisposable = Disposable.None;

		try {
			while (!token.isCancellationRequested && waited < maxWaitMs) {
				const waitTime = Math.min(currentInterval, maxWaitMs - waited);
				await timeout(waitTime, token);
				waited += waitTime;
				currentInterval = Math.min(currentInterval * 2, maxInterval);
				if (currentOutput === undefined) {
					currentOutput = execution.getOutput();
					onDataDisposable = execution.instance.onData((data) => {
						hasReceivedData = true;
						currentOutput += data;
					});
				}
				const promptResult = detectsInputRequiredPattern(currentOutput);
				if (promptResult) {
					this._state = OutputMonitorState.Idle;
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

				// Keep polling if still active with no recent data
				if (recentlyIdle && isActive === true) {
					consecutiveIdleEvents = 0;
					continue;
				}

				if (recentlyIdle || isActive === false) {
					return OutputMonitorState.Idle;
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

	private async _promptForMorePolling(command: string, token: CancellationToken, context: IToolInvocationContext): Promise<{ promise: Promise<boolean>; part?: ChatElicitationRequestPart }> {
		if (token.isCancellationRequested || this._state === OutputMonitorState.Cancelled) {
			return { promise: Promise.resolve(false) };
		}
		const result = this._createElicitationPart<boolean>(
			token,
			context.sessionId,
			new MarkdownString(localize('poll.terminal.waiting', "Continue waiting for `{0}`?", command)),
			new MarkdownString(localize('poll.terminal.polling', "This will continue to poll for output to determine when the terminal becomes idle for up to 2 minutes.")),
			'',
			localize('poll.terminal.accept', 'Yes'),
			localize('poll.terminal.reject', 'No'),
			async () => true,
			async () => { this._state = OutputMonitorState.Cancelled; return false; }
		);

		return { promise: result.promise.then(p => p ?? false), part: result.part };
	}



	private async _assessOutputForErrors(buffer: string, token: CancellationToken): Promise<string | undefined> {
		const models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
		if (!models.length) {
			return 'No models available';
		}

		const response = await this._languageModelsService.sendChatRequest(
			models[0],
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
			return;
		}
		const models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
		if (!models.length) {
			return undefined;
		}
		const lastFiveLines = execution.getOutput(this._lastPromptMarker).trimEnd().split('\n').slice(-5).join('\n');
		const promptText =
			`Analyze the following terminal output. If it contains a prompt requesting user input (such as a confirmation, selection, or yes/no question) and that prompt has NOT already been answered, extract the prompt text. The prompt may ask to choose from a set. If so, extract the possible options as a JSON object with keys 'prompt', 'options' (an array of strings or an object with option to description mappings), and 'freeFormInput': false. If no options are provided, and free form input is requested, for example: Password:, return the word freeFormInput. For example, if the options are "[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [C] Cancel", the option to description mappings would be {"Y": "Yes", "A": "Yes to All", "N": "No", "L": "No to All", "C": "Cancel"}. If there is no such prompt, return null.
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

			Alternatively, the prompt may request free form input, for example:
			1. Output: "Enter your username:"
				Response: {"prompt": "Enter your username:", "freeFormInput": true, "options": []}
			2. Output: "Password:"
				Response: {"prompt": "Password:", "freeFormInput": true, "options": []}
			Now, analyze this output:
			${lastFiveLines}
			`;

		const response = await this._languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('core'), [{ role: ChatMessageRole.User, content: [{ type: 'text', value: promptText }] }], {}, token);
		const responseText = await getTextResponseFromStream(response);
		try {
			const match = responseText.match(/\{[\s\S]*\}/);
			if (match) {
				const obj = JSON.parse(match[0]) as unknown;
				if (
					isObject(obj) &&
					'prompt' in obj && isString(obj.prompt) &&
					'options' in obj &&
					'options' in obj &&
					'freeFormInput' in obj && typeof obj.freeFormInput === 'boolean'
				) {
					if (this._lastPrompt === obj.prompt) {
						return;
					}
					if (Array.isArray(obj.options) && obj.options.every(isString)) {
						return { prompt: obj.prompt, options: obj.options, detectedRequestForFreeFormInput: obj.freeFormInput };
					} else if (isObject(obj.options) && Object.values(obj.options).every(isString)) {
						return { prompt: obj.prompt, options: Object.keys(obj.options), descriptions: Object.values(obj.options), detectedRequestForFreeFormInput: obj.freeFormInput };
					}
				}
			}
		} catch (err) {
			console.error('Failed to parse confirmation prompt from language model response:', err);
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
		if (!suggestedOption) {
			return;
		}
		const parsed = suggestedOption.replace(/['"`]/g, '').trim();
		const index = confirmationPrompt.options.indexOf(parsed);
		const validOption = confirmationPrompt.options.find(opt => parsed === opt.replace(/['"`]/g, '').trim());
		if (!validOption || index === -1) {
			return;
		}
		let sentToTerminal = false;
		if (this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoReplyToPrompts)) {
			await this._execution.instance.sendText(validOption, true);
			this._outputMonitorTelemetryCounters.inputToolAutoAcceptCount++;
			this._outputMonitorTelemetryCounters.inputToolAutoChars += validOption?.length || 0;
			sentToTerminal = true;
		}
		const description = confirmationPrompt.descriptions?.[index];
		return description ? { suggestedOption: { description, option: validOption }, sentToTerminal } : { suggestedOption: validOption, sentToTerminal };
	}

	private async _requestFreeFormTerminalInput(token: CancellationToken, execution: IExecution, confirmationPrompt: IConfirmationPrompt): Promise<boolean> {
		const { promise: userPrompt, part } = this._createElicitationPart<boolean>(
			token,
			execution.sessionId,
			new MarkdownString(localize('poll.terminal.inputRequest', "The terminal is awaiting input.")),
			new MarkdownString(localize('poll.terminal.requireInput', "{0}\nPlease provide the required input to the terminal.\n\n", confirmationPrompt.prompt)),
			'',
			localize('poll.terminal.enterInput', 'Focus terminal'),
			undefined,
			async () => { execution.instance.focus(true); return true; },
		);

		this._register(autorun(reader => {
			if (part.isHidden?.read(reader)) {
				this._outputMonitorTelemetryCounters.inputToolFreeFormInputShownCount++;
			}
		}));

		const inputPromise = new Promise<boolean>(resolve => {
			const inputDataDisposable = this._register(execution.instance.onDidInputData((data) => {
				if (!data || data === '\r' || data === '\n' || data === '\r\n') {
					part.hide();
					part.dispose();
					inputDataDisposable.dispose();
					this._state = OutputMonitorState.PollingForIdle;
					resolve(true);
				}
			}));
		});

		const result = await Promise.race([userPrompt, inputPromise]);
		return !!result;
	}

	private async _confirmRunInTerminal(token: CancellationToken, suggestedOption: SuggestedOption, execution: IExecution, confirmationPrompt: IConfirmationPrompt): Promise<string | undefined> {
		const suggestedOptionValue = typeof suggestedOption === 'string' ? suggestedOption : suggestedOption.option;
		let inputDataDisposable = Disposable.None;
		const { promise: userPrompt, part } = this._createElicitationPart<string | undefined>(
			token,
			execution.sessionId,
			new MarkdownString(localize('poll.terminal.confirmRequired', "The terminal is awaiting input.")),
			new MarkdownString(localize('poll.terminal.confirmRunDetail', "{0}\n Do you want to send `{1}`{2} followed by `Enter` to the terminal?", confirmationPrompt.prompt, suggestedOptionValue, typeof suggestedOption === 'string' ? '' : suggestedOption.description ? ' (' + suggestedOption.description + ')' : '')),
			'',
			localize('poll.terminal.acceptRun', 'Allow'),
			localize('poll.terminal.rejectRun', 'Focus Terminal'),
			async (value: IAction | true) => {
				let option: string | undefined = undefined;
				if (value === true) {
					option = suggestedOptionValue;
				} else if (typeof value === 'object' && 'label' in value) {
					option = value.label.split(' (')[0];
				}
				this._outputMonitorTelemetryCounters.inputToolManualAcceptCount++;
				this._outputMonitorTelemetryCounters.inputToolManualChars += option?.length || 0;
				return option;
			},
			async () => {
				this._state = OutputMonitorState.Cancelled;
				this._outputMonitorTelemetryCounters.inputToolManualRejectCount++;
				inputDataDisposable.dispose();
				return undefined;
			},
			getMoreActions(suggestedOption, confirmationPrompt)
		);

		this._register(autorun(reader => {
			if (part.isHidden?.read(reader)) {
				this._outputMonitorTelemetryCounters.inputToolManualShownCount++;
			}
		}));
		const inputPromise = new Promise<string | undefined>(resolve => {
			inputDataDisposable = this._register(execution.instance.onDidInputData(() => {
				part.hide();
				part.dispose();
				inputDataDisposable.dispose();
				this._state = OutputMonitorState.PollingForIdle;
				resolve(undefined);
			}));
		});

		const optionToRun = await Promise.race([userPrompt, inputPromise]);
		if (optionToRun) {
			await execution.instance.sendText(optionToRun, true);
		}
		return optionToRun;
	}

	// Helper to create, register, and wire a ChatElicitationRequestPart. Returns the promise that
	// resolves when the part is accepted/rejected and the registered part itself so callers can
	// attach additional listeners (e.g., onDidRequestHide) or compose with other promises.
	private _createElicitationPart<T>(
		token: CancellationToken,
		sessionId: string,
		title: MarkdownString,
		detail: MarkdownString,
		subtitle: string,
		acceptLabel: string,
		rejectLabel?: string,
		onAccept?: (value: IAction | true) => Promise<T | undefined> | T | undefined,
		onReject?: () => Promise<T | undefined> | T | undefined,
		moreActions?: IAction[] | undefined
	): { promise: Promise<T | undefined>; part: ChatElicitationRequestPart } {
		const chatModel = this._chatService.getSession(sessionId);
		if (!(chatModel instanceof ChatModel)) {
			throw new Error('No model');
		}
		const request = chatModel.getRequests().at(-1);
		if (!request) {
			throw new Error('No request');
		}
		let part!: ChatElicitationRequestPart;
		const promise = new Promise<T | undefined>(resolve => {
			const thePart = part = this._register(new ChatElicitationRequestPart(
				title,
				detail,
				subtitle,
				acceptLabel,
				rejectLabel,
				async (value: IAction | true) => {
					thePart.state = 'accepted';
					thePart.hide();
					thePart.dispose();
					this._promptPart = undefined;
					try {
						const r = await (onAccept ? onAccept(value) : undefined);
						resolve(r as T | undefined);
					} catch {
						resolve(undefined);
					}
				},
				async () => {
					thePart.state = 'rejected';
					thePart.hide();
					thePart.dispose();
					this._promptPart = undefined;
					try {
						const r = await (onReject ? onReject() : undefined);
						resolve(r as T | undefined);
					} catch {
						resolve(undefined);
					}
				},
				undefined,
				moreActions
			));
			chatModel.acceptResponseProgress(request, thePart);
			this._promptPart = thePart;
		});

		this._register(token.onCancellationRequested(() => {
			part.hide();
			part.dispose();
		}));

		return { promise, part };
	}

}

function getMoreActions(suggestedOption: SuggestedOption, confirmationPrompt: IConfirmationPrompt): IAction[] | undefined {
	const moreActions: IAction[] = [];
	const moreOptions = confirmationPrompt.options.filter(a => a !== (typeof suggestedOption === 'string' ? suggestedOption : suggestedOption.option));
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
