/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StreamData } from './streamingParser.js';
import {
	BackendConfig,
	BACKEND_ENVIRONMENTS,
	HealthResponse,
	BackendRequest,
	TIMING_CONFIG,
} from '../common/types.js';
import {ConversationMessage} from '../../erdosAi/common/conversationTypes.js';
import { IApiKeyManager } from '../../erdosAiAuth/common/apiKeyManager.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IBackendClient } from '../common/backendClient.js';
import { ISSEParser } from '../common/streamingParser.js';

export class BackendClient extends Disposable implements IBackendClient {
	readonly _serviceBrand: undefined;
	private config?: BackendConfig;
	private activeAbortController?: AbortController;

	constructor(
		@IApiKeyManager private readonly apiKeyManager: IApiKeyManager,
		@ISSEParser private readonly sseParser: ISSEParser
	) {
		super();
		this.initializeDefaults();
	}

	private parseSSEErrorResponse(responseText: string): any {
		if (!responseText || responseText.length === 0) {
			return null;
		}

		const lines = responseText.split('\n');

		for (const line of lines) {
			if (line.startsWith('data: ')) {
				const jsonText = line.substring(6);

				try {
					return JSON.parse(jsonText);
				} catch (e) {
				}
			}
		}

		return null;
	}

	private initializeDefaults(): void {
		this.config = {
			url: BACKEND_ENVIRONMENTS.production.url,
			environment: 'production',
			timeout: TIMING_CONFIG.REQUEST_TIMEOUT
		};
	}

	public async detectEnvironment(): Promise<BackendConfig> {
		let localAvailable = false;
		
		try {
			const response = await fetch(
				`${BACKEND_ENVIRONMENTS.local.url}/actuator/health`,
				{
					method: 'GET',
					signal: AbortSignal.timeout(TIMING_CONFIG.HEALTH_CHECK_TIMEOUT),
					headers: {
						'Accept': 'application/json',
					},
				},
			);
			localAvailable = response.status === 200;
		} catch (error) {
			localAvailable = false;
		}

		if (localAvailable) {
			this.config = {
				url: BACKEND_ENVIRONMENTS.local.url,
				environment: 'local',
				timeout: TIMING_CONFIG.REQUEST_TIMEOUT,
			};
		} else {
			this.config = {
				url: BACKEND_ENVIRONMENTS.production.url,
				environment: 'production',
				timeout: TIMING_CONFIG.REQUEST_TIMEOUT,
			};
		}

		return this.config;
	}

	public async getBackendConfig(): Promise<BackendConfig> {
		if (!this.config) {
			throw new Error('Backend configuration not initialized');
		}
		return this.config;
	}

	public async checkHealth(): Promise<HealthResponse> {
		const config = await this.getBackendConfig();
		
		try {
			const response = await fetch(`${config.url}/actuator/health`, {
				method: 'GET',
				signal: AbortSignal.timeout(TIMING_CONFIG.HEALTH_CHECK_TIMEOUT),
				headers: {
					'Accept': 'application/json',
				},
			});

			if (!response.ok) {
				throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
			}

			return await response.json() as HealthResponse;
		} catch (error) {
			throw new Error('Could not connect to backend server within 30 seconds. Please check your internet connectivity and try again. Often this is solved by just retrying. If the problem persists, please open a thread at https://community.lotas.ai/.');
		}
	}

