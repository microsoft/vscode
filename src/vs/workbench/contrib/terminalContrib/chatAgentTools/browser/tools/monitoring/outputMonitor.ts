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
import { PollingConsts } from '../../bufferOutputPolling.js';
import { IPollingResult, OutputMonitorState, IExecution, IRacePollingOrPromptResult, IConfirmationPrompt } from './types.js';
import { getTextResponseFromStream } from './utils.js';
import { IChatWidgetService } from '../../../../../chat/browser/chat.js';
import { ChatAgentLocation } from '../../../../../chat/common/constants.js';

export interface IOutputMonitor extends Disposable {
	readonly isIdle: boolean;

	readonly onDidFinishCommand: Event<void>;
	readonly onDidIdle: Event<void>;
	readonly onDidTimeout: Event<void>;

	startMonitoring(
		command: string,
		invocationContext: any,
		token: CancellationToken
	): Promise<IPollingResult>;
}

export class OutputMonitor extends Disposable implements IOutputMonitor {
	private _isIdle = false;
	get isIdle(): boolean { return this._isIdle; }

	private _state: OutputMonitorState = OutputMonitorState.Initial;
	get state(): OutputMonitorState { return this._state; }

	private _lastOptionRan: string | undefined;

	private readonly _onDidFinishCommand = this._register(new Emitter<void>());
	readonly onDidFinishCommand = this._onDidFinishCommand.event;
	private readonly _onDidIdle = this._register(new Emitter<void>());
	readonly onDidIdle = this._onDidIdle.event;
	private readonly _onDidTimeout = this._register(new Emitter<void>());
	readonly onDidTimeout = this._onDidTimeout.event;

	constructor(
		private readonly _execution: IExecution,
		private readonly _pollFn: ((execution: IExecution, token: CancellationToken, taskService: ITaskService) => Promise<IPollingResult | undefined>) | undefined,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ITaskService private readonly _taskService: ITaskService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService
	) {
		super();
	}

	async startMonitoring(
		command: string,
		invocationContext: any,
		token: CancellationToken
	): Promise<IPollingResult & { pollDurationMs: number }> {

		const pollStartTime = Date.now();

		let result = await this._pollForOutputAndIdle(this._execution, false, token, this._pollFn);

		if (this._state === OutputMonitorState.Timeout) {
			result = await this._racePollingOrPrompt(
				() => this._pollForOutputAndIdle(this._execution, true, token, this._pollFn),
				() => this._promptForMorePolling(command, token, invocationContext),
				result,
			);
		}

		return { ...result, pollDurationMs: Date.now() - pollStartTime };
	}

