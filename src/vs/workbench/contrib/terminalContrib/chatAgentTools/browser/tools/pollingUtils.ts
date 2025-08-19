/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ChatMessageRole, ILanguageModelChatResponse, ILanguageModelsService } from '../../../../chat/common/languageModels.js';
import { IConfirmationPrompt, IExecution, IPollingResult, PollingConsts } from '../bufferOutputPollingTypes.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ITaskService } from '../../../../tasks/common/taskService.js';

export async function pollForOutputAndIdle(
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
		terminalExecutionIdleBeforeTimeout = true;
		const modelOutputEvalResponse = await assessOutputForErrors(buffer, token, languageModelsService);
		const terminalReceivedInputResult = await pollFn?.(execution, token, terminalExecutionIdleBeforeTimeout, pollStartTime, extendedPolling, languageModelsService, taskService);
		if (terminalReceivedInputResult) {
			return terminalReceivedInputResult;
		}
		return { modelOutputEvalResponse, terminalExecutionIdleBeforeTimeout, output: buffer, pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
	}

	const confirmationPrompt = await detectConfirmationPromptWithLLM(execution, token, languageModelsService);
	const handled = await handleConfirmationPrompt(confirmationPrompt, execution, token, languageModelsService);
	if (handled) {
		if (typeof handled === 'boolean' && handled) {
			// Something was sent to the terminal, poll again
			return pollForOutputAndIdle(execution, true, token, languageModelsService, taskService, pollFn);
		} else {
			return handled;
		}
	}
	return { terminalExecutionIdleBeforeTimeout: false, output: execution.getOutput(), pollDurationMs: Date.now() - pollStartTime + (extendedPolling ? PollingConsts.FirstPollingMaxDuration : 0) };
}

export async function handleConfirmationPrompt(
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

export async function detectConfirmationPromptWithLLM(execution: IExecution, token: CancellationToken, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>): Promise<IConfirmationPrompt | undefined> {
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

export async function getResponseFromStream(response: ILanguageModelChatResponse): Promise<string> {
	let responseText = '';
	const streaming = (async () => {
		if (!response || !response.stream) {
			return;
		}
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
		return responseText;
	} catch (err) {
		return 'Error occurred ' + err;
	}
}


async function assessOutputForErrors(buffer: string, token: CancellationToken, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>): Promise<string> {
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

