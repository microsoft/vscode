/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	IChatMessage,
	IChatResponseTextPart,
	ILanguageModelChatMetadata,
	ILanguageModelChatMetadataAndIdentifier,
	ILanguageModelChatProvider,
	ILanguageModelChatResponse
} from '../../../contrib/chat/common/languageModels.js';
import { ILocalAIService, LOCAL_AI_MODELS } from '../common/localAI.js';

/**
 * Language model provider for local WebGPU-based AI models
 * Implements the ILanguageModelChatProvider interface to integrate with VSCode's chat system
 */
export class LocalAIModelProvider extends Disposable implements ILanguageModelChatProvider {
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		@ILocalAIService private readonly localAIService: ILocalAIService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		console.log('[LocalAI] LocalAIModelProvider created');
		this.logService.info('[LocalAI] LocalAIModelProvider initialized');
	}

	/**
	 * Provide information about available local models
	 */
	async provideLanguageModelChatInfo(
		options: { silent: boolean },
		token: CancellationToken
	): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		console.log('[LocalAI] provideLanguageModelChatInfo called, silent:', options.silent);

		// Check if WebGPU is available
		const isWebGPUAvailable = await this.localAIService.isWebGPUAvailable();
		console.log('[LocalAI] WebGPU available:', isWebGPUAvailable);

		if (!isWebGPUAvailable) {
			this.logService.info('[LocalAI] WebGPU not available, hiding local models');
			return []; // Hide local models if WebGPU is not available
		}

		// Return metadata for available local models
		const models: ILanguageModelChatMetadataAndIdentifier[] = [];

		for (const modelId in LOCAL_AI_MODELS) {
			const modelMetadata = LOCAL_AI_MODELS[modelId];
			const metadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('vscode.local-ai'),
				name: modelMetadata.name,
				id: modelMetadata.id,
				vendor: 'local',
				version: '1.0.0',
				family: 'local', // Or derive from metadata if available
				maxInputTokens: modelMetadata.maxInputTokens,
				maxOutputTokens: modelMetadata.maxOutputTokens,
				tooltip: modelMetadata.description,
				detail: 'Runs locally with WebGPU',
				isUserSelectable: true,
				modelPickerCategory: {
					label: 'Local Models',
					order: 0 // Show first in picker
				},
				statusIcon: ThemeIcon.fromId('chip'), // Computer chip icon
				capabilities: {
					vision: modelMetadata.capabilities.vision,
					toolCalling: modelMetadata.capabilities.toolCalling,
				}
			};

			models.push({
				identifier: `local-${modelMetadata.id}`,
				metadata
			});
		}

		this.logService.info('[LocalAI] Providing model info', models);
		return models;
	}

	/**
	 * Send a chat request to a local model
	 * Model files are downloaded automatically by transformers.js on first use
	 */
	async sendChatRequest(
		modelId: string,
		messages: IChatMessage[],
		from: ExtensionIdentifier,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		options: { [name: string]: any },
		token: CancellationToken
	): Promise<ILanguageModelChatResponse> {
		this.logService.info(`[LocalAI] Sending chat request with model ${modelId}`);

		// Extract the actual model ID (remove 'local-' prefix)
		const actualModelId = modelId.replace('local-', '');

		// Prepare generation options
		const generationOptions = {
			maxTokens: options.maxTokens ?? 2048,
			temperature: options.temperature ?? 0.7,
			topP: options.top_p ?? 0.9,
		};

		// Create the response stream
		// Note: Model will be downloaded automatically by transformers.js on first use
		const stream = this.createResponseStream(actualModelId, messages, generationOptions, token);

		return {
			stream,
			result: Promise.resolve({})
		};
	}

	/**
	 * Create an async iterable stream of response parts
	 */
	private async *createResponseStream(
		modelId: string,
		messages: IChatMessage[],
		options: Record<string, unknown>,
		token: CancellationToken
	): AsyncIterable<IChatResponseTextPart> {
		try {
			// Generate text using the local AI service
			const textStream = this.localAIService.generateText(modelId, messages, options, token);

			// Convert text chunks to IChatResponseTextPart
			for await (const chunk of textStream) {
				if (token.isCancellationRequested) {
					break;
				}

				const part: IChatResponseTextPart = {
					type: 'text',
					value: chunk
				};

				yield part;
			}
		} catch (error) {
			this.logService.error(`[LocalAI] Error during text generation: ${error}`);
			throw error;
		}
	}

	/**
	 * Provide token count estimation
	 */
	async provideTokenCount(
		modelId: string,
		message: string | IChatMessage,
		token: CancellationToken
	): Promise<number> {
		// Convert message to text if needed
		let text: string;

		if (typeof message === 'string') {
			text = message;
		} else {
			// Extract text from message content
			if (typeof (message as { content?: unknown }).content !== 'undefined') {
				const messageContent = (message as { content: string | Array<{ type: string; value: string }> }).content;
				if (typeof messageContent === 'string') {
					text = messageContent;
				} else if (Array.isArray(messageContent)) {
					text = messageContent
						.filter(part => part.type === 'text')
						.map(part => part.value)
						.join('');
				} else {
					text = '';
				}
			} else {
				text = '';
			}
		}

		// Use the service's token estimation
		return this.localAIService.estimateTokens(text);
	}

	override dispose(): void {
		this._onDidChange.dispose();
		super.dispose();
	}
}
