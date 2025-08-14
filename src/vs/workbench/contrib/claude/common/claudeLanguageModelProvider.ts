/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IProgress } from '../../../../platform/progress/common/progress.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import {
	ILanguageModelChatProvider,
	ILanguageModelChatMetadata,
	ILanguageModelChatResponse,
	ChatMessageRole,
	IChatMessage,
	IChatResponseStream,
	ILanguageModelChatSelector
} from './languageModels.js';
import { IClaudeApiClient } from './claudeApiClient.js';
import { CLAUDE_MODELS, ClaudeModelId, IClaudeMessage } from './claudeTypes.js';

export class ClaudeLanguageModelProvider extends Disposable implements ILanguageModelChatProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly claudeApiClient: IClaudeApiClient,
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService
	) {
		super();

		// Listen for Claude configuration changes
		this._register(claudeApiClient.onDidChangeConfiguration(() => {
			this._onDidChange.fire();
		}));

		// Listen for configuration changes
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('claude')) {
				this._onDidChange.fire();
			}
		}));
	}

	async prepareLanguageModelChat(options: { silent: boolean }, token: CancellationToken): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		if (!this.claudeApiClient.isConfigured()) {
			if (!options.silent) {
				this.logService.warn('Claude API client is not configured');
			}
			return [];
		}

		// Test connection if not silent
		if (!options.silent) {
			try {
				const isConnected = await this.claudeApiClient.testConnection(token);
				if (!isConnected) {
					this.logService.error('Failed to connect to Claude API');
					return [];
				}
			} catch (error) {
				this.logService.error('Error testing Claude API connection:', error);
				return [];
			}
		}

		// Return available Claude models
		return Object.entries(CLAUDE_MODELS).map(([id, modelInfo]) => ({
			identifier: `claude-${id}`,
			metadata: {
				extension: { value: 'internal.claude' } as any, // ExtensionIdentifier for internal Claude provider
				id: id as ClaudeModelId,
				name: modelInfo.name,
				family: modelInfo.family,
				vendor: 'claude',
				description: `${modelInfo.name} - Advanced AI assistant by Anthropic`,
				version: id.split('-').pop() || '1.0',
				maxInputTokens: modelInfo.maxInputTokens,
				maxOutputTokens: modelInfo.maxOutputTokens,
				isDefault: id === 'claude-3-5-sonnet-20241022',
				isUserSelectable: true,
				modelPickerCategory: { label: 'Claude', order: 1 }
			}
		}));
	}

	async sendChatRequest(
		modelId: string,
		messages: IChatMessage[],
		from: ExtensionIdentifier,
		options: { [name: string]: any },
		token: CancellationToken
	): Promise<ILanguageModelChatResponse> {
		this.logService.info(`Claude chat request for model ${modelId}`);

		try {
			// Extract actual Claude model ID from the identifier
			const actualModelId = modelId.replace('claude-', '') as ClaudeModelId;

			// Convert VS Code messages to Claude format
			const claudeMessages = this._convertMessagesToClaude(messages);

			// Extract tools if provided
			const tools = options.tools?.map((tool: any) => ({
				name: tool.name,
				description: tool.description,
				input_schema: tool.inputSchema || {}
			}));

			let responseText = '';

			const claudeResponse = await this.claudeApiClient.sendMessage(
				claudeMessages,
				actualModelId,
				{
					maxTokens: options.maxTokens || 4096,
					temperature: options.temperature || 0.7,
					tools,
					toolChoice: options.toolMode ? { type: 'auto' } : undefined
				},
				undefined, // No streaming for now
				token
			);

			this.logService.info(`Claude response completed. Tokens used: ${claudeResponse.usage?.input_tokens || 0} input, ${claudeResponse.usage?.output_tokens || 0} output`);

			return {
				stream: this._createResponseStream(claudeResponse.content?.[0]?.text || ''),
				result: Promise.resolve({
					text: claudeResponse.content?.[0]?.text || '',
					usage: claudeResponse.usage
				})
			};

		} catch (error) {
			this.logService.error('Error in Claude chat response:', error);
			throw error;
		}
	}

	async provideTokenCount(
		modelId: string,
		message: string | IChatMessage,
		token: CancellationToken
	): Promise<number> {
		// For now, use simple estimation
		// In the future, we could use Claude's token counting API if available
		const textToCount = typeof message === 'string' ? message : this._extractTextFromMessage(message);
		return this.claudeApiClient.estimateTokens(textToCount);
	}

	private _convertMessagesToClaude(messages: IChatMessage[]): IClaudeMessage[] {
		return messages.map(msg => {
			const role = this._convertRole(msg.role);

			// Handle array of content parts
			if (Array.isArray(msg.content)) {
				const content = msg.content.map(part => {
					if ('type' in part) {
						switch (part.type) {
							case 'text':
								return { type: 'text', text: part.value };
							case 'image_url':
								// Handle image content for vision models
								if ('data' in part.value && 'mimeType' in part.value) {
									return {
										type: 'image',
										source: {
											type: 'base64',
											media_type: part.value.mimeType,
											data: part.value.data.toString('base64')
										}
									};
								}
								break;
						}
					}
					return { type: 'text', text: String(part) };
				});

				return { role, content };
			}

			// Fallback to string conversion
			return { role, content: msg.content.map(p => p.type === 'text' ? p.value : '').join('') };
		});
	}

	private _convertRole(role: ChatMessageRole): 'system' | 'user' | 'assistant' {
		switch (role) {
			case ChatMessageRole.System: return 'system';
			case ChatMessageRole.User: return 'user';
			case ChatMessageRole.Assistant: return 'assistant';
			default: return 'user';
		}
	}

	private _extractTextFromMessage(message: IChatMessage): string {
		if (Array.isArray(message.content)) {
			return message.content
				.map(part => {
					if (part.type === 'text') return part.value;
					return '';
				})
				.join(' ');
		}

		return '';
	}

	private _createResponseStream(text: string): IChatResponseStream {
		// Simple implementation that yields the complete text
		// In a real implementation, this would be a proper async iterator
		return {
			[Symbol.asyncIterator]: async function* () {
				yield { type: 'text', value: text };
			}
		} as IChatResponseStream;
	}
}
