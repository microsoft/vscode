/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import {
	IAIAssistantService,
	IAIProvider,
	IAICompletionRequest,
	IAICompletionResponse,
	IAIChatRequest,
	IAIChatResponse,
	IAICodeGenerationRequest,
	IAICodeGenerationResponse,
	IAIRefactoringRequest,
	IAIRefactoringResponse,
	IAIExplanationRequest,
	IAIExplanationResponse
} from '../common/aiAssistantService.js';

const AI_PROVIDER_STORAGE_KEY = 'aiAssistant.currentProvider';
const AI_CONFIG_STORAGE_KEY = 'aiAssistant.configuration';

export class AIAssistantService extends Disposable implements IAIAssistantService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProvider = this._register(new Emitter<IAIProvider | undefined>());
	readonly onDidChangeProvider = this._onDidChangeProvider.event;

	private readonly _onDidReceiveCompletion = this._register(new Emitter<IAICompletionResponse>());
	readonly onDidReceiveCompletion = this._onDidReceiveCompletion.event;

	private readonly _onDidReceiveChatResponse = this._register(new Emitter<IAIChatResponse>());
	readonly onDidReceiveChatResponse = this._onDidReceiveChatResponse.event;

	private _currentProvider: IAIProvider | undefined;
	private readonly _providers = new Map<string, IAIProvider>();
	private _configuration: any = {};

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
		this._loadConfiguration();
		this._loadCurrentProvider();
		this._registerBuiltInProviders();
	}

	get currentProvider(): IAIProvider | undefined {
		return this._currentProvider;
	}

	setProvider(provider: IAIProvider): void {
		this._currentProvider = provider;
		this._providers.set(provider.id, provider);
		this.storageService.store(AI_PROVIDER_STORAGE_KEY, JSON.stringify(provider), StorageScope.PROFILE, StorageTarget.USER);
		this._onDidChangeProvider.fire(provider);
		this.logService.info(`AI Assistant: Provider changed to ${provider.name}`);
	}

	getAvailableProviders(): IAIProvider[] {
		return Array.from(this._providers.values());
	}

	registerProvider(provider: IAIProvider) {
		this._providers.set(provider.id, provider);
		this.logService.info(`AI Assistant: Registered provider ${provider.name}`);

		return this._register({
			dispose: () => {
				this._providers.delete(provider.id);
				if (this._currentProvider?.id === provider.id) {
					this._currentProvider = undefined;
					this._onDidChangeProvider.fire(undefined);
				}
			}
		});
	}

	async generateCompletion(request: IAICompletionRequest, token?: CancellationToken): Promise<IAICompletionResponse> {
		if (!this._currentProvider) {
			throw new Error('No AI provider configured');
		}

		this.logService.debug('AI Assistant: Generating completion', { prompt: request.prompt.substring(0, 100) });

		try {
			const response = await this._makeAPIRequest('/completions', {
				prompt: request.prompt,
				context: request.context,
				language: request.language,
				max_tokens: request.maxTokens || this._currentProvider.maxTokens || 1000,
				temperature: request.temperature || this._currentProvider.temperature || 0.7,
				stop: request.stopSequences
			}, token);

			const result: IAICompletionResponse = {
				text: response.text || response.choices?.[0]?.text || '',
				confidence: response.confidence,
				tokens: response.usage?.total_tokens
			};

			this._onDidReceiveCompletion.fire(result);
			return result;
		} catch (error) {
			this.logService.error('AI Assistant: Completion generation failed', error);
			throw error;
		}
	}

	async generateChat(request: IAIChatRequest, token?: CancellationToken): Promise<IAIChatResponse> {
		if (!this._currentProvider) {
			throw new Error('No AI provider configured');
		}

		this.logService.debug('AI Assistant: Generating chat response', { messageCount: request.messages.length });

		try {
			const response = await this._makeAPIRequest('/chat/completions', {
				messages: request.messages.map(msg => ({
					role: msg.role,
					content: msg.content
				})),
				context: request.context,
				max_tokens: request.maxTokens || this._currentProvider.maxTokens || 2000,
				temperature: request.temperature || this._currentProvider.temperature || 0.7
			}, token);

			const assistantMessage = response.choices?.[0]?.message || { role: 'assistant', content: response.text || '' };

			const result: IAIChatResponse = {
				message: {
					role: 'assistant',
					content: assistantMessage.content,
					timestamp: new Date()
				},
				tokens: response.usage?.total_tokens,
				references: response.references
			};

			this._onDidReceiveChatResponse.fire(result);
			return result;
		} catch (error) {
			this.logService.error('AI Assistant: Chat generation failed', error);
			throw error;
		}
	}

	async generateCode(request: IAICodeGenerationRequest, token?: CancellationToken): Promise<IAICodeGenerationResponse> {
		if (!this._currentProvider) {
			throw new Error('No AI provider configured');
		}

		this.logService.debug('AI Assistant: Generating code', { instruction: request.instruction.substring(0, 100) });

		try {
			const prompt = this._buildCodeGenerationPrompt(request);
			const response = await this._makeAPIRequest('/code/generate', {
				instruction: request.instruction,
				context: request.context,
				language: request.language,
				style: request.style,
				prompt: prompt,
				max_tokens: this._currentProvider.maxTokens || 1500,
				temperature: this._currentProvider.temperature || 0.3
			}, token);

			return {
				code: response.code || response.text || '',
				explanation: response.explanation,
				confidence: response.confidence
			};
		} catch (error) {
			this.logService.error('AI Assistant: Code generation failed', error);
			throw error;
		}
	}

	async refactorCode(request: IAIRefactoringRequest, token?: CancellationToken): Promise<IAIRefactoringResponse> {
		if (!this._currentProvider) {
			throw new Error('No AI provider configured');
		}

		this.logService.debug('AI Assistant: Refactoring code', { instruction: request.instruction.substring(0, 100) });

		try {
			const response = await this._makeAPIRequest('/code/refactor', {
				code: request.code,
				instruction: request.instruction,
				language: request.language,
				context: request.context,
				max_tokens: this._currentProvider.maxTokens || 2000,
				temperature: this._currentProvider.temperature || 0.3
			}, token);

			return {
				refactoredCode: response.refactored_code || response.code || '',
				explanation: response.explanation,
				changes: response.changes
			};
		} catch (error) {
			this.logService.error('AI Assistant: Code refactoring failed', error);
			throw error;
		}
	}

	async explainCode(request: IAIExplanationRequest, token?: CancellationToken): Promise<IAIExplanationResponse> {
		if (!this._currentProvider) {
			throw new Error('No AI provider configured');
		}

		this.logService.debug('AI Assistant: Explaining code', { type: request.type });

		try {
			const response = await this._makeAPIRequest('/code/explain', {
				code: request.code,
				language: request.language,
				context: request.context,
				type: request.type,
				max_tokens: this._currentProvider.maxTokens || 1500,
				temperature: this._currentProvider.temperature || 0.5
			}, token);

			return {
				explanation: response.explanation || response.text || '',
				documentation: response.documentation,
				comments: response.comments
			};
		} catch (error) {
			this.logService.error('AI Assistant: Code explanation failed', error);
			throw error;
		}
	}

	isAvailable(): boolean {
		return !!this._currentProvider && !!this._currentProvider.apiKey;
	}

	getConfiguration(): any {
		return { ...this._configuration };
	}

	updateConfiguration(config: any): void {
		this._configuration = { ...this._configuration, ...config };
		this.storageService.store(AI_CONFIG_STORAGE_KEY, JSON.stringify(this._configuration), StorageScope.PROFILE, StorageTarget.USER);
		this.logService.info('AI Assistant: Configuration updated');
	}

	private async _makeAPIRequest(endpoint: string, data: any, token?: CancellationToken): Promise<any> {
		if (!this._currentProvider) {
			throw new Error('No AI provider configured');
		}

		const url = `${this._currentProvider.endpoint || 'https://api.openai.com/v1'}${endpoint}`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		if (this._currentProvider.apiKey) {
			headers['Authorization'] = `Bearer ${this._currentProvider.apiKey}`;
		}

		// Add model to request if specified
		if (this._currentProvider.model) {
			data.model = this._currentProvider.model;
		}

		const controller = new AbortController();
		token?.onCancellationRequested(() => controller.abort());

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(data),
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`AI API request failed: ${response.status} ${response.statusText}`);
			}

			return await response.json();
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error('AI request was cancelled');
			}
			throw error;
		}
	}

	private _buildCodeGenerationPrompt(request: IAICodeGenerationRequest): string {
		let prompt = `Generate ${request.language || 'code'} code based on the following instruction:\n\n${request.instruction}\n\n`;

		if (request.context?.surroundingCode) {
			prompt += `Context (surrounding code):\n${request.context.surroundingCode}\n\n`;
		}

		if (request.style) {
			prompt += `Style: ${request.style}\n\n`;
		}

		prompt += 'Generated code:';
		return prompt;
	}

	private _loadConfiguration(): void {
		const stored = this.storageService.get(AI_CONFIG_STORAGE_KEY, StorageScope.PROFILE);
		if (stored) {
			try {
				this._configuration = JSON.parse(stored);
			} catch (error) {
				this.logService.warn('AI Assistant: Failed to parse stored configuration', error);
			}
		}

		// Merge with configuration service settings
		const configSettings = this.configurationService.getValue('aiAssistant') || {};
		this._configuration = { ...this._configuration, ...configSettings };
	}

	private _loadCurrentProvider(): void {
		const stored = this.storageService.get(AI_PROVIDER_STORAGE_KEY, StorageScope.PROFILE);
		if (stored) {
			try {
				const provider = JSON.parse(stored);
				this._currentProvider = provider;
				this._providers.set(provider.id, provider);
			} catch (error) {
				this.logService.warn('AI Assistant: Failed to parse stored provider', error);
			}
		}
	}

	private _registerBuiltInProviders(): void {
		// Register OpenAI provider
		this.registerProvider({
			id: 'openai',
			name: 'OpenAI',
			endpoint: 'https://api.openai.com/v1',
			model: 'gpt-4',
			maxTokens: 4000,
			temperature: 0.7
		});

		// Register Anthropic provider
		this.registerProvider({
			id: 'anthropic',
			name: 'Anthropic Claude',
			endpoint: 'https://api.anthropic.com/v1',
			model: 'claude-3-sonnet-20240229',
			maxTokens: 4000,
			temperature: 0.7
		});

		// Register local provider option
		this.registerProvider({
			id: 'local',
			name: 'Local AI Model',
			endpoint: 'http://localhost:11434/v1',
			model: 'codellama',
			maxTokens: 2000,
			temperature: 0.5
		});
	}
}
