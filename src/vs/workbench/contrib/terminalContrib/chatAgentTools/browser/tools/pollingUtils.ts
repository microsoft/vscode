/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { ChatMessageRole, ILanguageModelChatResponse, ILanguageModelsService } from '../../../../chat/common/languageModels.js';
import { ProblemMatcher } from '../../../../tasks/common/problemMatcher.js';
import { IConfirmationPrompt, IExecution, IPollingResult, PollingConsts } from '../bufferOutputPollingTypes.js';
import { ILinkLocation } from '../taskHelpers.js';
import { getProblemsForTasks } from './task/taskUtils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { assessOutputForErrors } from '../assessOutputForErrors.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';

export async function pollForOutputAndIdle(
	execution: IExecution,
	extendedPolling: boolean,
	token: CancellationToken,
	languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>,
	markerService: Pick<IMarkerService, 'read'>,
	knownMatchers?: ProblemMatcher[]
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
							resources.push({
								uri: p.resource,
								range: p.startLineNumber !== undefined && p.startColumn !== undefined && p.endLineNumber !== undefined && p.endColumn !== undefined
									? new Range(p.startLineNumber, p.startColumn, p.endLineNumber, p.endColumn)
									: undefined
							});
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
		const confirmationPrompt = await detectConfirmationPromptWithLLM(buffer, token, languageModelsService);
		const handled = await handleConfirmationPrompt(confirmationPrompt, execution, token, languageModelsService, markerService, knownMatchers);
		if (handled) {
			return handled;
		}
		return { modelOutputEvalResponse, terminalExecutionIdleBeforeTimeout, output: buffer, pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
	}

	const confirmationPrompt = await detectConfirmationPromptWithLLM(buffer, token, languageModelsService);
	const handled = await handleConfirmationPrompt(confirmationPrompt, execution, token, languageModelsService, markerService, knownMatchers);
	if (handled) {
		return handled;
	}
	return { terminalExecutionIdleBeforeTimeout: false, output: buffer, pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
}

export async function handleConfirmationPrompt(
	confirmationPrompt: IConfirmationPrompt | undefined,
	execution: IExecution,
	token: CancellationToken,
	languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>,
	markerService: Pick<IMarkerService, 'read'>,
	knownMatchers?: ProblemMatcher[]
): Promise<IPollingResult | undefined> {
	if (confirmationPrompt && confirmationPrompt.options.length > 0) {
		const models = await languageModelsService.selectLanguageModels({ vendor: 'copilot' });
		if (models.length > 0) {
			const sanitizedPrompt = sanitizeForPrompt(confirmationPrompt.prompt);
			const sanitizedOptions = confirmationPrompt.options.map(opt => sanitizeForPrompt(opt));
			const promptText = `Given the following confirmation prompt and options from a terminal output, which option should be selected to proceed safely and correctly?\nPrompt: "${sanitizedPrompt}"\nOptions: ${JSON.stringify(sanitizedOptions)}\nRespond with only the option string.`;
			const response = await languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [
				{ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: promptText }] }
			], {}, token);

			let selectedOption = '';
			const streaming = getResponseFromStream(response);
			await Promise.all([response.result, streaming]);
			selectedOption = selectedOption.trim();

			if (selectedOption) {
				// Validate that the selectedOption matches one of the original options
				const validOption = confirmationPrompt.options.find(opt => selectedOption === opt.trim());
				if (selectedOption && validOption) {
					await execution.terminal.runCommand(validOption, true);
					return pollForOutputAndIdle(execution, true, token, languageModelsService, markerService, knownMatchers);
				}
			}
		}
	}
	return undefined;
}

export async function detectConfirmationPromptWithLLM(buffer: string, token: CancellationToken, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>, isRetry?: boolean): Promise<IConfirmationPrompt | undefined> {
	if (!buffer) {
		return undefined;
	}
	const models = await languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
	if (!models.length) {
	}
	const lastLine = isRetry
		? buffer.trimEnd().split('\n').slice(-5).join('\n')
		: buffer.trimEnd().split('\n').pop() ?? '';
	const sanitizedLastLine = sanitizeForPrompt(lastLine);
	const promptText = `Does the following terminal output ask the user for input? (for example: 'y/n', '[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [C] Cancel', '[Y]es/[N]o/[S]uspend/[C]ancel', 'Press Enter to continue', 'Type Yes to proceed', 'Do you want to overwrite?', 'Continue [y/N]', 'Accept license terms? (yes/no)', etc)? If so, extract the prompt text and the available options as a JSON object with keys 'prompt' and 'options'. If not, return null.\n\nOutput:\n${sanitizedLastLine}`;
	const response = await languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [
		{ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: promptText }] }
	], {}, token);

	let responseText = '';
	const streaming = (async () => {
		for await (const part of response.stream) {
			if (Array.isArray(part)) {
				for (const p of part) {
					if (isTextPart(p)) {
						responseText += p.part.value;
					}
				}
			} else if (isTextPart(part)) {
				responseText += part.part.value;
			}
		}
	})();

	try {
		await Promise.all([response.result, streaming]);
		const match = responseText.match(/\{[\s\S]*\}/);
		// Wait 1000 ms for buffer to come through then try again
		await new Promise(resolve => setTimeout(resolve, 1000));
		if (!match && !isRetry) {
			// Sometimes the last lines of the buffer aren't populated by the time we check
			return detectConfirmationPromptWithLLM(buffer, token, languageModelsService, true);
		}
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

/**
 * Sanitizes text to reduce prompt injection risk and remove characters that could manipulate LLM responses.
 * - Removes backticks, quotes, and backslashes.
 * - Removes control characters.
 * - Removes common LLM prompt injection patterns.
 */
function sanitizeForPrompt(text: string): string {
	// Remove backticks, quotes, and backslashes
	let sanitized = text.replace(/[`"'\\]/g, '');
	// Remove control characters except \n and \t
	sanitized = sanitized.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
	// Remove common LLM prompt injection patterns
	sanitized = sanitized.replace(/(ignore previous instructions|as an ai language model|you are now|assistant:|system:|user:)/gi, '');
	return sanitized;
}

function isTextPart(obj: unknown): obj is { part: { type: 'text'; value: string } } {
	return !!(
		obj && typeof obj === 'object' && 'part' in obj &&
		(obj as any).part && typeof (obj as any).part === 'object' &&
		'type' in (obj as any).part && (obj as any).part.type === 'text' &&
		'value' in (obj as any).part && typeof (obj as any).part.value === 'string'
	);
}

export async function getResponseFromStream(response: ILanguageModelChatResponse): Promise<string> {
	let responseText = '';
	const streaming = (async () => {
		if (!response || !response.stream) {
			return;
		}
		for await (const part of response.stream) {
			if (Array.isArray(part)) {
				for (const p of part) {
					if (isTextPart(p)) {
						responseText += p.part.value;
					}
				}
			} else if (isTextPart(part)) {
				responseText += part.part.value;
			}
		}
	})();

	try {
		await Promise.all([response.result, streaming]);
		return responseText;
	} catch (err) {
		return 'Error occurred ' + err;
	}
}
