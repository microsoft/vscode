/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout, timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { ChatElicitationRequestPart } from '../../../../../chat/browser/chatElicitationRequestPart.js';
import { ChatModel } from '../../../../../chat/common/chatModel.js';
import { IChatService } from '../../../../../chat/common/chatService.js';
import { ILanguageModelsService, ChatMessageRole } from '../../../../../chat/common/languageModels.js';
import { IToolInvocationContext } from '../../../../../chat/common/languageModelToolsService.js';
import { ITaskService } from '../../../../../tasks/common/taskService.js';
import { IPollingResult, OutputMonitorState, IExecution, IConfirmationPrompt, PollingConsts } from './types.js';
import { getTextResponseFromStream } from './utils.js';
import { IChatWidgetService } from '../../../../../chat/browser/chat.js';
import { ChatAgentLocation } from '../../../../../chat/common/constants.js';
import { isObject, isString } from '../../../../../../../base/common/types.js';

export interface IOutputMonitor extends Disposable {
	readonly pollingResult: IPollingResult & { pollDurationMs: number } | undefined;
	readonly outputMonitorTelemetryCounters: IOutputMonitorTelemetryCounters;

	readonly onDidFinishCommand: Event<void>;
}

export interface IOutputMonitorTelemetryCounters {
	inputToolManualAcceptCount: number;
	inputToolManualRejectCount: number;
	inputToolManualChars: number;
}

export class OutputMonitor extends Disposable implements IOutputMonitor {
	private _state: OutputMonitorState = OutputMonitorState.Initial;
	get state(): OutputMonitorState { return this._state; }

	private _lastAutoReply: string | undefined;

	private _pollingResult: IPollingResult & { pollDurationMs: number } | undefined;
	get pollingResult(): IPollingResult & { pollDurationMs: number } | undefined { return this._pollingResult; }

	private readonly _outputMonitorTelemetryCounters: IOutputMonitorTelemetryCounters = {
		inputToolManualAcceptCount: 0,
		inputToolManualRejectCount: 0,
		inputToolManualChars: 0
	};
	get outputMonitorTelemetryCounters(): Readonly<IOutputMonitorTelemetryCounters> { return this._outputMonitorTelemetryCounters; }

	private readonly _onDidFinishCommand = this._register(new Emitter<void>());
	readonly onDidFinishCommand = this._onDidFinishCommand.event;

