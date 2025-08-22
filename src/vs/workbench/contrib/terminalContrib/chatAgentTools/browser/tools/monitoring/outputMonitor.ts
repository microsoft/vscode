/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../../base/common/async.js';
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
	readonly isIdle: boolean;

	readonly onDidFinishCommand: Event<void>;
	readonly onDidIdle: Event<void>;
	readonly onDidTimeout: Event<void>;

	readonly pollingResult: IPollingResult & { pollDurationMs: number } | undefined;

	startMonitoring(
		command: string,
		invocationContext: any,
		token: CancellationToken
	): Promise<void>;
}

export class OutputMonitor extends Disposable implements IOutputMonitor {
	private _isIdle = false;
	get isIdle(): boolean { return this._isIdle; }

	private _state: OutputMonitorState = OutputMonitorState.Initial;
	get state(): OutputMonitorState { return this._state; }

	private _lastAutoReply: string | undefined;

	private _pollingResult: IPollingResult & { pollDurationMs: number } | undefined;
	get pollingResult(): IPollingResult & { pollDurationMs: number } | undefined { return this._pollingResult; }

	private readonly _onDidFinishCommand = this._register(new Emitter<void>());
	readonly onDidFinishCommand = this._onDidFinishCommand.event;
	private readonly _onDidIdle = this._register(new Emitter<void>());
	readonly onDidIdle = this._onDidIdle.event;
	private readonly _onDidTimeout = this._register(new Emitter<void>());
	readonly onDidTimeout = this._onDidTimeout.event;

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
		this.startMonitoring(command, invocationContext, token);
	}

	async startMonitoring(
		command: string,
		invocationContext: IToolInvocationContext,
		token: CancellationToken
	): Promise<void> {

		const pollStartTime = Date.now();
		let extended = false;
		let autoReplyCount = 0;
		let lastObservedLength = this._execution.getOutput().length;

		while (!token.isCancellationRequested) {
			const polled = await this._pollOnce(this._execution, extended, token, this._pollFn);

			this._isIdle = polled.state === OutputMonitorState.Idle;
			this._state = polled.state;

			if (this._state === OutputMonitorState.Idle) {
				this._onDidIdle.fire();
			} else if (this._state === OutputMonitorState.Timeout) {
				this._onDidTimeout.fire();
			}

			// If we timed out, optionally ask to keep waiting
			if (this._state === OutputMonitorState.Timeout) {
				const { promise: continueP, part } = await this._promptForMorePolling(command, token, invocationContext);
				let continuePolling = false;
				try {
					continuePolling = await continueP;
				} finally {
					part?.hide();
					part?.dispose?.();
				}
				if (!continuePolling) {
					this._pollingResult = { ...polled, pollDurationMs: Date.now() - pollStartTime, autoReplyCount };
					break;
				}
				extended = true;
				// small backoff so we do not instantly loop on the same timeout condition
				await timeout(PollingConsts.MinPollingDuration, token);
				continue;
			}

			// If cancelled, we are done
			if (this._state === OutputMonitorState.Cancelled) {
				this._pollingResult = { ...polled, pollDurationMs: Date.now() - pollStartTime, autoReplyCount };
				break;
			}

			if (this._state === OutputMonitorState.Idle) {
				// Assess last output for a pending user prompt we can safely answer
				const confirmationPrompt = await this._determineUserInputOptions(this._execution, token);
				const selectedOption = await this._selectAndHandleOption(confirmationPrompt, token);

				if (selectedOption) {
					const confirmed = await this._confirmRunInTerminal(selectedOption, this._execution);
					if (confirmed) {
						autoReplyCount++;
						// Wait for new data before re-polling to avoid evaluating the same idle event
						const changed = await this._waitForNextDataOrActivityChange(this._execution, lastObservedLength, token);
						lastObservedLength = this._execution.getOutput().length;
						// if nothing changed, return what we have
						if (!changed) {
							this._pollingResult = { ...polled, pollDurationMs: Date.now() - pollStartTime, autoReplyCount };
							break;
						}
						// loop again to poll with extended window
						continue;
					}
				}
			}

		}

		if (!this._pollingResult) {
			// Cancellation exit
			this._state = OutputMonitorState.Cancelled;
			this._pollingResult = {
				state: this._state,
				output: this._execution.getOutput(),
				modelOutputEvalResponse: 'Cancelled',
				pollDurationMs: Date.now() - pollStartTime,
				autoReplyCount: 0
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
	private async _waitForNextDataOrActivityChange(
		execution: IExecution,
		lastLength: number,
		token: CancellationToken
	): Promise<boolean> {
		const maxMs = Math.max(PollingConsts.MinPollingDuration * 2, 250);
		const stepMs = Math.max(PollingConsts.MinPollingDuration / 2, 50);
		let waited = 0;

		const initialActive = execution.isActive ? await execution.isActive() : undefined;

		while (!token.isCancellationRequested && waited < maxMs) {
			await timeout(stepMs, token);
			waited += stepMs;

			const len = execution.getOutput().length;
			if (len !== lastLength) {
				return true;
			}
			if (execution.isActive) {
				const nowActive = await execution.isActive();
				if (nowActive !== initialActive) {
					return true;
				}
			}
		}
		return false;
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
		} catch { }
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