	/**
	 * Waits for either polling to complete (terminal idle or timeout) or for the user to respond to a prompt.
	 * If polling completes first, the prompt is removed. If the prompt completes first and is accepted, polling continues.
	 */
	private async _racePollingOrPrompt(
		pollFn: () => Promise<IRacePollingOrPromptResult>,
		promptFn: () => Promise<{ promise: Promise<boolean>; part?: Pick<ChatElicitationRequestPart, 'hide' | 'dispose'> }>,
		originalResult: IPollingResult,
	): Promise<IRacePollingOrPromptResult> {
		type Winner =
			| { kind: 'poll'; result: IRacePollingOrPromptResult }
			| { kind: 'prompt'; continuePolling: boolean };

		const { promise: promptP, part } = await promptFn();

		const pollPromise = pollFn().then<Winner>(result => ({ kind: 'poll', result }));
		const promptPromise = promptP.then<Winner>(continuePolling => ({ kind: 'prompt', continuePolling }));

		let winner: Winner;
		try {
			winner = await Promise.race([pollPromise, promptPromise]);
		} finally {
			part?.hide();
			part?.dispose?.();
		}

		if (winner.kind === 'poll') {
			return winner.result;
		}

		if (winner.kind === 'prompt' && !winner.continuePolling) {
			this._state = OutputMonitorState.Cancelled;
			return { ...originalResult, state: this._state };
		}
		return await pollFn();
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
						new MarkdownString(localize('poll.terminal.waiting', "Continue waiting for \`{0}\`?", command)),
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

	private async _pollForOutputAndIdle(
		execution: IExecution,
		extendedPolling: boolean,
		token: CancellationToken,
		pollFn?: (execution: IExecution, token: CancellationToken, taskService: ITaskService) => Promise<IPollingResult | undefined> | undefined,
		recursionDepth: number = 0
	): Promise<IPollingResult> {
		this._state = OutputMonitorState.Polling;
		const maxWaitMs = extendedPolling ? PollingConsts.ExtendedPollingMaxDuration : PollingConsts.FirstPollingMaxDuration;
		const maxInterval = PollingConsts.MaxPollingIntervalDuration;
		let currentInterval = PollingConsts.MinPollingDuration;

		let lastBufferLength = 0;
		let noNewDataCount = 0;
		let buffer = '';

		let pollDuration = 0;
		while (true) {
			if (token.isCancellationRequested) {
				this._state = OutputMonitorState.Cancelled;
				return { output: buffer, state: this._state };
			}

			if (pollDuration >= maxWaitMs) {
				this._state = OutputMonitorState.Timeout;
				break;
			}

			const waitTime = Math.min(currentInterval, maxWaitMs - pollDuration);
			await timeout(waitTime, token);
			pollDuration += waitTime;

			currentInterval = Math.min(currentInterval * 2, maxInterval);

			buffer = execution.getOutput();
			const currentBufferLength = buffer.length;

			if (currentBufferLength === lastBufferLength) {
				noNewDataCount++;
			} else {
				noNewDataCount = 0;
				lastBufferLength = currentBufferLength;
			}

			const isInactive = execution.isActive && ((await execution.isActive()) === false);
			const isActive = execution.isActive && ((await execution.isActive()) === true);
			const noNewData = noNewDataCount >= PollingConsts.MinNoDataEvents;

			if (noNewData || isInactive) {
				this._state = OutputMonitorState.Idle;
				break;
			}
			if (noNewData && isActive) {
				noNewDataCount = 0;
				lastBufferLength = currentBufferLength;
				continue;
			}
		}

		const customPollingResult = await pollFn?.(execution, token, this._taskService);
		if (customPollingResult) {
			return customPollingResult;
		}
		const modelOutputEvalResponse = await this._assessOutputForErrors(buffer, token);
		const confirmationPrompt = await this._determineUserInputOptions(execution, token);
		const executedOption = await this._selectAndRunOptionInTerminal(confirmationPrompt, execution, token);
		if (executedOption) {
			if (recursionDepth >= PollingConsts.MaxRecursionCount) {
				return { state: OutputMonitorState.Timeout, modelOutputEvalResponse, output: buffer };
			}
			return this._pollForOutputAndIdle(execution, true, token, pollFn, recursionDepth + 1);
		}
		return { state: this._state, modelOutputEvalResponse, output: buffer, autoReplyCount: recursionDepth };
	}


	private async _assessOutputForErrors(buffer: string, token: CancellationToken): Promise<string> {
		const models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
		if (!models.length) {
			return 'No models available';
		}

		const response = await this._languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [{ role: ChatMessageRole.User, content: [{ type: 'text', value: `Evaluate this terminal output to determine if there were errors or if the command ran successfully: ${buffer}.` }] }], {}, token);

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
		const response = await this._languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [
			{ role: ChatMessageRole.User, content: [{ type: 'text', value: promptText }] }
		], {}, token);

		const responseText = await getTextResponseFromStream(response);
		try {
			const match = responseText.match(/\{[\s\S]*\}/);
			if (match) {
				const obj = JSON.parse(match[0]);
				if (obj && typeof obj.prompt === 'string' && Array.isArray(obj.options)) {
					return obj;
				}
			}
		} catch {
		}
		return undefined;
	}

	private async _selectAndRunOptionInTerminal(
		confirmationPrompt: IConfirmationPrompt | undefined,
		execution: IExecution,
		token: CancellationToken,
	): Promise<string | undefined> {
		if (!confirmationPrompt?.options.length) {
			return Promise.resolve(undefined);
		}
		const model = this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Panel)[0]?.input.currentLanguageModel;
		const models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', id: model });
		if (!models.length) {
			return Promise.resolve(undefined);
		}
		const sanitizedPrompt = confirmationPrompt.prompt;
		const sanitizedOptions = confirmationPrompt.options.map(opt => opt);
		const promptText = `Given the following confirmation prompt and options from a terminal output, which option should be selected to proceed safely and correctly?\nPrompt: "${sanitizedPrompt}"\nOptions: ${JSON.stringify(sanitizedOptions)}\nRespond with only the option string.`;
		const response = await this._languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [
			{ role: ChatMessageRole.User, content: [{ type: 'text', value: promptText }] }
		], {}, token);

		const selectedOption = (await getTextResponseFromStream(response)).trim();
		if (selectedOption) {
			// Validate that the selectedOption matches one of the original options
			const validOption = confirmationPrompt.options.find(opt => selectedOption.replace(/['"`]/g, '').trim() === opt.replace(/['"`]/g, '').trim());
			if (selectedOption && validOption && validOption !== this._lastOptionRan) {
				await execution.instance.sendText(validOption, true);
				this._lastOptionRan = validOption;
				return Promise.resolve(validOption);
			}
		}
		return Promise.resolve(undefined);
	}
}
