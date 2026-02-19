/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPhononService } from '../common/phonon.js';
import {
	IChatAgentHistoryEntry,
	IChatAgentImplementation,
	IChatAgentRequest,
	IChatAgentResult,
} from '../../chat/common/participants/chatAgents.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import {
	ChatMessageRole,
	IChatMessage,
	IChatMessagePart,
	ILanguageModelsService,
} from '../../chat/common/languageModels.js';
import { IChatFollowup, IChatProgress } from '../../chat/common/chatService/chatService.js';

export class PhononChatAgentImpl extends Disposable implements IChatAgentImplementation {

	constructor(
		@IPhononService private readonly phononService: IPhononService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async invoke(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		history: IChatAgentHistoryEntry[],
		token: CancellationToken
	): Promise<IChatAgentResult> {
		const stopWatch = StopWatch.create(false);

		if (!this.phononService.isConfigured) {
			progress([{
				kind: 'markdownContent',
				content: new MarkdownString(
					'**Phonon IDE** needs an Anthropic API key to use Claude.\n\n' +
					'Run the command **Phonon: Set API Key** from the Command Palette (`Cmd+Shift+P`) to configure it.\n\n' +
					'You can get an API key from [console.anthropic.com](https://console.anthropic.com/).'
				),
			}]);

			return {
				timings: { totalElapsed: stopWatch.elapsed() },
			};
		}

		try {
			// Build the conversation messages
			const messages = this._buildMessages(request, history);

			// Determine which model to use
			const rawModelId = request.userSelectedModelId || this.phononService.defaultModelId;
			// The model identifier in the cache is prefixed with "phonon/"
			const modelIdentifier = rawModelId.startsWith('phonon/') ? rawModelId : `phonon/${rawModelId}`;

			// Send the request via ILanguageModelsService
			const response = await this.languageModelsService.sendChatRequest(
				modelIdentifier,
				new ExtensionIdentifier('phonon.claude'),
				messages,
				{ maxTokens: 8192 },
				token
			);

			// Stream the response
			let firstProgress = false;
			for await (const part of response.stream) {
				if (token.isCancellationRequested) {
					break;
				}

				const parts = Array.isArray(part) ? part : [part];
				for (const p of parts) {
					if (p.type === 'text') {
						const chatProgress: IChatProgress = {
							kind: 'markdownContent',
							content: new MarkdownString(p.value),
						};
						progress([chatProgress]);

						if (!firstProgress) {
							firstProgress = true;
						}
					} else if (p.type === 'thinking') {
						// Show thinking as a progress message
						const thinkingText = Array.isArray(p.value) ? p.value.join('') : p.value;
						progress([{
							kind: 'markdownContent',
							content: new MarkdownString(`*${thinkingText}*`),
						}]);
					}
				}
			}

			await response.result;

			return {
				timings: {
					firstProgress: firstProgress ? stopWatch.elapsed() : undefined,
					totalElapsed: stopWatch.elapsed(),
				},
			};

		} catch (err) {
			this.logService.error('[Phonon] Chat request failed:', err);

			const errorMessage = err instanceof Error ? err.message : String(err);

			return {
				errorDetails: {
					message: errorMessage,
				},
				timings: { totalElapsed: stopWatch.elapsed() },
			};
		}
	}

	async provideFollowups(
		_request: IChatAgentRequest,
		_result: IChatAgentResult,
		_history: IChatAgentHistoryEntry[],
		_token: CancellationToken
	): Promise<IChatFollowup[]> {
		return [];
	}

	async provideChatTitle(
		history: IChatAgentHistoryEntry[],
		_token: CancellationToken
	): Promise<string | undefined> {
		if (history.length === 0) {
			return undefined;
		}

		// Use the first user message as a basis for the title
		const firstMessage = history[0]?.request?.message;
		if (!firstMessage) {
			return undefined;
		}

		// Truncate to a reasonable title length
		const maxLength = 50;
		if (firstMessage.length <= maxLength) {
			return firstMessage;
		}
		return firstMessage.substring(0, maxLength - 3) + '...';
	}

	private _buildMessages(
		request: IChatAgentRequest,
		history: IChatAgentHistoryEntry[]
	): IChatMessage[] {
		const messages: IChatMessage[] = [];

		// System message
		messages.push({
			role: ChatMessageRole.System,
			content: [{
				type: 'text',
				value: this._getSystemPrompt(request),
			}],
		});

		// History
		for (const entry of history) {
			// User message
			messages.push({
				role: ChatMessageRole.User,
				content: [{
					type: 'text',
					value: entry.request.message,
				}],
			});

			// Assistant response
			const responseParts: IChatMessagePart[] = [];
			for (const part of entry.response) {
				const partAny = part as { content?: unknown };
				if (partAny.content) {
					responseParts.push({
						type: 'text',
						value: typeof partAny.content === 'string'
							? partAny.content
							: (partAny.content as { value: string }).value || '',
					});
				}
			}
			if (responseParts.length > 0) {
				messages.push({
					role: ChatMessageRole.Assistant,
					content: responseParts,
				});
			}
		}

		// Current message
		messages.push({
			role: ChatMessageRole.User,
			content: [{
				type: 'text',
				value: request.message,
			}],
		});

		return messages;
	}

	private _getSystemPrompt(_request: IChatAgentRequest): string {
		return [
			'You are Claude, an AI assistant integrated into Phonon IDE.',
			'You are helpful, direct, and concise.',
			'When asked about code, provide practical solutions.',
			'Use markdown formatting for code blocks and structured content.',
			'If the user asks about the IDE, you can explain that Phonon IDE is a VS Code fork with native Claude integration.',
		].join(' ');
	}
}
