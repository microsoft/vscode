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
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { IToolInvocationContext } from '../../../chat/common/languageModelToolsService.js';
import { IRacePollingOrPromptResult, IPollingResult, IExecution } from './bufferOutputPollingTypes.js';
import { pollForOutputAndIdle } from './tools/pollingUtils.js';

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
		private readonly _execution: { getOutput: () => string; isActive?: () => Promise<boolean>; task?: Task; beginsPattern?: string; endsPattern?: string; dependencyTasks?: Task[]; terminal: ITerminalInstance },
		@ILanguageModelsService private readonly _languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>,
		@ITaskService private readonly _taskService: ITaskService,
		private readonly _pollFn?: (execution: IExecution, token: CancellationToken, terminalExecutionIdleBeforeTimeout: boolean, pollStartTime: number, extendedPolling: boolean, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>, taskService: ITaskService) => Promise<IPollingResult | boolean | undefined> | undefined,
	) {
		super();
	}

	async startMonitoring(
		chatService: IChatService,
		command: string,
		invocationContext: any,
		token: CancellationToken
	): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string; resources?: ILinkLocation[] }> {
		let result = await pollForOutputAndIdle(this._execution, false, token, this._languageModelsService, this._taskService, this._pollFn);

		if (!result.terminalExecutionIdleBeforeTimeout) {
			result = await this._racePollingOrPrompt(
				() => pollForOutputAndIdle(this._execution, true, token, this._languageModelsService, this._taskService, this._pollFn),
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
		promptFn: () => Promise<{ promise: Promise<boolean>; part?: Pick<ChatElicitationRequestPart, 'hide' | 'onDidRequestHide'> }>,
		originalResult: IPollingResult,
		token: CancellationToken,
		languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>,
		taskService: ITaskService,
		execution: IExecution
	): Promise<IRacePollingOrPromptResult> {
		const pollPromise = pollFn();
		const { promise: promptPromise, part } = await promptFn();
		let promptResolved = false;

		const pollPromiseWrapped = pollPromise.then(async result => {
			if (!promptResolved && part) {
				part.hide();
			}
			return { type: 'poll', result };
		});

		const promptPromiseWrapped = promptPromise.then(result => {
			promptResolved = true;
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
				return await pollForOutputAndIdle(execution, true, token, languageModelsService, taskService, pollFn);
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
							resolve(true);
						},
						async () => {
							thePart.state = 'rejected';
							thePart.hide();
							resolve(false);
						}
					);
					chatModel.acceptResponseProgress(request, thePart);
				});
				return { promise, part };
			}
		}
		return { promise: Promise.resolve(false) };
	}


}
