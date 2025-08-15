/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { ChatElicitationRequestPart } from '../../../chat/browser/chatElicitationRequestPart.js';
import { ChatModel } from '../../../chat/common/chatModel.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { IToolInvocationContext } from '../../../chat/common/languageModelToolsService.js';
import type { Terminal as RawXtermTerminal, IMarker as IXtermMarker } from '@xterm/xterm';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { IRacePollingOrPromptResult, IPollingResult, IExecution } from './bufferOutputPollingTypes.js';
import { pollForOutputAndIdle } from './tools/pollingUtils.js';

/**
 * Waits for either polling to complete (terminal idle or timeout) or for the user to respond to a prompt.
 * If polling completes first, the prompt is removed. If the prompt completes first and is accepted, polling continues.
 */
export async function racePollingOrPrompt(
	pollFn: () => Promise<IRacePollingOrPromptResult>,
	promptFn: () => { promise: Promise<boolean>; part?: Pick<ChatElicitationRequestPart, 'hide' | 'onDidRequestHide'> },
	originalResult: IPollingResult,
	token: CancellationToken,
	languageModelsService: ILanguageModelsService,
	markerService: IMarkerService,
	execution: IExecution
): Promise<IRacePollingOrPromptResult> {
	const pollPromise = pollFn();
	const { promise: promptPromise, part } = promptFn();
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
			return await pollForOutputAndIdle(execution, true, token, languageModelsService, markerService);
		} else {
			return originalResult;
		}
	}
	return await pollFn();
}


export function getOutput(terminal?: Pick<RawXtermTerminal, 'buffer'>, startMarker?: IXtermMarker): string {
	if (!terminal) {
		return '';
	}
	const buffer = terminal.buffer.active;
	const startLine = Math.max(startMarker?.line ?? 0, 0);
	const endLine = buffer.length;
	const lines: string[] = new Array(endLine - startLine);

	for (let y = startLine; y < endLine; y++) {
		const line = buffer.getLine(y);
		lines[y - startLine] = line ? line.translateToString(true) : '';
	}

	let output = lines.join('\n');
	if (output.length > 16000) {
		output = output.slice(-16000);
	}
	return output;
}

export function promptForMorePolling(command: string, token: CancellationToken, context: IToolInvocationContext, chatService: IChatService): { promise: Promise<boolean>; part?: ChatElicitationRequestPart } {
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
