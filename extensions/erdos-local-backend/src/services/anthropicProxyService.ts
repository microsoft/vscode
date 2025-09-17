// Interface defined inline to avoid import issues
interface IAnthropicProxyService {
	processStreamingResponsesWithCallback(
		requestBody: string,
		user: any,
		originalHeaders: any,
		request_id: string,
		outputStream: any,
		originalRequest?: any
	): Promise<void>;
}

import { httpRequest } from './httpClient';
import { StreamingProxyHelper } from './streamingProxyHelper';

/**
 * Result of streaming operation
 */
enum StreamResult {
	SUCCESS = 'SUCCESS',
}

/**
 * State tracking for Anthropic streaming events
 */
interface AnthropicStreamState {
	accumulatedText: string;
	toolInputBuffers: Map<number, string>;
	toolBlocks: Map<number, any>;
	hasTextContent: boolean;
	hasToolUse: boolean;
	textStreamingComplete: boolean;
	usageData: any;
	sseBuffer: string;
	isAfterEditFile: boolean;
	userStreamingStarted: boolean; // Track if we've started streaming to user
	modifiedRequest: any;
	cancelled: boolean;
	cancelledMessageLogged: boolean;
	writeErrorLogged: boolean;
	contentBlockTypes: Map<number, string>;
	parallelFunctionCalls: Map<string, FunctionCallData>;
	hasParallelFunctionCalls: boolean;
}

/**
 * Data structure for tracking individual function calls in parallel execution
 */
interface FunctionCallData {
	functionName: string;
	callId: string;
	functionArguments: string;
	argumentsComplete: boolean;
	functionCallCompletionSent: boolean;
	contentBlockIndex: number;
}

export class AnthropicProxyService implements IAnthropicProxyService {
	private cancellationService: Set<string> = new Set();
	private streamingHelper = new StreamingProxyHelper();

	/**
	 * Process streaming requests to Anthropic API with proper SSE parsing
	 */
	async processStreamingResponsesWithCallback(
		requestBody: string,
		_user: any,
		_originalHeaders: any,
		request_id: string,
		outputStream: any,
		originalRequest?: any
	): Promise<void> {
		await this.processStreamingResponsesWithCallbackInternal(
			requestBody, _user, _originalHeaders, request_id, outputStream, originalRequest
		);
	}

