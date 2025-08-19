/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITaskService, Task } from '../../../tasks/common/taskService.js';
import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { ILinkLocation } from './taskHelpers.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { ChatElicitationRequestPart } from '../../../chat/browser/chatElicitationRequestPart.js';
import { ChatModel } from '../../../chat/common/chatModel.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { ChatMessageRole, ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { IToolInvocationContext } from '../../../chat/common/languageModelToolsService.js';
import { IRacePollingOrPromptResult, IPollingResult, IExecution, IConfirmationPrompt, PollingConsts } from './bufferOutputPollingTypes.js';
import { getResponseFromStream } from './tools/pollingUtils.js';
import { timeout } from '../../../../../base/common/async.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';

export interface IOutputMonitor extends Disposable {
	readonly isIdle: boolean;

	readonly onDidFinishCommand: Event<void>;
	readonly onDidIdle: Event<void>;
	readonly onDidTimeout: Event<void>;

	startMonitoring(
		chatService: IChatService,
		command: string,
		invocationContext: any,
		token: CancellationToken
	): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }>;
}

export class OutputMonitor extends Disposable implements IOutputMonitor {
	private _isIdle = false;

	private readonly _onDidFinishCommand = this._register(new Emitter<void>());
	readonly onDidFinishCommand = this._onDidFinishCommand.event;
	private readonly _onDidIdle = this._register(new Emitter<void>());
	readonly onDidIdle = this._onDidIdle.event;
	private readonly _onDidTimeout = this._register(new Emitter<void>());
	readonly onDidTimeout = this._onDidTimeout.event;

	get isIdle(): boolean {
		return this._isIdle;
	}

	constructor(
		private readonly _execution: { getOutput: () => string; isActive?: () => Promise<boolean>; task?: Task; beginsPattern?: string; endsPattern?: string; dependencyTasks?: Task[]; terminal: Pick<ITerminalInstance, 'instanceId' | 'sendText'> },
		@ILanguageModelsService private readonly _languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>,
		@ITaskService private readonly _taskService: ITaskService,
		private readonly _pollFn?: (execution: IExecution, token: CancellationToken, terminalExecutionIdleBeforeTimeout: boolean, pollStartTime: number, extendedPolling: boolean, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>, taskService: ITaskService) => Promise<IPollingResult | undefined> | undefined,
	) {
		super();
	}

