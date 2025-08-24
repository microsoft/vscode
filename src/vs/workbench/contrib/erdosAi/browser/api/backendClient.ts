/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SSEParser, StreamData } from './streamingParser.js';
import {
	BackendConfig,
	BACKEND_ENVIRONMENTS,
	HealthResponse,
	BackendRequest,
	BackendResponse,
	TIMING_CONFIG,
	ConversationMessage
} from './types.js';
import { ApiKeyManager } from '../settings/apiKeyManager.js';
// Note: Using direct fetch with no-cors mode to bypass CORS restrictions in Electron

/**
 * Adapted for core Erdos environment
 */
export class BackendClient {
	private config?: BackendConfig;
	private activeAbortController?: AbortController;

	constructor(
		private readonly apiKeyManager: ApiKeyManager
	) {
		this.initializeDefaults();
	}

	/**
	 * Parse Server-Sent Events format to extract JSON data (like Rao's parse_sse_error_response)
	 * SSE format: "data: {json}\n\n"
	 */
	private parseSSEErrorResponse(responseText: string): any {
		if (!responseText || responseText.length === 0) {
			return null;
		}

		// Split by lines and look for "data: " lines
		const lines = responseText.split('\n');

		for (const line of lines) {
			if (line.startsWith('data: ')) {
				// Extract JSON from "data: " line
				const jsonText = line.substring(6); // Remove "data: " prefix

				// Try to parse as JSON
				try {
					return JSON.parse(jsonText);
				} catch (e) {
					// Continue to next line if parsing fails
				}
			}
		}

		return null;
	}

	/**
	 * Sets production as the default environment without checking localhost
	 */
	private initializeDefaults(): void {
		this.config = {
			url: BACKEND_ENVIRONMENTS.production.url,
			environment: 'production',
			timeout: TIMING_CONFIG.REQUEST_TIMEOUT
		};
	}

	/**
	 * Checks localhost:8080 first, falls back to production
	 */
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
			console.warn('Local RAO backend not available:', error);
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

	/**
	 * Only detects environment if explicitly requested via detectEnvironment()
	 * CRITICAL: Unlike the original implementation, this does NOT auto-detect to avoid CSP issues
	 */
	public async getBackendConfig(): Promise<BackendConfig> {
		if (!this.config) {
			// This should never happen since initializeDefaults() sets production config
			throw new Error('Backend configuration not initialized');
		}
		return this.config;
	}

	/**
	 * Reset environment detection to force re-detection
	 */
	public resetEnvironment(): void {
		this.initializeDefaults();
	}

