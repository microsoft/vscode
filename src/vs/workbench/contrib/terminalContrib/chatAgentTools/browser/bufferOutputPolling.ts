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
import type { Terminal as RawXtermTerminal, IMarker as IXtermMarker } from '@xterm/xterm';
import { Task } from '../../../tasks/common/taskService.js';
import { IMarker, IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { ProblemMatcher, ProblemMatcherRegistry } from '../../../tasks/common/problemMatcher.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ILinkLocation } from './taskHelpers.js';

export const enum PollingConsts {
	MinNoDataEvents = 2, // Minimum number of no data checks before considering the terminal idle
	MinPollingDuration = 500,
	FirstPollingMaxDuration = 20000, // 20 seconds
	ExtendedPollingMaxDuration = 120000, // 2 minutes
	MaxPollingIntervalDuration = 2000, // 2 seconds
	MaxRecursionCount = 5
}


/**
 * Waits for either polling to complete (terminal idle or timeout) or for the user to respond to a prompt.
 * If polling completes first, the prompt is removed. If the prompt completes first and is accepted, polling continues.
 */
export async function racePollingOrPrompt(
	pollFn: () => Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }>,
	promptFn: () => { promise: Promise<boolean>; part?: Pick<ChatElicitationRequestPart, 'hide' | 'onDidRequestHide'> },
	originalResult: { terminalExecutionIdleBeforeTimeout: boolean; output: string; resources?: ILinkLocation[]; pollDurationMs?: number; modelOutputEvalResponse?: string },
	token: CancellationToken,
	languageModelsService: ILanguageModelsService,
	markerService: IMarkerService,
	execution: { getOutput: () => string; isActive?: () => Promise<boolean>; task?: Task; beginsPattern?: string; endsPattern?: string; dependencyTasks?: Task[] }
): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }> {
	const pollPromise = pollFn();
	const { promise: promptPromise, part } = promptFn();
	let promptResolved = false;

	const pollPromiseWrapped = pollPromise.then(async result => {
		if (!promptResolved && part) {
			// The terminal polling is finished, no need to show the prompt
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
		return raceResult.result as { terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string };
	} else if (raceResult.type === 'prompt') {
		const promptResult = raceResult.result as boolean;
		if (promptResult) {
			// User accepted, poll again (extended)
			return await pollForOutputAndIdle(execution, true, token, languageModelsService, markerService);
		} else {
			return originalResult; // User rejected, return the original result
		}
	}
	// If prompt was rejected or something else, return the result of the first poll
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

export async function pollForOutputAndIdle(
	execution: { getOutput: () => string; isActive?: () => Promise<boolean>; task?: Pick<Task, 'configurationProperties'>; dependencyTasks?: Task[] },
	extendedPolling: boolean,
	token: CancellationToken,
	languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>,
	markerService: Pick<IMarkerService, 'read'>,
	knownMatchers?: ProblemMatcher[]
): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; resources?: ILinkLocation[]; pollDurationMs?: number; modelOutputEvalResponse?: string }> {
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

		if (noNewDataCount >= PollingConsts.MinNoDataEvents) {
			if (execution.isActive && ((await execution.isActive()) === true)) {
				noNewDataCount = 0;
				lastBufferLength = currentBufferLength;
				continue;
			}
		}
		terminalExecutionIdleBeforeTimeout = true;
		let resources: ILinkLocation[] | undefined;
		if (execution.task) {
			const problems = getProblemsForTasks(execution.task, markerService, execution.dependencyTasks, knownMatchers);
			if (problems) {
				// Problem matchers exist for this task
				const problemList: string[] = [];
				for (const [, problemArray] of problems.entries()) {
					resources = [];
					if (problemArray.length) {
						for (const p of problemArray) {
							resources.push({ uri: p.resource, range: new Range(p.startLineNumber ?? 1, p.startColumn ?? 1, p.endLineNumber ?? (p.startLineNumber ?? 1), p.endColumn ?? (p.startColumn ?? 1)) });
							const label = p.resource ? p.resource.path.split('/').pop() ?? p.resource.toString() : '';
							problemList.push(`Problem: ${p.message} in ${label}`);
						}
					}
				}
				if (problemList.length === 0) {
					return { terminalExecutionIdleBeforeTimeout, output: 'The task succeeded with no problems.', pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
				}
				return {
					terminalExecutionIdleBeforeTimeout,
					output: problemList.join('\n'),
					resources,
					pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0)
				};
			}
		}
		const modelOutputEvalResponse = await assessOutputForErrors(buffer, token, languageModelsService);
		return { modelOutputEvalResponse, terminalExecutionIdleBeforeTimeout, output: buffer, pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
	}
	return { terminalExecutionIdleBeforeTimeout: false, output: buffer, pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
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

export async function assessOutputForErrors(buffer: string, token: CancellationToken, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>): Promise<string> {
	const models = await languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
	if (!models.length) {
		return 'No models available';
	}

	const response = await languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [{ role: ChatMessageRole.User, content: [{ type: 'text', value: `Evaluate this terminal output to determine if there were errors or if the command ran successfully: ${buffer}.` }] }], {}, token);

	let responseText = '';

	const streaming = (async () => {
		for await (const part of response.stream) {
			if (Array.isArray(part)) {
				for (const p of part) {
					if (p.type === 'text') {
						responseText += p.value;
					}
				}
			} else if (part.type === 'text') {
				responseText += part.value;
			}
		}
	})();

	try {
		await Promise.all([response.result, streaming]);
		return response.result;
	} catch (err) {
		return 'Error occurred ' + err;
	}
}

export function getProblemsForTasks(task: Pick<Task, 'configurationProperties'>, markerService: Pick<IMarkerService, 'read'>, dependencyTasks?: Task[], knownMatchers?: ProblemMatcher[]): Map<string, IMarker[]> | undefined {
	const problemsMap = new Map<string, IMarker[]>();
	let hadDefinedMatcher = false;

	const collectProblems = (t: Pick<Task, 'configurationProperties'>) => {
		const matchers = Array.isArray(t.configurationProperties.problemMatchers)
			? t.configurationProperties.problemMatchers
			: (t.configurationProperties.problemMatchers ? [t.configurationProperties.problemMatchers] : []);
		for (const matcherRef of matchers) {
			const matcher = typeof matcherRef === 'string'
				? ProblemMatcherRegistry.get(matcherRef) ?? knownMatchers?.find(m => m.owner === matcherRef)
				: matcherRef;
			if (matcher?.owner) {
				const markers = markerService.read({ owner: matcher.owner });
				hadDefinedMatcher = true;
				if (markers.length) {
					problemsMap.set(matcher.owner, markers);
				}
			}
		}
	};

	collectProblems(task);

	if (problemsMap.size === 0 && dependencyTasks) {
		for (const depTask of dependencyTasks) {
			collectProblems(depTask);
		}
	}

	return hadDefinedMatcher ? problemsMap : undefined;
}