	/**
	 * Internal method with original request parameter for retry logic
	 */
	private async processStreamingResponsesWithCallbackInternal(
		requestBody: string,
		_user: any,
		_originalHeaders: any,
		request_id: string,
		outputStream: any,
		originalRequest?: any
	): Promise<StreamResult> {
		
		try {
			const requestJson = JSON.parse(requestBody);
			
			// Create a new request for the Anthropic Messages API
			const anthropicRequest: any = {};
			
			// Get model from request
			const model = requestJson.model;
			
			anthropicRequest.model = model;
						
			anthropicRequest.messages = requestJson.messages;
			
			// Copy common parameters that might be present, preserving cache control structure
			if (requestJson.system) {
				if (Array.isArray(requestJson.system)) {
					// Preserve the array structure with cache_control for prompt caching
					anthropicRequest.system = requestJson.system;
				} else {
					// Simple string system prompt
					anthropicRequest.system = requestJson.system;
				}
			}
			if (requestJson.tools) {
				anthropicRequest.tools = requestJson.tools;
			}
			if (requestJson.tool_choice) {
				anthropicRequest.tool_choice = requestJson.tool_choice;
			}
			if (requestJson.max_tokens) {
				anthropicRequest.max_tokens = requestJson.max_tokens;
			} else {
				anthropicRequest.max_tokens = 8192;
			}
			if (requestJson.temperature) {
				anthropicRequest.temperature = requestJson.temperature;
			}
			if (requestJson.top_p) {
				anthropicRequest.top_p = requestJson.top_p;
			}
			if (requestJson.top_k) {
				anthropicRequest.top_k = requestJson.top_k;
			}
						
			// Clean up empty content messages before sending to Anthropic API
			if (anthropicRequest.messages) {
				const messages = anthropicRequest.messages;
				const cleanedMessages: any[] = [];
				
				for (const message of messages) {
					// Check if the message has a content field
					if (message.content) {
						const content = message.content;
						
						// Skip messages with empty content
						if (content === null || 
							(typeof content === 'string' && content === '') ||
							(Array.isArray(content) && content.length === 0)) {
							continue;
						}
					} else {
						// Skip messages with no content field
						continue;
					}
					
					// Keep messages with valid content
					cleanedMessages.push(message);
				}
				
				// Replace the original messages with cleaned ones
				anthropicRequest.messages = cleanedMessages;
			}
			
			// Enable streaming
			anthropicRequest.stream = true;
			
			// Get API key from byok_keys
			let anthropicApiKey = '';
			if (originalRequest && originalRequest.byok_keys && originalRequest.byok_keys.anthropic) {
				anthropicApiKey = originalRequest.byok_keys.anthropic;
			} else {
				this.streamingHelper.safeWriteToOutputStream(outputStream,
					this.streamingHelper.createErrorEvent(request_id, 'Anthropic API key not found. Please configure your API key in settings.'));
				return StreamResult.SUCCESS;
			}
			
			const headers: Record<string, string> = {
				'x-api-key': anthropicApiKey,
				'Content-Type': 'application/json',
				'anthropic-version': '2023-06-01',
				'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14'
			};
			
			// Track streaming state across events
			const streamState: AnthropicStreamState = {
				accumulatedText: '',
				toolInputBuffers: new Map(),
				toolBlocks: new Map(),
				hasTextContent: false,
				hasToolUse: false,
				textStreamingComplete: false,
				usageData: null,
				sseBuffer: '',
				isAfterEditFile: false,
				userStreamingStarted: false,
				modifiedRequest: null,
				cancelled: false,
				cancelledMessageLogged: false,
				writeErrorLogged: false,
				contentBlockTypes: new Map(),
				parallelFunctionCalls: new Map(),
				hasParallelFunctionCalls: false
			};
			
			// Track last stream event time for timeout policy
			let lastStreamEventTime = Date.now();
			
			const response = await httpRequest('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers,
				body: JSON.stringify(anthropicRequest)
			});
			
			const stream = await response.body();
			
			// Process streaming response
			stream.on('data', (chunk: Buffer) => {
				try {
					// CRITICAL: Check for cancellation using shared flag instead of thread interruption
					if (this.cancellationService.has(request_id)) {
						streamState.cancelled = true;
						return;
					}
					
					// Update last stream event time
					lastStreamEventTime = Date.now();
					
					// Check if stream was cancelled before processing
					if (streamState.cancelled) {
						return;
					}
					
					this.processAnthropicSSEChunk(chunk.toString(), request_id, outputStream, streamState, originalRequest);
				} catch (error: any) {
					// Check if this is due to cancellation
					if (this.cancellationService.has(request_id)) {
						streamState.cancelled = true;
						return;
					}
					console.error('Error processing Anthropic chunk:', error.message);
					if (streamState.cancelled) {
						return; // Don't process errors if already cancelled
					}
				}
			});
			
			stream.on('error', (error: any) => {
				// CRITICAL FIX: Handle cancellation gracefully without errors
				// Connection reset errors are normal during user cancellation
				let isCancellation = false;
				const errorMessage = error.message;
				
				// Detect cancellation scenarios
				if (error.code === 'ECONNRESET' || 
					(errorMessage && (errorMessage.includes('Connection reset') || 
									  errorMessage.includes('Connection closed') ||
									  errorMessage.includes('cancelled')))) {
					isCancellation = true;
				}
				
				if (isCancellation) {
					// Cancellation is normal - just complete the stream silently
					streamState.cancelled = true;
					return;
				}
				
				// Only log and handle non-cancellation errors
				console.error('Stream error from Anthropic:', errorMessage, error);
				try {
					let finalErrorMessage = 'Stream error: ' + errorMessage;
					
					// Handle specific HTTP status codes if available
					if (error.status) {
						const statusCode = error.status;
						
						if (statusCode === 400) {
							finalErrorMessage = 'Invalid request to Anthropic API (400 Bad Request)';
						} else if (statusCode === 401) {
							finalErrorMessage = 'Authentication failed with Anthropic API (401 Unauthorized)';
						} else if (statusCode === 429) {
							finalErrorMessage = 'Rate limit exceeded for Anthropic API (429 Too Many Requests)';
						} else if (statusCode === 500) {
							finalErrorMessage = 'Anthropic API server error (500 Internal Server Error)';
						} else if (statusCode === 529) {
							finalErrorMessage = "Anthropic's API is temporarily overloaded. Please wait a moment and try again or use a different model provider from the Settings (gear icon).";
						} else {
							finalErrorMessage = `HTTP error ${statusCode} from Anthropic API`;
						}
					}
					
					this.streamingHelper.safeWriteToOutputStream(outputStream,
						this.streamingHelper.createErrorEvent(request_id, finalErrorMessage));
				} catch (e: any) {
					console.error('Could not send error to client:', e.message);
				}
			});
			
			stream.on('end', () => {
				// CRITICAL FIX: Don't process completion if stream was cancelled
				if (streamState.cancelled) {
					return;
				}
				
				// Handle stream completion - check for retry needed
				try {
					this.handleStreamCompletion(request_id, outputStream, streamState);
				} catch (error: any) {
					console.error('Error in Anthropic stream completion:', error.message, error);
				}
			});
			
			// Wait for completion with 30-second inactivity timeout
			return new Promise((resolve) => {
				const checkTimeout = () => {
					const timeSinceLastEvent = Date.now() - lastStreamEventTime;
					if (timeSinceLastEvent > 30000) { // 30 seconds
						this.streamingHelper.safeWriteToOutputStream(outputStream,
							this.streamingHelper.createTimeoutEvent(request_id, 'Anthropic', 30));
						resolve(StreamResult.SUCCESS);
						return;
					}
					
					if (!streamState.cancelled) {
						setTimeout(checkTimeout, 1000);
					}
				};
				
				stream.on('end', () => {
					resolve(StreamResult.SUCCESS);
				});
				
				checkTimeout();
			});
			
		} catch (error: any) {
			// Only log if this is not a cancellation
			if (!(error.message === null)) {
				console.error('Error in Anthropic streaming:', error.message, error);
			}
			
			// Fix: Handle null message from InterruptedException during cancellation
			const errorMessage = error.message || 'Request interrupted';
			
			this.streamingHelper.safeWriteToOutputStream(outputStream,
				this.streamingHelper.createErrorEvent(request_id, 'Failed to process request: ' + errorMessage));
		}
		