	/**
	 * @returns Health status response
	 */
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
			// Use Rao's exact error message for backend connectivity issues
			throw new Error('Could not connect to backend server within 30 seconds. Please check your internet connectivity and try again. Often this is solved by just retrying. If the problem persists, please open a thread at https://community.lotas.ai/.');
		}
	}

	/**
	 * Build standardized request data for backend calls
	 */
	private async buildRequestData(
		requestType: 'ai_api_call' | 'generate_conversation_name' | 'summarize_conversation',
		messages: ConversationMessage[],
		provider: string,
		model: string | null,
		temperature: number | null,
		requestId: string,
		contextData?: any
	): Promise<BackendRequest> {
		// Get API key using proper authentication manager
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

		// Add summarization-specific fields if provided
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

	/**
	 * Determine if an error should be retried based on Rao's logic
	 */
	private isRetryableError(error: any, httpStatus?: number | null): boolean {
		// Handle HTTP status codes when available (based on actual rao-backend responses)
		if (httpStatus !== null && httpStatus !== undefined) {
			// Non-retryable HTTP status codes from rao-backend
			if ([400, 401, 402, 403, 404, 409].includes(httpStatus)) {
				return false;
			}
			
			// Retryable HTTP status codes from rao-backend
			if ([429, 500].includes(httpStatus)) {
				return true;
			}
		}
		
		// Handle structured error responses
		if (error && typeof error === 'object' && error.error && typeof error.error === 'object') {
			const errorType = error.error.error_type;
			if (errorType) {
				// Non-retryable subscription/billing errors (require user action)
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
				
				// Retryable error types
				if (errorType === 'SYSTEM_ERROR') {
					return true;
				}
				
				// MODEL_ERROR and UNKNOWN_ERROR - treat conservatively
				if (['MODEL_ERROR', 'UNKNOWN_ERROR'].includes(errorType)) {
					return false;
				}
			}
		}
		
		// For network errors, connection errors - these are typically retryable
		if (error instanceof Error) {
			const message = error.message.toLowerCase();
			if (message.includes('network') || 
				message.includes('connection') || 
				message.includes('timeout') ||
				message.includes('fetch')) {
				return true;
			}
		}
		
		// Default: don't retry unknown errors to be safe
		return false;
	}

	/**
	 * Send a streaming query to the backend
	 * @param messages Conversation messages
	 * @param provider AI provider (openai, anthropic, etc.)
	 * @param model Model name
	 * @param temperature Sampling temperature
	 * @param requestId Unique request identifier
	 * @param onData Callback for streaming data
	 * @param onError Callback for errors
	 * @param onComplete Callback for completion
	 * @returns Promise that resolves when streaming starts
	 */
	public async sendStreamingQuery(
		messages: ConversationMessage[],
		provider: string,
		model: string,
		temperature: number,
		requestId: string,
		contextData: any, // Context data including symbols_note, context_items, etc.
		onData: (data: StreamData) => void,
		onError: (error: Error) => void,
		onComplete: () => void
	): Promise<void> {
		// Implement retry logic exactly like Rao (3 attempts with increasing delays)
		const maxRetries = 3;
		let lastError: Error | null = null;
		
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				await this.sendStreamingQuerySingle(
					messages, provider, model, temperature, requestId, contextData,
					onData, onError, onComplete
				);
				return; // Success, no need to retry
			} catch (error) {
				lastError = error instanceof Error ? error : new Error('Unknown error');
				
				// Check if error is retryable
				const httpStatus = (error as any).httpStatus || null;
				if (!this.isRetryableError(error, httpStatus) || attempt >= maxRetries) {
					throw lastError;
				}
				
				// Wait before retrying (2s, 3s, 4s like Rao)
				const retryDelay = (2 + (attempt - 1)) * 1000;
				await new Promise(resolve => setTimeout(resolve, retryDelay));
			}
		}
		
		// If we get here, all retries failed
		throw lastError || new Error('The connection to the back-end failed and continued to fail on retries. Check your network connectivity, try the query again, or open a new conversation. If the error persists, please open a thread at https://community.lotas.ai/');
	}

	private async sendStreamingQuerySingle(
		messages: ConversationMessage[],
		provider: string,
		model: string,
		temperature: number,
		requestId: string,
		contextData: any, // Context data including symbols_note, context_items, etc.
		onData: (data: StreamData) => void,
		onError: (error: Error) => void,
		onComplete: () => void
	): Promise<void> {
		const config = await this.getBackendConfig();
		
		// Create abort controller for this request
		this.activeAbortController = new AbortController();
		
		// Build standardized request using centralized method
		const requestBody = await this.buildRequestData('ai_api_call', messages, provider, model, temperature, requestId, contextData);
		

		try {
			
			const response = await fetch(`${config.url}/ai/query`, {
				method: 'POST',
				mode: 'cors', // Need cors for streaming
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
				
				// Try to parse structured error response first (like Rao lines 706-745)
				try {
					if (errorText) {
						let errorData = null;
						
						// Check if this is SSE format (like Rao's parse_sse_error_response)
						if (errorText.includes('data: ')) {
							errorData = this.parseSSEErrorResponse(errorText);
						} else {
							// Try regular JSON parsing
							errorData = JSON.parse(errorText);
						}
						
						if (errorData) {
							// Extract structured error message - handle both direct and nested error structures
							if (errorData.error && typeof errorData.error === 'object') {
								// Structured error response with nested error object
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
								// Use raw response text if it looks meaningful (not HTML)
								userFriendlyMessage = errorText;
							}
						}
					}
				} catch (e) {
					// JSON parsing failed, continue with fallback messages
				}
				
				// Provide status-specific fallback messages if we don't have a good error message (exactly like Rao lines 752-765)
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
				// Add HTTP status for retry logic
				(error as any).httpStatus = response.status;
				throw error;
			}

			// Handle streaming response
			await this.handleStreamingResponse(response, onData, onError, onComplete);
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				// Request was cancelled
				onComplete();
			} else {
				onError(error instanceof Error ? error : new Error('Unknown error occurred'));
			}
		} finally {
			this.activeAbortController = undefined;
		}
	}

	/**
	 * Handle the streaming response from the backend
	 * @param response Fetch response object
	 * @param onData Callback for streaming data
	 * @param onError Callback for errors
	 * @param onComplete Callback for completion
	 */
	private async handleStreamingResponse(
		response: Response,
		onData: (data: StreamData) => void,
		onError: (error: Error) => void,
		onComplete: () => void
	): Promise<void> {
		const parser = new SSEParser();
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

				// Decode the chunk to text
				const chunk = decoder.decode(value, { stream: true });
				
				// Parse SSE events from the chunk
				const events = parser.parse(chunk);
				
				for (const event of events) {
					if (event.type === 'data' && event.data) {
						const streamData = parser.handleDataLine(event.data);
						if (streamData) {
							onData(streamData);
							
							// Only end stream on true end_turn, not intermediate 'done' events
							if (streamData.end_turn === true) {
								onComplete();
								return;
							}
						}
					}
				}
			}
			
			// Stream ended normally
			onComplete();
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				// Request was cancelled
				onComplete();
			} else {
				onError(error instanceof Error ? error : new Error('Streaming error occurred'));
			}
		} finally {
			reader.releaseLock();
		}
	}

	/**
	 * Cancel the current streaming request
	 */
	public cancelStreaming(): void {
		if (this.activeAbortController) {
			this.activeAbortController.abort();
			this.activeAbortController = undefined;
		}
	}

	/**
	 * Send a cancellation request to the backend 
	 * @param requestId The request ID to cancel
	 * @returns Promise that resolves when cancellation request is sent
	 */
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

			// Get auth header using the same pattern as other methods
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
				return result.message !== undefined; // Backend returns { message: "Query cancelled successfully", request_id: "..." }
			} else {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(`Cancel request failed: ${errorData.error || `HTTP ${response.status}`}`);
			}
		} catch (error) {
			throw new Error(`Failed to send cancellation request: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Send a non-streaming query to the backend
	 * @param messages Conversation messages
	 * @param provider AI provider
	 * @param model Model name
	 * @param temperature Sampling temperature
	 * @param requestId Unique request identifier
	 * @returns Backend response
	 */
	public async sendQuery(
		messages: ConversationMessage[],
		provider: string,
		model: string,
		temperature: number,
		requestId: string
	): Promise<BackendResponse> {
		const config = await this.getBackendConfig();
		
		// Build standardized request using centralized method  
		const requestBody = await this.buildRequestData('ai_api_call', messages, provider, model, temperature, requestId);

		try {
			const response = await fetch(`${config.url}/ai/query`, {
				method: 'POST',
				signal: AbortSignal.timeout(config.timeout),
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				let userFriendlyMessage: string | null = null;
				
				// Try to parse structured error response first (like Rao lines 706-745)
				try {
					if (errorText) {
						let errorData = null;
						
						// Check if this is SSE format (like Rao's parse_sse_error_response)
						if (errorText.includes('data: ')) {
							errorData = this.parseSSEErrorResponse(errorText);
						} else {
							// Try regular JSON parsing
							errorData = JSON.parse(errorText);
						}
						
						if (errorData) {
							// Extract structured error message - handle both direct and nested error structures
							if (errorData.error && typeof errorData.error === 'object') {
								// Structured error response with nested error object
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
								// Use raw response text if it looks meaningful (not HTML)
								userFriendlyMessage = errorText;
							}
						}
					}
				} catch (e) {
					// JSON parsing failed, continue with fallback messages
				}
				
				// Provide status-specific fallback messages if we don't have a good error message
				if (!userFriendlyMessage || userFriendlyMessage.trim().length === 0) {
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
						userFriendlyMessage = `Request failed: ${response.status} ${response.statusText} - ${errorText}`;
					}
				}
				
				throw new Error(userFriendlyMessage);
			}

			const data = await response.json();
			
			return {
				success: true,
				data: data
			};
		} catch (error) {
			return {
				success: false,
				error: {
					message: error instanceof Error ? error.message : 'Unknown error',
					type: 'network_error'
				}
			};
		}
	}

	/**
	 * Get the current environment name
	 */
	public async getEnvironmentName(): Promise<string> {
		const config = await this.getBackendConfig();
		return BACKEND_ENVIRONMENTS[config.environment].name;
	}

	/**
	 * Check if a request is currently active
	 */
	public isRequestActive(): boolean {
		return this.activeAbortController !== undefined;
	}

	/**
	 * @returns User profile data
	 */
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
			console.error('Failed to get user profile:', error);
			throw new Error(`Failed to get user profile: ${error.message}`);
		}
	}

	/**
	 * Get subscription status from backend
	 * @returns Subscription status data
	 */
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

	/**
	 * Generate conversation name using AI backend
	 * @param conversation First few messages from conversation
	 * @param provider AI provider to use (optional)
	 * @param model AI model to use (optional)
	 * @returns Generated conversation name
	 */
	public async generateConversationName(conversation: any[], provider?: string, model?: string): Promise<string | null> {
		const auth = await this.apiKeyManager.generateBackendAuth();
		if (!auth) {
			throw new Error('No API key configured');
		}
		if (!this.config) {
			throw new Error('Backend configuration not initialized');
		}

		const requestId = `conv_name_${Date.now()}_${Math.floor(Math.random() * 90000) + 10000}`;

		// Build standardized request using centralized method
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

			// Backend sends conversation name as SSE stream, need to parse it
			const responseText = await response.text();

			// Parse SSE format: each line starts with "data: " followed by JSON
			const lines = responseText.split('\n');
			
			for (const line of lines) {
				if (line.startsWith('data: ')) {
					try {
						const jsonData = line.substring(6); // Remove "data: " prefix (6 chars: "data: ")
						const eventData = JSON.parse(jsonData);

						// Check for completion flag first
						if (eventData.isComplete || eventData.complete) {
							// Check for error in SSE event (gracefully handle AI failures)
							if (eventData.error) {
								return null; 
							}
							
							// Check for conversation_name field
							if (eventData.conversation_name) {
								return eventData.conversation_name;
							}
							
							// Fallback to response field
							if (eventData.response) {
								return eventData.response;
							}
							
							// If we get here, AI returned empty content - return null gracefully
							return null;
						}
					} catch (parseError) {
						// Continue to next line
					}
				}
			}
			
			throw new Error('No valid conversation_name found in SSE response');
		} catch (error: any) {
			console.error('Failed to generate conversation name:', error);
			throw error;
		}
	}

	/**
	 * Send a background summarization request
	 * Uses same streaming pattern as main requests but runs in background
	 * @param conversationPortion Conversation messages for specific query
	 * @param targetQueryNumber Query number being summarized
	 * @param previousSummary Previous summary if available
	 * @param requestId Unique request identifier
	 * @param onComplete Callback when summarization completes with result
	 * @returns Promise that resolves when background processing starts
	 */
	public sendBackgroundSummarizationRequest(
		conversationPortion: ConversationMessage[],
		targetQueryNumber: number,
		previousSummary: any | null,
		requestId: string,
		onComplete: (result: { success: boolean; summary?: string; error?: string }) => void
	): void {
		// Start background processing in async wrapper
		(async () => {
			try {
				// Build request EXACTLY like rao does for summarize_conversation (lines 1234-1243)
				// Do NOT use buildRequestData - create minimal request directly
				const auth = await this.apiKeyManager.generateBackendAuth();
				if (!auth) {
					throw new Error('No API key configured for background summarization');
				}

				const sorted_conversation = conversationPortion.sort((a, b) => (a.id || 0) - (b.id || 0));
				
				const requestBody = {
					request_type: "summarize_conversation",
					conversation: sorted_conversation,  // Only the specific query portion
					provider: "openai",
					model: "gpt-4.1-mini", // Backend will override this anyway
					request_id: requestId,
					auth: auth,
					target_query_number: targetQueryNumber,
					previous_summary: previousSummary  // Include previous summary
				};

				// Start background streaming - this runs async like rao's background processes
				// CRITICAL: Don't await this - it should run in background without blocking
				this.processBackgroundSummarization(requestBody, requestId, onComplete);
			} catch (error) {
				onComplete({ 
					success: false, 
					error: `Failed to build summarization request: ${error instanceof Error ? error.message : 'Unknown error'}` 
				});
			}
		})();
	}

	/**
	 * Process background summarization using the same streaming logic as main requests
	 * Runs in background and calls completion callback when done
	 */
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
				
				// Try to parse structured error response first
				try {
					if (errorText) {
						let errorData = null;
						
						// Check if this is SSE format
						if (errorText.includes('data: ')) {
							errorData = this.parseSSEErrorResponse(errorText);
						} else {
							// Try regular JSON parsing
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
					// JSON parsing failed, use raw error text
				}
				
				const finalErrorMessage = userFriendlyMessage || `Summarization request failed: ${response.status} ${response.statusText} - ${errorText}`;
				onComplete({ 
					success: false, 
					error: finalErrorMessage
				});
				return;
			}

			// Use same streaming logic as main requests
			let accumulatedSummary = '';
			
			await this.handleStreamingResponse(
				response,
				(streamData) => {
					// ONLY use delta accumulation exactly like rao does
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
					// Streaming complete - return the accumulated summary
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

	/**
	 * @returns Array of available model names
	 */
	public async getAvailableModels(): Promise<string[]> {
		return ['claude-sonnet-4-20250514', 'gpt-5-mini'];
	}
}