	async startMonitoring(
		chatService: IChatService,
		command: string,
		invocationContext: any,
		token: CancellationToken
	): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string; resources?: ILinkLocation[] }> {
		let result = await this._pollForOutputAndIdle(this._execution, false, token, this._languageModelsService, this._taskService, this._pollFn);

		if (!result.terminalExecutionIdleBeforeTimeout) {
			result = await this._racePollingOrPrompt(
				() => this._pollForOutputAndIdle(this._execution, true, token, this._languageModelsService, this._taskService, this._pollFn),
				() => this._promptForMorePolling(command, token, invocationContext, chatService),
				result,
				token,
				this._languageModelsService,
				this._taskService,
				this._execution
			);
		}

		return result;
	}

	/**
	 * Waits for either polling to complete (terminal idle or timeout) or for the user to respond to a prompt.
	 * If polling completes first, the prompt is removed. If the prompt completes first and is accepted, polling continues.
	 */
	private async _racePollingOrPrompt(
		pollFn: () => Promise<IRacePollingOrPromptResult>,
		promptFn: () => Promise<{ promise: Promise<boolean>; part?: Pick<ChatElicitationRequestPart, 'hide' | 'onDidRequestHide' | 'dispose'> }>,
		originalResult: IPollingResult,
		token: CancellationToken,
		languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>,
		taskService: ITaskService,
		execution: IExecution
	): Promise<IRacePollingOrPromptResult> {
		const pollPromise = pollFn();
		const { promise: promptPromise } = await promptFn();

		const pollPromiseWrapped = pollPromise.then(async result => {
			return { type: 'poll', result };
		});

		const promptPromiseWrapped = promptPromise.then(result => {
			return { type: 'prompt', result };
		});
		const raceResult = await Promise.race([
			pollPromiseWrapped,
			promptPromiseWrapped
		]);
		if (raceResult.type === 'poll') {
			return raceResult.result as IRacePollingOrPromptResult;
		} else if (raceResult.type === 'prompt') {
			const promptResult = raceResult.result as boolean;
			if (promptResult) {
				return await this._pollForOutputAndIdle(execution, true, token, languageModelsService, taskService, pollFn);
			} else {
				return originalResult;
			}
		}
		return await pollFn();
	}


	private async _promptForMorePolling(command: string, token: CancellationToken, context: IToolInvocationContext, chatService: IChatService): Promise<{ promise: Promise<boolean>; part?: ChatElicitationRequestPart }> {
		if (token.isCancellationRequested) {
			return { promise: Promise.resolve(false) };
		}
		const chatModel = chatService.getSession(context.sessionId);
		if (chatModel instanceof ChatModel) {
			const request = chatModel.getRequests().at(-1);
			if (request) {
				let part: ChatElicitationRequestPart | undefined = undefined;
				const promise = new Promise<boolean>(resolve => {
					const thePart = part = new ChatElicitationRequestPart(
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
							resolve(true);
						}
					);
					this._register(thePart);
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
		languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>,
		taskService: ITaskService,
		pollFn?: (execution: IExecution, token: CancellationToken, terminalExecutionIdleBeforeTimeout: boolean, pollStartTime: number, extendedPolling: boolean, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>, taskService: ITaskService) => Promise<IPollingResult | undefined> | undefined
	): Promise<IPollingResult> {
		const maxWaitMs = extendedPolling ? PollingConsts.ExtendedPollingMaxDuration : PollingConsts.FirstPollingMaxDuration;
		const maxInterval = PollingConsts.MaxPollingIntervalDuration;
		let currentInterval = PollingConsts.MinPollingDuration;
		const pollStartTime = Date.now();

		let lastBufferLength = 0;
		let noNewDataCount = 0;
		let buffer = '';
		let terminalExecutionIdleBeforeTimeout = false;

		while (true) {
			if (token.isCancellationRequested) {
				break;
			}
			const now = Date.now();
			const elapsed = now - pollStartTime;
			const timeLeft = maxWaitMs - elapsed;

			if (timeLeft <= 0) {
				break;
			}

			// Cap the wait so we never overshoot timeLeft
			const waitTime = Math.min(currentInterval, timeLeft);
			await timeout(waitTime, token);

			// Check again immediately after waking
			if (Date.now() - pollStartTime >= maxWaitMs) {
				break;
			}

			currentInterval = Math.min(currentInterval * 2, maxInterval);

			buffer = execution.getOutput();
			const currentBufferLength = buffer.length;

			if (currentBufferLength === lastBufferLength) {
				noNewDataCount++;
			} else {
				noNewDataCount = 0;
				lastBufferLength = currentBufferLength;
			}

			if (noNewDataCount >= PollingConsts.MinNoDataEvents) {
				if (execution.isActive && ((await execution.isActive()) === true)) {
					noNewDataCount = 0;
					lastBufferLength = currentBufferLength;
					continue;
				}
			}
		}
		terminalExecutionIdleBeforeTimeout = true;
		if (pollFn) {
			const customPollingResult = await pollFn?.(execution, token, terminalExecutionIdleBeforeTimeout, pollStartTime, extendedPolling, languageModelsService, taskService);
			if (customPollingResult) {
				return customPollingResult;
			}
		}
		const confirmationPrompt = await this._detectConfirmationPromptWithLLM(execution, token, languageModelsService);
		const handled = await this._handleConfirmationPrompt(confirmationPrompt, execution, token, languageModelsService);
		if (handled) {
			if (typeof handled === 'boolean' && handled) {
				// Something was sent to the terminal, poll again
				return this._pollForOutputAndIdle(execution, true, token, languageModelsService, taskService, pollFn);
			} else {
				return handled;
			}
		}
		const modelOutputEvalResponse = await this._assessOutputForErrors(buffer, token, languageModelsService);
		return { modelOutputEvalResponse, terminalExecutionIdleBeforeTimeout, output: buffer, pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
	}


	private async _assessOutputForErrors(buffer: string, token: CancellationToken, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>): Promise<string> {
		const models = await languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
		if (!models.length) {
			return 'No models available';
		}

		const response = await languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [{ role: ChatMessageRole.User, content: [{ type: 'text', value: `Evaluate this terminal output to determine if there were errors or if the command ran successfully: ${buffer}.` }] }], {}, token);

		try {
			const responseFromStream = getResponseFromStream(response);
			await Promise.all([response.result, responseFromStream]);
			return response.result;
		} catch (err) {
			return 'Error occurred ' + err;
		}
	}

	private async _detectConfirmationPromptWithLLM(execution: IExecution, token: CancellationToken, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>): Promise<IConfirmationPrompt | undefined> {
		if (token.isCancellationRequested) {
			return;
		}
		const models = await languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
		if (!models.length) {
			return undefined;
		}
		const lastLine = execution.getOutput().trimEnd().split('\n').slice(-5).join('\n');
		const sanitizedLastLine = sanitizeForPrompt(lastLine);
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
			${sanitizedLastLine}
			`;
		const response = await languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [
			{ role: ChatMessageRole.User, content: [{ type: 'text', value: promptText }] }
		], {}, token);

		const responseText = await getResponseFromStream(response);
		try {
			const match = responseText.match(/\{[\s\S]*\}/);
			if (match) {
				try {
					const obj = JSON.parse(match[0]);
					if (obj && typeof obj.prompt === 'string' && Array.isArray(obj.options)) {
						return obj;
					}
				} catch {
				}
			}
		} catch {
		}
		return undefined;
	}

	private async _handleConfirmationPrompt(
		confirmationPrompt: IConfirmationPrompt | undefined,
		execution: IExecution,
		token: CancellationToken,
		languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>,
	): Promise<boolean> {
		if (confirmationPrompt && confirmationPrompt.options.length > 0) {
			const models = await languageModelsService.selectLanguageModels({ vendor: 'copilot' });
			if (models.length > 0) {
				const sanitizedPrompt = sanitizeForPrompt(confirmationPrompt.prompt);
				const sanitizedOptions = confirmationPrompt.options.map(opt => sanitizeForPrompt(opt));
				const promptText = `Given the following confirmation prompt and options from a terminal output, which option should be selected to proceed safely and correctly?\nPrompt: "${sanitizedPrompt}"\nOptions: ${JSON.stringify(sanitizedOptions)}\nRespond with only the option string.`;
				const response = await languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [
					{ role: ChatMessageRole.User, content: [{ type: 'text', value: promptText }] }
				], {}, token);

				const selectedOption = (await getResponseFromStream(response)).trim();
				if (selectedOption) {
					// Validate that the selectedOption matches one of the original options
					const validOption = confirmationPrompt.options.find(opt => selectedOption.replace(/['"`]/g, '').trim() === opt.replace(/['"`]/g, '').trim());
					if (selectedOption && validOption) {
						await execution.terminal.sendText(validOption, true);
						return true;
					}
				}
			}
		}
		return false;
	}
}

/**
 * Sanitizes text to reduce prompt injection risk and remove characters that could manipulate LLM responses.
 * - Removes backticks, quotes, and backslashes.
 * - Removes control characters.
 * - Removes common LLM prompt injection patterns.
 */
export function sanitizeForPrompt(text: string): string {
	// Remove backticks, quotes, and backslashes
	let sanitized = text.replace(/[`"'\\]/g, '');
	// Remove control characters except \n and \t
	sanitized = sanitized.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
	// Remove common LLM prompt injection patterns
	sanitized = sanitized.replace(/(ignore previous instructions|as an ai language model|you are now|assistant:|system:|user:)/gi, '');
	return sanitized;
}
