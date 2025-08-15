/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { ILanguageModelsService, ChatMessageRole } from '../../../../chat/common/languageModels.js';
import { ProblemMatcher } from '../../../../tasks/common/problemMatcher.js';
import { pollForOutputAndIdle } from '../bufferOutputPolling.js';
import { IConfirmationPrompt, IExecution, IPollingResult } from '../bufferOutputPollingTypes.js';

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
			const streaming = (async () => {
				for await (const part of response.stream) {
					if (Array.isArray(part)) {
						for (const p of part) {
							if (p.part.type === 'text') {
								selectedOption += p.part.value;
							}
						}
					} else if (part.part.type === 'text') {
						selectedOption += part.part.value;
					}
				}
			})();
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

export async function detectConfirmationPromptWithLLM(buffer: string, token: CancellationToken, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>): Promise<IConfirmationPrompt | undefined> {
	if (!buffer) {
		return undefined;
	}
	const models = await languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
	if (!models.length) {
	}
	const lastLine = buffer.trimEnd().split('\n').pop() ?? '';
	const sanitizedLastLine = sanitizeForPrompt(lastLine);
	const promptText = `Does the following terminal output line contain a confirmation prompt (for example: 'y/n', '[Y]es/[N]o/[A]ll', '[Y]es/[N]o/[S]uspend/[C]ancel', 'Press Enter to continue', 'Type Yes to proceed', 'Do you want to overwrite?', 'Continue [y/N]', 'Accept license terms? (yes/no)', etc)? If so, extract the prompt text and the available options as a JSON object with keys 'prompt' and 'options'. If not, return null.\n\nOutput:\n${sanitizedLastLine}`;
	const response = await languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [
		{ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: promptText }] }
	], {}, token);

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
 * - Collapses excessive whitespace.
 * - Removes common LLM prompt injection patterns.
 */
function sanitizeForPrompt(text: string): string {
	// Remove backticks, quotes, and backslashes
	let sanitized = text.replace(/[`"'\\]/g, '');
	// Remove control characters except \n and \t
	sanitized = sanitized.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
	// Remove common LLM prompt injection patterns
	sanitized = sanitized.replace(/(ignore previous instructions|as an ai language model|you are now|assistant:|system:|user:)/gi, '');
	// Collapse multiple whitespace to single space
	sanitized = sanitized.replace(/\s+/g, ' ').trim();
	return sanitized;
}