	private async buildRequestData(
		requestType: 'ai_api_call' | 'generate_conversation_name' | 'summarize_conversation',
		messages: ConversationMessage[],
		provider: string,
		model: string | null,
		temperature: number | null,
		requestId: string,
		contextData?: any
	): Promise<BackendRequest> {
		const auth = await this.apiKeyManager.generateBackendAuth();
		if (!auth) {
			throw new Error('No API key configured. Please set the Rao API key in Erdos AI settings.');
		}

		const client_version = contextData?.client_version || '0.3.0';

		const sorted_conversation = messages.sort((a, b) => (a.id || 0) - (b.id || 0));

		const requestData: any = {
			request_type: requestType,
			conversation: sorted_conversation,
			provider: provider,
			model: model,
			temperature: temperature,
			request_id: requestId,
			client_version: client_version,
			app_type: 'erdos',
			symbols_note: contextData?.symbols_note,
			user_rules: contextData?.user_rules || [],
			user_os_version: contextData?.user_os_version || navigator.platform || 'unknown',
			user_workspace_path: contextData?.user_workspace_path || '/',
			user_shell: contextData?.user_shell || 'bash',
			project_layout: contextData?.project_layout || '',
			last_function_was_edit_file: contextData?.last_function_was_edit_file || false
		};

		if (contextData?.target_query_number !== undefined) {
			requestData.target_query_number = contextData.target_query_number;
		}
		if (contextData?.previous_summary !== undefined) {
			requestData.previous_summary = contextData.previous_summary;
		}

		Object.keys(requestData).forEach(key => {
			if (requestData[key] === undefined) {
				delete requestData[key];
			}
		});

		if (contextData?.has_attachments && contextData?.attachments?.length > 0) {
			requestData.attachments = contextData.attachments;
			requestData.vector_store_id = contextData.vector_store_id;
			requestData.has_attachments = true;
		}

		requestData.auth = auth;

		return requestData;
	}

	private isRetryableError(error: any, httpStatus?: number | null): boolean {
		if (httpStatus !== null && httpStatus !== undefined) {
			if ([400, 401, 402, 403, 404, 409].includes(httpStatus)) {
				return false;
			}
			
			if ([429, 500].includes(httpStatus)) {
				return true;
			}
		}
		
		if (error && typeof error === 'object' && error.error && typeof error.error === 'object') {
			const errorType = error.error.error_type;
			if (errorType) {
				const nonRetryableTypes = [
					'SUBSCRIPTION_LIMIT_REACHED',
					'TRIAL_EXPIRED', 
					'PAYMENT_ACTION_REQUIRED',
					'USAGE_BILLING_REQUIRED',
					'USAGE_BILLING_LIMIT_REACHED',
					'SUBSCRIPTION_EXPIRED',
					'SUBSCRIPTION_PAYMENT_FAILED',
					'OVERAGE_PAYMENT_FAILED',
					'AUTHENTICATION_ERROR'
				];
				
				if (nonRetryableTypes.includes(errorType)) {
					return false;
				}
				
				if (errorType === 'SYSTEM_ERROR') {
					return true;
				}
				
				if (['MODEL_ERROR', 'UNKNOWN_ERROR'].includes(errorType)) {
					return false;
				}
			}
		}
		
		if (error instanceof Error) {
			const message = error.message.toLowerCase();
			if (message.includes('network') || 
				message.includes('connection') || 
				message.includes('timeout') ||
				message.includes('fetch')) {
				return true;
			}
		}
		
		return false;
	}

