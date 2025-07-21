/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ChatElicitationRequestPart } from '../../../chat/browser/chatElicitationRequestPart.js';
import { ChatModel } from '../../../chat/common/chatModel.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { ChatMessageRole, ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { IToolInvocationContext } from '../../../chat/common/languageModelToolsService.js';
import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';

const enum PollingConsts {
	MinNoDataEvents = 2, // Minimum number of no data checks before considering the terminal idle
	MinPollingDuration = 500,
	FirstPollingMaxDuration = 20000, // 20 seconds
	ExtendedPollingMaxDuration = 120000, // 2 minutes
	MaxPollingIntervalDuration = 2000, // 2 seconds
}

export function getOutput(instance: ITerminalInstance, startMarker?: IXtermMarker): string {
	if (!instance.xterm || !instance.xterm.raw) {
		return '';
	}
	const lines: string[] = [];
	for (let y = Math.min(startMarker?.line ?? 0, 0); y < instance.xterm!.raw.buffer.active.length; y++) {
		const line = instance.xterm!.raw.buffer.active.getLine(y);
		if (!line) {
			continue;
		}
		lines.push(line.translateToString(true));
	}
	return lines.join('\n');
}

export async function pollForOutputAndIdle(
	execution: { getOutput: () => string },
	extendedPolling: boolean,
	token: CancellationToken,
	languageModelsService: ILanguageModelsService,
): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number }> {
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
		await timeout(waitTime);

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
		const isLikelyFinished = await assessOutputForFinishedState(buffer, token, languageModelsService);
		terminalExecutionIdleBeforeTimeout = isLikelyFinished && noNewDataCount >= PollingConsts.MinNoDataEvents;
		if (terminalExecutionIdleBeforeTimeout) {
			return { terminalExecutionIdleBeforeTimeout, output: buffer, pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
		}
	}
	return { terminalExecutionIdleBeforeTimeout, output: buffer, pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
}

export async function promptForMorePolling(command: string, execution: { getOutput: () => string }, token: CancellationToken, context: IToolInvocationContext, chatService: IChatService): Promise<boolean> {
	const chatModel = chatService.getSession(context.sessionId);
	if (chatModel instanceof ChatModel) {
		const request = chatModel.getRequests().at(-1);
		if (request) {
			const waitPromise = new Promise<boolean>(resolve => {
				const part = new ChatElicitationRequestPart(
					new MarkdownString(localize('poll.terminal.waiting', "Continue waiting for `{0}` to finish?", command)),
					new MarkdownString(localize('poll.terminal.polling', "Copilot will continue to poll for output to determine when the terminal becomes idle for up to 2 minutes.")),
					'',
					localize('poll.terminal.accept', 'Yes'),
					localize('poll.terminal.reject', 'No'),
					async () => {
						resolve(true);
					},
					async () => {
						resolve(false);
					}
				);
				chatModel.acceptResponseProgress(request, part);
			});
			return waitPromise;
		}
	}
	return false; // Fallback to not waiting if we can't prompt the user
}

export async function assessOutputForFinishedState(buffer: string, token: CancellationToken, languageModelsService: ILanguageModelsService): Promise<boolean> {
	const models = await languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
	if (!models.length) {
		return false;
	}

	const response = await languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('Github.copilot-chat'), [{ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: `Evaluate this terminal output to determine if the command is finished or still in process: ${buffer}. Return the word true if finished and false if still in process.` }] }], {}, token);

	let responseText = '';

	const streaming = (async () => {
		for await (const part of response.stream) {
			if (Array.isArray(part)) {
				for (const p of part) {
					if (p.part.type === 'text') {
						responseText += p.part.value;
					}
				}
			} else if (part.part.type === 'text') {
				responseText += part.part.value;
			}
		}
	})();

	try {
		await Promise.all([response.result, streaming]);
		return responseText.includes('true');
	} catch (err) {
		return false;
	}
}
