/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import {
	IChatMessage,
	IChatResponseTextPart,
	ILanguageModelChatMetadataAndIdentifier,
	ILanguageModelChatProvider,
	ILanguageModelChatResponse
} from '../../../common/languageModels.js';
import { DSpaceModelId, IDSpaceModelProviderService } from './modelProvider.js';
import { ILocalAIService } from '../localInference/localAI.js';

/**
 * Language model provider that exposes DSpace models to VS Code's model picker
 * This bridges our internal provider system with VS Code's ILanguageModelsService
 */
export class DSpaceLanguageModelProvider extends Disposable implements ILanguageModelChatProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IDSpaceModelProviderService private readonly modelProviderService: IDSpaceModelProviderService,
		@ILocalAIService private readonly localAIService: ILocalAIService
	) {
		super();
		this.logService.info('[DSpaceLanguageModelProvider] Initialized');
	}

	/**
	 * Provide information about available DSpace models
	 */
	async provideLanguageModelChatInfo(
		options: { silent: boolean },
		token: CancellationToken
	): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		this.logService.info('[DSpaceLanguageModelProvider] provideLanguageModelChatInfo called');

		const models: ILanguageModelChatMetadataAndIdentifier[] = [];

		// Online model - always available
		models.push({
			identifier: DSpaceModelId.Online,
			metadata: {
				extension: new ExtensionIdentifier('dspace.core'),
				name: 'DSpace Online',
				id: DSpaceModelId.Online,
				vendor: 'DSpace',
				version: '1.0.0',
				family: 'dspace',
				maxInputTokens: 128000,
				maxOutputTokens: 8192,
				tooltip: 'DSpace Online - Cloud-powered AI assistant',
				detail: 'Powered by DSpace Server',
				isUserSelectable: true,
				isDefault: true, // Make online the default
				modelPickerCategory: {
					label: 'DSpace',
					order: 0 // Show first
				},
				statusIcon: ThemeIcon.fromId('cloud'),
				capabilities: {
					vision: false,
					toolCalling: true,
				}
			}
		});

		// Offline model - check if WebGPU is available
		const isWebGPUAvailable = await this.localAIService.isWebGPUAvailable();
		if (isWebGPUAvailable) {
			models.push({
				identifier: DSpaceModelId.Offline,
				metadata: {
					extension: new ExtensionIdentifier('dspace.core'),
					name: 'DSpace Local (Qwen)',
					id: DSpaceModelId.Offline,
					vendor: 'DSpace',
					version: '1.0.0',
					family: 'dspace',
					maxInputTokens: 8192,
					maxOutputTokens: 2048,
					tooltip: 'DSpace Local - Runs offline using WebGPU',
					detail: 'Runs locally in your browser',
					isUserSelectable: true,
					modelPickerCategory: {
						label: 'DSpace',
						order: 0
					},
					statusIcon: ThemeIcon.fromId('device-desktop'),
					capabilities: {
						vision: false,
						toolCalling: true,
					}
				}
			});
		} else {
			this.logService.info('[DSpaceLanguageModelProvider] WebGPU not available, hiding local model');
		}

		this.logService.info(`[DSpaceLanguageModelProvider] Returning ${models.length} models`);
		return models;
	}

	/**
	 * Send a chat request using the selected DSpace model
	 * Note: This is called by VS Code's language model service, but DSpaceAgent
	 * uses its own path via DSpaceModelProviderService. This implementation
	 * is here for completeness but may not be used directly.
	 */
	async sendChatRequest(
		modelId: string,
		messages: IChatMessage[],
		from: ExtensionIdentifier,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		options: { [name: string]: any },
		token: CancellationToken
	): Promise<ILanguageModelChatResponse> {
		this.logService.info(`[DSpaceLanguageModelProvider] sendChatRequest called with model ${modelId}`);

		// Update the active provider based on the selected model
		if (modelId === DSpaceModelId.Online || modelId === DSpaceModelId.Offline) {
			this.modelProviderService.setActiveProvider(modelId);
		}

		// Return a minimal response - the actual chat is handled by DSpaceAgent
		const stream = this.createEmptyStream();
		return {
			stream,
			result: Promise.resolve({})
		};
	}

	/**
	 * Create an empty stream (DSpaceAgent handles actual chat)
	 */
	private async *createEmptyStream(): AsyncIterable<IChatResponseTextPart> {
		// DSpaceAgent handles the actual chat, this is just for API compliance
		yield { type: 'text', value: '' };
	}

	/**
	 * Provide token count estimation
	 */
	async provideTokenCount(
		modelId: string,
		message: string | IChatMessage,
		token: CancellationToken
	): Promise<number> {
		let text: string;

		if (typeof message === 'string') {
			text = message;
		} else if (message.content && Array.isArray(message.content)) {
			text = message.content
				.filter(part => part.type === 'text')
				.map(part => (part as { value?: string }).value || '')
				.join('\n');
		} else {
			text = '';
		}

		// Simple estimation: ~4 characters per token
		return Math.ceil(text.length / 4);
	}
}