	public async sendStreamingQuery(
		messages: ConversationMessage[],
		provider: string,
		model: string,
		temperature: number,
		requestId: string,
		contextData: any,
		onData: (data: StreamData) => void,
		onError: (error: Error) => void,
		onComplete: () => void
	): Promise<void> {
		const maxRetries = 3;
		let lastError: Error | null = null;
		
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				await this.sendStreamingQuerySingle(
					messages, provider, model, temperature, requestId, contextData,
					onData, onError, onComplete
				);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error('Unknown error');
				
				const httpStatus = (error as any).httpStatus || null;
				if (!this.isRetryableError(error, httpStatus) || attempt >= maxRetries) {
					throw lastError;
				}
				
				const retryDelay = (2 + (attempt - 1)) * 1000;
				await new Promise(resolve => setTimeout(resolve, retryDelay));
			}
		}
		
		throw lastError || new Error('The connection to the back-end failed and continued to fail on retries. Check your network connectivity, try the query again, or open a new conversation. If the error persists, please open a thread at https://community.lotas.ai/');
	}

	private async sendStreamingQuerySingle(
		messages: ConversationMessage[],
		provider: string,
		model: string,
		temperature: number,
		requestId: string,
		contextData: any,
		onData: (data: StreamData) => void,
		onError: (error: Error) => void,
		onComplete: () => void
	): Promise<void> {
		const config = await this.getBackendConfig();
		
		this.activeAbortController = new AbortController();
		
		const requestBody = await this.buildRequestData('ai_api_call', messages, provider, model, temperature, requestId, contextData);
		
		try {
			
			const response = await fetch(`${config.url}/ai/query`, {
				method: 'POST',
				mode: 'cors',
				signal: this.activeAbortController.signal,
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'X-Rao-Security-Mode': 'secure',
					'X-Rao-Web-Search-Enabled': 'false',
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				let userFriendlyMessage: string | null = null;
				
				try {
					if (errorText) {
						let errorData = null;
						
						if (errorText.includes('data: ')) {
							errorData = this.parseSSEErrorResponse(errorText);
						} else {
							errorData = JSON.parse(errorText);
						}
						
						if (errorData) {
							if (errorData.error && typeof errorData.error === 'object') {
								const nestedError = errorData.error;
								if (nestedError.user_message) {
									userFriendlyMessage = nestedError.user_message;
								} else if (nestedError.error_message) {
									userFriendlyMessage = nestedError.error_message;
								} else if (nestedError.message) {
									userFriendlyMessage = nestedError.message;
								}
							} else if (errorData.user_message) {
								userFriendlyMessage = errorData.user_message;
							} else if (errorData.error_message) {
								userFriendlyMessage = errorData.error_message;
							} else if (errorData.message) {
								userFriendlyMessage = errorData.message;
							} else if (typeof errorData.error === 'string') {
								userFriendlyMessage = errorData.error;
							} else if (errorText.length < 500 && !errorText.toLowerCase().includes('<html') && !errorText.toLowerCase().includes('<!doctype')) {
								userFriendlyMessage = errorText;
							}
						}
					}
				} catch (e) {
					console.error(`Exception while parsing error:`, e);
				}
				
				if (!userFriendlyMessage || userFriendlyMessage.trim().length === 0 || userFriendlyMessage === `HTTP ${response.status} error from backend server`) {
					if (response.status === 401) {
						userFriendlyMessage = 'Authentication failed. Invalid log-in or API key.';
					} else if (response.status === 403) {
						userFriendlyMessage = 'Access forbidden. Please check your API key permissions.';
					} else if (response.status === 404) {
						userFriendlyMessage = 'Backend endpoint not found. Please check your backend configuration.';
					} else if (response.status === 429) {
						userFriendlyMessage = 'Rate limit exceeded. Please wait before trying again. If the problem persists, please open a thread at https://community.lotas.ai/.';
					} else if (response.status >= 500) {
						userFriendlyMessage = 'Backend server error. Please try again later. If the problem persists, please open a thread at https://community.lotas.ai/.';
					} else {
						userFriendlyMessage = `HTTP ${response.status} error from backend server`;
					}
				}
				
				const error = new Error(userFriendlyMessage);
				(error as any).httpStatus = response.status;
				throw error;
			}

			await this.handleStreamingResponse(response, onData, onError, onComplete);
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				onComplete();
			} else {
				onError(error instanceof Error ? error : new Error('Unknown error occurred'));
			}
		} finally {
			this.activeAbortController = undefined;
		}
	}

	private async handleStreamingResponse(
		response: Response,
		onData: (data: StreamData) => void,
		onError: (error: Error) => void,
		onComplete: () => void
	): Promise<void> {
		const parser = this.sseParser;
		const reader = response.body?.getReader();
		
		if (!reader) {
			onError(new Error('No response body available'));
			return;
		}

		const decoder = new TextDecoder();

		try {
			while (true) {
				const { done, value } = await reader.read();
				
				if (done) {
					break;
				}

				const chunk = decoder.decode(value, { stream: true });
				
				const events = parser.parse(chunk);
				
				for (const event of events) {
					if (event.type === 'data' && event.data) {
						const streamData = parser.handleDataLine(event.data);
						if (streamData) {
							onData(streamData);
							
							if (streamData.end_turn === true) {
								onComplete();
								return;
							}
						}
					}
				}
			}
			
			onComplete();
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				onComplete();
			} else {
				onError(error instanceof Error ? error : new Error('Streaming error occurred'));
			}
		} finally {
			reader.releaseLock();
		}
	}

	public cancelStreaming(): void {
		if (this.activeAbortController) {
			this.activeAbortController.abort();
			this.activeAbortController = undefined;
		}
	}

	public async cancelRequest(requestId: string): Promise<boolean> {
		if (!this.config) {
			throw new Error('Backend not configured');
		}

		if (!requestId || requestId.trim() === '') {
			throw new Error('Request ID is required for cancellation');
		}

		try {
			const url = new URL('/ai/cancel', this.config.url);
			url.searchParams.set('requestId', requestId.trim());

			const auth = await this.apiKeyManager.generateBackendAuth();
			if (!auth) {
				throw new Error('No API key configured. Please set the Rao API key in Erdos AI settings.');
			}

			const response = await fetch(url.toString(), {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${auth.api_key}`,
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				const result = await response.json();
				return result.message !== undefined;
			} else {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(`Cancel request failed: ${errorData.error || `HTTP ${response.status}`}`);
			}
		} catch (error) {
			throw new Error(`Failed to send cancellation request: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	public async getEnvironmentName(): Promise<string> {
		const config = await this.getBackendConfig();
		return BACKEND_ENVIRONMENTS[config.environment].name;
	}

	public async getUserProfile(): Promise<any> {
		const auth = await this.apiKeyManager.generateBackendAuth();
		if (!auth) {
			throw new Error('No API key configured. Please set the Rao API key in Erdos AI settings.');
		}
		if (!this.config) {
			throw new Error('Backend configuration not initialized');
		}
		const url = `${this.config.url}/api/user/profile`;

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${auth.api_key}`,
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`Profile request failed: ${response.status}`);
			}

			return await response.json();
		} catch (error: any) {
			throw new Error(`Failed to get user profile: ${error.message}`);
		}
	}

	public async getSubscriptionStatus(): Promise<any> {
		const auth = await this.apiKeyManager.generateBackendAuth();
		if (!auth) {
			throw new Error('No API key configured');
		}
		if (!this.config) {
			throw new Error('Backend configuration not initialized');
		}
		const url = `${this.config.url}/api/user/subscription-status`;

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${auth.api_key}`,
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`Subscription status request failed: ${response.status}`);
			}

			return await response.json();
		} catch (error: any) {
			console.error('Failed to get subscription status:', error);
			throw new Error(`Failed to get subscription status: ${error.message}`);
		}
	}

	public async generateConversationName(conversation: any[], provider?: string, model?: string): Promise<string | null> {
		const auth = await this.apiKeyManager.generateBackendAuth();
		if (!auth) {
			throw new Error('No API key configured');
		}
		if (!this.config) {
			throw new Error('Backend configuration not initialized');
		}

		const requestId = `conv_name_${Date.now()}_${Math.floor(Math.random() * 90000) + 10000}`;

		const contextData = {
			symbols_note: null,  
			user_rules: [],
			user_os_version: navigator.platform || 'unknown',
			user_workspace_path: '/',
			user_shell: 'bash',
			project_layout: '',
			last_function_was_edit_file: false
		};
		const requestBody = await this.buildRequestData('generate_conversation_name', conversation, provider || 'anthropic', null, null, requestId, contextData);

		const url = `${this.config.url}/ai/query`;

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'text/event-stream',
					'X-Rao-Security-Mode': 'standard',
					'X-Rao-Web-Search-Enabled': 'false'
				},
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				throw new Error(`Conversation name generation failed: ${response.status}`);
			}

			const responseText = await response.text();

			const lines = responseText.split('\n');
			
			for (const line of lines) {
				if (line.startsWith('data: ')) {
					try {
						const jsonData = line.substring(6);
						const eventData = JSON.parse(jsonData);

						if (eventData.isComplete || eventData.complete) {
							if (eventData.error) {
								return null; 
							}
							
							if (eventData.conversation_name) {
								return eventData.conversation_name;
							}
							
							if (eventData.response) {
								return eventData.response;
							}
							
							return null;
						}
					} catch (parseError) {
					}
				}
			}
			
			throw new Error('No valid conversation_name found in SSE response');
		} catch (error: any) {
			console.error('Failed to generate conversation name:', error);
			throw error;
		}
	}

	public sendBackgroundSummarizationRequest(
		conversationPortion: ConversationMessage[],
		targetQueryNumber: number,
		previousSummary: any | null,
		requestId: string,
		onComplete: (result: { success: boolean; summary?: string; error?: string }) => void
	): void {
		(async () => {
			try {
				const auth = await this.apiKeyManager.generateBackendAuth();
				if (!auth) {
					throw new Error('No API key configured for background summarization');
				}

				const sorted_conversation = conversationPortion.sort((a, b) => (a.id || 0) - (b.id || 0));
				
				const requestBody = {
					request_type: "summarize_conversation",
					conversation: sorted_conversation,
					provider: "openai",
					model: "gpt-4.1-mini",
					request_id: requestId,
					auth: auth,
					target_query_number: targetQueryNumber,
					previous_summary: previousSummary
				};

				this.processBackgroundSummarization(requestBody, requestId, onComplete);
			} catch (error) {
				onComplete({ 
					success: false, 
					error: `Failed to build summarization request: ${error instanceof Error ? error.message : 'Unknown error'}` 
				});
			}
		})();
	}

	private async processBackgroundSummarization(
		requestBody: any,
		requestId: string,
		onComplete: (result: { success: boolean; summary?: string; error?: string }) => void
	): Promise<void> {
		try {
			const config = await this.getBackendConfig();
						
			const response = await fetch(`${config.url}/ai/query`, {
				method: 'POST',
				mode: 'cors',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'X-Rao-Security-Mode': 'secure',
					'X-Rao-Web-Search-Enabled': 'false',
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				let userFriendlyMessage: string | null = null;
				
				try {
					if (errorText) {
						let errorData = null;
						
						if (errorText.includes('data: ')) {
							errorData = this.parseSSEErrorResponse(errorText);
						} else {
							errorData = JSON.parse(errorText);
						}
						
						if (errorData && errorData.error && typeof errorData.error === 'object') {
							const nestedError = errorData.error;
							if (nestedError.user_message) {
								userFriendlyMessage = nestedError.user_message;
							} else if (nestedError.error_message) {
								userFriendlyMessage = nestedError.error_message;
							} else if (nestedError.message) {
								userFriendlyMessage = nestedError.message;
							}
						}
					}
				} catch (e) {
				}
				
				const finalErrorMessage = userFriendlyMessage || `Summarization request failed: ${response.status} ${response.statusText} - ${errorText}`;
				onComplete({ 
					success: false, 
					error: finalErrorMessage
				});
				return;
			}

			let accumulatedSummary = '';
			
			await this.handleStreamingResponse(
				response,
				(streamData) => {
					if (streamData.delta) {
						accumulatedSummary += streamData.delta;
					}
				},
				(error) => {
					onComplete({ 
						success: false, 
						error: `Background summarization error: ${error.message}` 
					});
				},
				() => {
					onComplete({ 
						success: true, 
						summary: accumulatedSummary 
					});
				}
			);
			
		} catch (error) {
			onComplete({ 
				success: false, 
				error: `Failed to start background summarization: ${error instanceof Error ? error.message : 'Unknown error'}` 
			});
		}
	}

	public async getAvailableModels(): Promise<string[]> {
		return ['claude-sonnet-4-20250514', 'gpt-5-mini'];
	}
}