	constructor(
		private readonly _execution: IExecution,
		private readonly _pollFn: ((execution: IExecution, token: CancellationToken, taskService: ITaskService) => Promise<IPollingResult | undefined>) | undefined,
		invocationContext: IToolInvocationContext,
		token: CancellationToken,
		command: string,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ITaskService private readonly _taskService: ITaskService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService
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
		let extended = false;

		// Hold a single pending "continue?" prompt across timeout passes
		let continuePollingDecisionP: Promise<boolean> | undefined;
		let continuePollingPart: ChatElicitationRequestPart | undefined;

		while (!token.isCancellationRequested) {
			const polled = await this._pollOnce(this._execution, extended, token, this._pollFn);

			this._state = polled.state;

			switch (this._state) {
				case OutputMonitorState.Timeout: {
					// Create the prompt once; keep it open while we keep polling.
					if (!continuePollingDecisionP) {
						const { promise: p, part } = await this._promptForMorePolling(command, token, invocationContext);
						continuePollingDecisionP = p;
						continuePollingPart = part;
					}

					// Always use extended polling while a timeout prompt is visible
					extended = true;

					// Start another polling pass and race it against the user's decision
					const nextPollP = this._pollOnce(this._execution, /*extendedPolling*/ true, token, this._pollFn)
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
							this._pollingResult = { ...polled, pollDurationMs: Date.now() - pollStartTime };
							break;
						}

						// User accepted; keep polling (the loop iterates again).
						// Clear the decision so we don't race on a resolved promise.
						continuePollingDecisionP = undefined;
						continue;
					} else {
						// A background poll completed while waiting for a decision
						const r = race.r;
						this._state = r.state;

						if (r.state === OutputMonitorState.Idle || r.state === OutputMonitorState.Cancelled) {
							try { continuePollingPart?.hide(); continuePollingPart?.dispose?.(); } catch { /* noop */ }
							continuePollingPart = undefined;
							continuePollingDecisionP = undefined;

							this._pollingResult = { ...r, pollDurationMs: Date.now() - pollStartTime };
							break;
						}

						// Still timing out; loop and race again with the same prompt.
						continue;
					}
				}
				case OutputMonitorState.Cancelled:
					this._pollingResult = { ...polled, pollDurationMs: Date.now() - pollStartTime };
					break;
				case OutputMonitorState.Idle: {
					const confirmationPrompt = await this._determineUserInputOptions(this._execution, token);
					const selectedOption = await this._selectAndHandleOption(confirmationPrompt, token);

					if (selectedOption) {
						const confirmed = await this._confirmRunInTerminal(selectedOption, this._execution);
						if (confirmed) {
							const changed = await this._waitForNextDataOrActivityChange();
							if (!changed) {
								this._pollingResult = { ...polled, pollDurationMs: Date.now() - pollStartTime };
								break;
							} else {
								continue;
							}
						}
					}

					this._pollingResult = { ...polled, pollDurationMs: Date.now() - pollStartTime };
					break;
				}
			}
			if (this._state === OutputMonitorState.Idle || this._state === OutputMonitorState.Cancelled || this._state === OutputMonitorState.Timeout) {
				break;
			}
		}

		if (!this._pollingResult && token.isCancellationRequested) {
			this._state = OutputMonitorState.Cancelled;
			this._pollingResult = {
				state: this._state,
				output: this._execution.getOutput(),
				modelOutputEvalResponse: 'Cancelled',
				pollDurationMs: Date.now() - pollStartTime,
			};
		}

		this._onDidFinishCommand.fire();
	}


	/**
	 * Single bounded polling pass that returns when:
	 *  - terminal becomes inactive/idle, or
	 *  - timeout window elapses.
	 */
	private async _pollOnce(
		execution: IExecution,
		extendedPolling: boolean,
		token: CancellationToken,
		pollFn?: (execution: IExecution, token: CancellationToken, taskService: ITaskService) => Promise<IPollingResult | undefined>
	): Promise<IPollingResult> {
		this._state = OutputMonitorState.Polling;

		const maxWaitMs = extendedPolling ? PollingConsts.ExtendedPollingMaxDuration : PollingConsts.FirstPollingMaxDuration;
		const maxInterval = PollingConsts.MaxPollingIntervalDuration;
		let currentInterval = PollingConsts.MinPollingDuration;

		let lastBufferLength = execution.getOutput().length;
		let noNewDataCount = 0;
		let buffer = '';
		let waited = 0;

		while (!token.isCancellationRequested && waited < maxWaitMs) {
			const waitTime = Math.min(currentInterval, maxWaitMs - waited);
			await timeout(waitTime, token);
			waited += waitTime;
			currentInterval = Math.min(currentInterval * 2, maxInterval);

			buffer = execution.getOutput();
			const len = buffer.length;

			if (len === lastBufferLength) {
				noNewDataCount++;
			} else {
				noNewDataCount = 0;
				lastBufferLength = len;
			}

			const noNewData = noNewDataCount >= PollingConsts.MinNoDataEvents;
			const isActive = execution.isActive ? await execution.isActive() : undefined;

			// Became inactive or no new data for a while → idle
			if (noNewData || isActive === false) {
				this._state = OutputMonitorState.Idle;
				break;
			}

			// Still active but with a no-new-data, so reset counters and keep going
			if (noNewData && isActive === true) {
				noNewDataCount = 0;
				lastBufferLength = len;
			}
		}

		if (token.isCancellationRequested) {
			this._state = OutputMonitorState.Cancelled;
		} else if (this._state === OutputMonitorState.Polling) {
			this._state = OutputMonitorState.Timeout;
		}

		// Let custom poller override if provided
		const custom = await pollFn?.(execution, token, this._taskService);
		if (custom) {
			return custom;
		}

		const modelOutputEvalResponse = await this._assessOutputForErrors(buffer, token);
		return { output: buffer, state: this._state, modelOutputEvalResponse };
	}

	/**
	 * Waits for any change in output length or activity flip, up to a short cap.
	 * This prevents immediately re-evaluating the same idle snapshot after sending input.
	 */
	private async _waitForNextDataOrActivityChange(): Promise<boolean> {
		const maxMs = Math.max(PollingConsts.MinPollingDuration * 2, 250);
		return await raceTimeout(
			Event.toPromise(this._execution.instance.onData).then(() => true),
			maxMs,
			() => false
		) ?? false;
	}
	private async _promptForMorePolling(command: string, token: CancellationToken, context: IToolInvocationContext): Promise<{ promise: Promise<boolean>; part?: ChatElicitationRequestPart }> {
		if (token.isCancellationRequested || this._state === OutputMonitorState.Cancelled) {
			return { promise: Promise.resolve(false) };
		}
		this._state = OutputMonitorState.Prompting;
		const chatModel = this._chatService.getSession(context.sessionId);
		if (chatModel instanceof ChatModel) {
			const request = chatModel.getRequests().at(-1);
			if (request) {
				let part: ChatElicitationRequestPart | undefined = undefined;
				const promise = new Promise<boolean>(resolve => {
					const thePart = part = this._register(new ChatElicitationRequestPart(
						new MarkdownString(localize('poll.terminal.waiting', "Continue waiting for `{0}`?", command)),
						new MarkdownString(localize('poll.terminal.polling', "This will continue to poll for output to determine when the terminal becomes idle for up to 2 minutes.")),
						'',
						localize('poll.terminal.accept', 'Yes'),
						localize('poll.terminal.reject', 'No'),
						async () => {
							thePart.state = 'accepted';
							thePart.hide();
							thePart.dispose();
							resolve(true);
						},
						async () => {
							thePart.state = 'rejected';
							thePart.hide();
							this._state = OutputMonitorState.Cancelled;
							resolve(false);
						}
					));
					chatModel.acceptResponseProgress(request, thePart);
				});

				return { promise, part };
			}
		}
		return { promise: Promise.resolve(false) };
	}

	private async _assessOutputForErrors(buffer: string, token: CancellationToken): Promise<string> {
		const models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
		if (!models.length) {
			return 'No models available';
		}

		const response = await this._languageModelsService.sendChatRequest(
			models[0],
			new ExtensionIdentifier('core'),
			[{ role: ChatMessageRole.User, content: [{ type: 'text', value: `Evaluate this terminal output to determine if there were errors or if the command ran successfully: ${buffer}.` }] }],
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
		const lastFiveLines = execution.getOutput().trimEnd().split('\n').slice(-5).join('\n');
		const promptText =
			`Analyze the following terminal output. If it contains a prompt requesting user input (such as a confirmation, selection, or yes/no question) and that prompt has NOT already been answered, extract the prompt text and the possible options as a JSON object with keys 'prompt' and 'options' (an array of strings). If there is no such prompt, return null.
			Examples:
			1. Output: "Do you want to overwrite? (y/n)"
				Response: {"prompt": "Do you want to overwrite?", "options": ["y", "n"]}

			2. Output: "Confirm: [Y] Yes  [A] Yes to All  [N] No  [L] No to All  [C] Cancel"
				Response: {"prompt": "Confirm", "options": ["Y", "A", "N", "L", "C"]}

			3. Output: "Accept license terms? (yes/no)"
				Response: {"prompt": "Accept license terms?", "options": ["yes", "no"]}

			4. Output: "Press Enter to continue"
				Response: {"prompt": "Press Enter to continue", "options": ["Enter"]}

			5. Output: "Type Yes to proceed"
				Response: {"prompt": "Type Yes to proceed", "options": ["Yes"]}

			6. Output: "Continue [y/N]"
				Response: {"prompt": "Continue", "options": ["y", "N"]}

			Now, analyze this output:
			${lastFiveLines}
			`;
		const response = await this._languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('core'), [
			{ role: ChatMessageRole.User, content: [{ type: 'text', value: promptText }] }
		], {}, token);

		const responseText = await getTextResponseFromStream(response);
		try {
			const match = responseText.match(/\{[\s\S]*\}/);
			if (match) {
				const obj = JSON.parse(match[0]) as unknown;
				if (
					isObject(obj) &&
					'prompt' in obj && isString(obj.prompt) &&
					'options' in obj && Array.isArray(obj.options) &&
					obj.options.every(isString)
				) {
					return { prompt: obj.prompt, options: obj.options };
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
	): Promise<string | undefined> {
		if (!confirmationPrompt?.options.length) {
			return undefined;
		}
		const model = this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Panel)[0]?.input.currentLanguageModel;
		if (!model) {
			return undefined;
		}

		const models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', family: model.replaceAll('copilot/', '') });
		if (!models.length) {
			return undefined;
		}
		const prompt = confirmationPrompt.prompt;
		const options = confirmationPrompt.options.map(opt => opt);
		const promptText = `Given the following confirmation prompt and options from a terminal output, which option should be selected to proceed safely and correctly?\nPrompt: "${prompt}"\nOptions: ${JSON.stringify(options)}\nRespond with only the option string.`;
		const response = await this._languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('core'), [
			{ role: ChatMessageRole.User, content: [{ type: 'text', value: promptText }] }
		], {}, token);

		const selectedOption = (await getTextResponseFromStream(response)).trim();
		if (selectedOption) {
			const validOption = confirmationPrompt.options.find(opt => selectedOption.replace(/['"`]/g, '').trim() === opt.replace(/['"`]/g, '').trim());
			if (validOption && validOption !== this._lastAutoReply) {
				return validOption;
			}
		}
		return undefined;
	}

	private async _confirmRunInTerminal(selectedOption: string, execution: IExecution): Promise<boolean> {
		const chatModel = this._chatService.getSession(execution.sessionId);
		if (chatModel instanceof ChatModel) {
			const request = chatModel.getRequests().at(-1);
			if (request) {
				const userPrompt = new Promise<boolean>(resolve => {
					const thePart = this._register(new ChatElicitationRequestPart(
						new MarkdownString(localize('poll.terminal.confirmRun', "Run `{0}` in the terminal?", selectedOption)),
						new MarkdownString(localize('poll.terminal.confirmRunDetail', "The terminal output appears to require a response. Do you want to send `{0}` to the terminal?", selectedOption)),
						'',
						localize('poll.terminal.acceptRun', 'Yes'),
						localize('poll.terminal.rejectRun', 'No'),
						async () => {
							thePart.state = 'accepted';
							thePart.hide();
							thePart.dispose();
							// Track manual acceptance
							this._outputMonitorTelemetryCounters.inputToolManualAcceptCount++;
							this._outputMonitorTelemetryCounters.inputToolManualChars += selectedOption.length;
							resolve(true);
						},
						async () => {
							thePart.state = 'rejected';
							thePart.hide();
							this._state = OutputMonitorState.Cancelled;
							// Track manual rejection
							this._outputMonitorTelemetryCounters.inputToolManualRejectCount++;
							resolve(false);
						}
					));
					chatModel.acceptResponseProgress(request, thePart);
				});

				const shouldRun = await userPrompt;
				if (shouldRun) {
					this._lastAutoReply = selectedOption;
					await execution.instance.sendText(selectedOption, true);
				}
				return shouldRun;
			}
		}
		return false;
	}
}