		return StreamResult.SUCCESS;
	}

	/**
	 * Send a completed function call event for parallel function calling
	 */
	private sendCompletedFunctionCall(request_id: string, outputStream: any, 
									 streamState: AnthropicStreamState, functionCall: FunctionCallData,
									 originalRequest?: any): void {
		if (functionCall.functionName !== 'web_search') {
			// Use centralized helper to handle function call completion (like rao-backend does)
			this.streamingHelper.handleFunctionCallCompletion(request_id, outputStream, 
				functionCall.functionName, functionCall.callId, functionCall.functionArguments, 
				originalRequest, streamState, false);
		}
		
		streamState.hasToolUse = true;
	}

	/**
	 * Process Anthropic SSE chunks and convert to unified format
	 */
	private processAnthropicSSEChunk(chunk: string, request_id: string, 
									outputStream: any, state: AnthropicStreamState,
									originalRequest?: any): void {
		
		// CRITICAL FIX: Check for cancellation first - if cancelled, don't process any chunks
		if (state.cancelled) {
			return;
		}
		
		// Append new chunk to buffer
		state.sseBuffer += chunk;
		
		// Process complete events from buffer
		const bufferedData = state.sseBuffer;
		const events = bufferedData.split('\n\n');
		
		// Keep the last event in buffer if it might be incomplete
		// (unless the chunk ends with \n\n, indicating complete event)
		const chunkEndsWithCompleteEvent = chunk.endsWith('\n\n');
		const eventsToProcess = chunkEndsWithCompleteEvent ? events.length : events.length - 1;
		
		// Process complete events
		for (let i = 0; i < eventsToProcess; i++) {
			const eventBlock = events[i];
			if (!eventBlock.trim()) continue;
			
			this.processCompleteSSEEvent(eventBlock, request_id, outputStream, state, originalRequest);
		}
		
		// Update buffer with remaining incomplete event (if any)
		if (!chunkEndsWithCompleteEvent && events.length > 0) {
			state.sseBuffer = events[events.length - 1];
		} else {
			state.sseBuffer = '';
		}
	}

	/**
	 * Process a complete SSE event
	 */
	private processCompleteSSEEvent(eventBlock: string, request_id: string, 
								   outputStream: any, state: AnthropicStreamState,
								   originalRequest?: any): void {
		
		// CRITICAL FIX: Check for cancellation first - if cancelled, don't process any events
		if (state.cancelled) {
			return;
		}
		
		const lines = eventBlock.split('\n');
		let eventType: string | null = null;
		let eventData: string | null = null;

					for (const line of lines) {
			if (line.startsWith('event: ')) {
				eventType = line.substring(7).trim();
			} else if (line.startsWith('data: ')) {
				eventData = line.substring(6).trim();
			}
		}
		
		if (!eventType || !eventData) {
			return;
		}

		// Handle ping events
		if (eventType === 'ping') {
			return;
		}
		
		// Handle error events
		if (eventType === 'error') {
			try {
				const errorData = JSON.parse(eventData);
				let errorMessage = 'Anthropic API error';
				if (errorData.error && errorData.error.message) {
					errorMessage = errorData.error.message;
					
					// Replace Anthropic's overloaded error messages with user-friendly message
					if (errorMessage === 'Overloaded' || 
						errorMessage === 'The system encountered an overload and is unable to process the request at this time. Please try again later.') {
						errorMessage = "Anthropic's API is temporarily overloaded. Please wait a moment and try again or use a different model provider from the Settings (gear icon).";
					}
				}
				
				this.streamingHelper.safeWriteToOutputStream(outputStream,
					this.streamingHelper.createErrorEvent(request_id, errorMessage));
			} catch (error) {
				this.streamingHelper.safeWriteToOutputStream(outputStream,
					this.streamingHelper.createErrorEvent(request_id, 'Anthropic API error'));
			}
			return;
		}
		
		// Parse event data with error handling
		let data: any;
		try {
			data = JSON.parse(eventData);
		} catch (error) {
			// Skip malformed events instead of failing the entire stream
			return;
		}

		switch (eventType) {
			case 'message_start':
				// Initialize streaming state
				state.accumulatedText = '';
				state.toolInputBuffers.clear();
				state.toolBlocks.clear();
				state.hasTextContent = false;
				state.hasToolUse = false;
				state.textStreamingComplete = false;
				state.contentBlockTypes.clear();
				state.parallelFunctionCalls.clear();
				state.hasParallelFunctionCalls = false;
				
				if (data.message && data.message.usage) {
					state.usageData = data.message.usage;
				}
				break;

			case 'content_block_start':
				this.handleContentBlockStart(data, state, originalRequest);
				break;

			case 'content_block_delta':
				this.handleContentBlockDelta(data, request_id, outputStream, state, originalRequest);
				break;
				
			case 'content_block_stop':
				this.handleContentBlockStop(data, request_id, outputStream, state, originalRequest);
				break;
				
			case 'message_delta':
				// Handle final message metadata - this is where usage data comes in
				if (data.usage) {
					const messageDeltaUsage = data.usage;
					
					// CRITICAL FIX: Update only the output tokens from message_delta
					// Don't overwrite the complete usage data from message_start
					if (state.usageData && messageDeltaUsage.output_tokens) {
						// Update the output tokens in the existing usage data
						state.usageData.output_tokens = messageDeltaUsage.output_tokens;
						
						// Merge server tool use information from message_delta
						if (messageDeltaUsage.server_tool_use) {
							state.usageData.server_tool_use = messageDeltaUsage.server_tool_use;
						}
					} else {
						// Fallback: use message_delta data if we don't have message_start data
						state.usageData = messageDeltaUsage;
					}
				}
				
				// Handle stop_reason: "end_turn" - convert to same format as OpenAI end_turn function
				if (data.delta && data.delta.stop_reason) {
					const stopReason = data.delta.stop_reason;
					if (stopReason === 'end_turn') {
						// Complete any text streaming first if needed
						// Always send completion if we have accumulated text, even if textStreamingComplete is already true
						// This handles the case where message_stop was processed before end_turn
						if (state.hasTextContent && state.accumulatedText.length > 0) {
							if (!this.streamingHelper.safeWriteToOutputStream(outputStream, 
								this.streamingHelper.createTextCompleteEvent(request_id, state.accumulatedText))) {
								return;
							}
							state.textStreamingComplete = true;
						}
						
						if (!this.streamingHelper.safeWriteToOutputStream(outputStream, 
							this.streamingHelper.createEndTurnEvent(request_id))) {
							return;
						}
					}
				}
				break;

			case 'message_stop':
				this.handleMessageStop(request_id, outputStream, state);
				break;
		}
	}

	private handleContentBlockStart(data: any, state: AnthropicStreamState, _originalRequest?: any): void {
		if (!data.content_block || data.index === undefined) return;
		
		const contentBlock = data.content_block;
		const index = data.index;
		const blockType = contentBlock.type;
		
		// Track content block types
		state.contentBlockTypes.set(index, blockType);
		
		if (blockType === 'text') {
			state.hasTextContent = true;
		} else if (blockType === 'tool_use') {
			state.hasToolUse = true;
			state.toolBlocks.set(index, contentBlock);
			state.toolInputBuffers.set(index, '');
			
			// Track this function call in parallel map
			if (contentBlock.name && contentBlock.id) {
				const functionName = contentBlock.name;
				const callId = contentBlock.id;
				
				if (!state.parallelFunctionCalls.has(callId)) {
					state.parallelFunctionCalls.set(callId, {
						functionName,
						callId,
						functionArguments: '',
						argumentsComplete: false,
						functionCallCompletionSent: false,
						contentBlockIndex: index
					});
					state.hasParallelFunctionCalls = true;
				}
			}
		} else if (blockType === 'server_tool_use') {
			// Handle web search tool use - this is when Claude decides to search
			if (contentBlock.name && contentBlock.name === 'web_search') {                
				// Store the web search tool use block for later processing
				state.toolBlocks.set(index, contentBlock);
				state.toolInputBuffers.set(index, '');
			}
		} else if (blockType === 'web_search_tool_result') {
			// Handle web search results
			if (contentBlock.tool_use_id) {
				// Store the web search result block for processing
				state.toolBlocks.set(index, contentBlock);
			}
		}
	}

	private handleContentBlockDelta(data: any, request_id: string, 
								   outputStream: any, state: AnthropicStreamState,
								   _originalRequest?: any): void {
		// Check for cancellation first - if cancelled, don't process any deltas
		if (state.cancelled) {
			return;
		}
		
		if (!data.delta || data.index === undefined) return;
		
		const delta = data.delta;
		const index = data.index;
		const deltaType = delta.type;
		
		if (deltaType === 'text_delta' && delta.text) {
			// Handle text streaming
			const text = delta.text;
			
			// Add text to accumulated buffer
			state.accumulatedText += text;
			
			// Already started streaming to user, continue streaming this delta
			state.userStreamingStarted = true;
			if (!this.streamingHelper.safeWriteToOutputStream(outputStream, 
				this.streamingHelper.createTextDeltaEvent(request_id, text))) {
				state.cancelled = true;
				return;
			}
			// If neither check performed nor streaming started, just buffer without sending to user
			
		} else if (deltaType === 'input_json_delta' && delta.partial_json) {
			// Handle tool input streaming (accumulate partial JSON)
			const partialJson = delta.partial_json;
			if (state.toolInputBuffers.has(index)) {
				const currentBuffer = state.toolInputBuffers.get(index) || '';
				state.toolInputBuffers.set(index, currentBuffer + partialJson);
				
				const toolBlock = state.toolBlocks.get(index);
				if (toolBlock && toolBlock.id) {
					const callId = toolBlock.id;
					
					// Use parallel function call system
					if (state.parallelFunctionCalls.has(callId)) {
						const functionCall = state.parallelFunctionCalls.get(callId)!;
						functionCall.functionArguments += partialJson;
						
						// Stream function arguments as deltas for streaming functions
						if (['search_replace', 'run_console_cmd', 'run_terminal_cmd'].includes(functionCall.functionName)) {
							this.streamingHelper.sendStreamingFunctionDelta(request_id, outputStream, 
								functionCall.functionName, callId, partialJson, state);
						}
					}
				}
			}
		}
	}

	private handleContentBlockStop(data: any, request_id: string, 
		outputStream: any, state: AnthropicStreamState, originalRequest?: any): void {
		// Check for cancellation first - if cancelled, don't process any stops
		if (state.cancelled) {
			return;
		}
		
		if (data.index === undefined) return;
		
		const index = data.index;
		const blockType = state.contentBlockTypes.get(index);
		
		if (blockType === 'server_tool_use') {
			// Web search tool use completed - send the search query event
			if (state.toolBlocks.has(index) && state.toolInputBuffers.has(index)) {
				const toolBlock = state.toolBlocks.get(index);
				const completeInputJson = state.toolInputBuffers.get(index) || '';
				
				if (toolBlock && toolBlock.name === 'web_search') {
					const searchId = toolBlock.id || 'unknown';
					
					// Parse the search query for logging
					try {
						const searchQuery = JSON.parse(completeInputJson);
						const query = searchQuery.query || 'unknown';
						
						// Create web search call event in the same format as OpenAI for consistency
						const webSearchCall = {
							id: searchId,
							type: 'web_search_call',
							status: 'in_progress',
							query: query
						};
						
						// Send web search call event to conversation (same format as OpenAI)
						if (!this.streamingHelper.safeWriteToOutputStream(outputStream, 
							this.streamingHelper.createWebSearchCallEvent(request_id, JSON.stringify(webSearchCall)))) {
							return;
						}
						
					} catch (error) {
						console.error('Error parsing Anthropic web search query:', error);
					}
				}
			}
		} else if (blockType === 'web_search_tool_result') {
			// Web search results completed - send the results event
			if (state.toolBlocks.has(index)) {
				const toolBlock = state.toolBlocks.get(index);
				// Extract and process the web search results
				if (toolBlock && toolBlock.content && Array.isArray(toolBlock.content)) {                    
					// Send web search results event to conversation (same format as OpenAI)
					if (!this.streamingHelper.safeWriteToOutputStream(outputStream, 
						this.streamingHelper.createWebSearchResultsEvent(request_id, JSON.stringify(toolBlock)))) {
						return;
					}
				}
			}
		} else if (blockType === 'tool_use') {
			// Tool use block completed
			if (state.toolBlocks.has(index) && state.toolInputBuffers.has(index)) {
				const toolBlock = state.toolBlocks.get(index);
				const completeInputJson = state.toolInputBuffers.get(index) || '';
				
				// Complete text first if needed
				if (state.hasTextContent && !state.textStreamingComplete && state.userStreamingStarted) {
					if (!this.streamingHelper.safeWriteToOutputStream(outputStream, 
						this.streamingHelper.createTextCompleteEvent(request_id, state.accumulatedText))) {
						return;
					}
					state.textStreamingComplete = true;
				}
				
				if (toolBlock) {
					const callId = toolBlock.id;
					
					if (state.hasParallelFunctionCalls && state.parallelFunctionCalls.has(callId)) {
						const functionCall = state.parallelFunctionCalls.get(callId)!;
						
						// Update the function call data with complete arguments
						functionCall.functionArguments = completeInputJson;
						functionCall.argumentsComplete = true;
						
						// Send the completed function call immediately (like OpenAI does)
						this.sendCompletedFunctionCall(request_id, outputStream, state, functionCall, originalRequest);
					}
				}
			}
		}
	}

	private handleMessageStop(request_id: string, outputStream: any, 
							 state: AnthropicStreamState): void {
		// Check for cancellation first - if cancelled, don't send any completion events
		if (state.cancelled) {
			return;
		}
		
		// Send final completion event for pure text responses
		if (state.hasTextContent && !state.hasToolUse && !state.textStreamingComplete && state.userStreamingStarted) {
			// Try to write the completion event - if it fails, the connection is likely closed (cancellation)
			const writeSuccessful = this.streamingHelper.safeWriteToOutputStream(outputStream, 
				this.streamingHelper.createTextCompleteEvent(request_id, state.accumulatedText));
			if (!writeSuccessful) {
				state.cancelled = true;
				return;
			}
			
			state.textStreamingComplete = true;
		}
	}

	/**
	 * Handle stream completion and send final completion event
	 */
	private handleStreamCompletion(request_id: string, outputStream: any, state: AnthropicStreamState): void {
		// Check for cancellation first - if cancelled, don't send any completion events
		if (state.cancelled) {
			return;
		}
		
		// Only send completion events if user streaming has started
		if (!state.userStreamingStarted) {
			return;
		}
		
		// Complete any buffered text if needed
		if (state.hasTextContent && !state.textStreamingComplete && state.accumulatedText.length > 0) {
			this.streamingHelper.safeWriteToOutputStream(outputStream, 
				this.streamingHelper.createTextCompleteEvent(request_id, state.accumulatedText));
		}
		
	}
}