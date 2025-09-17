// Interface defined inline to avoid import issues
interface IOpenAiProxyService {
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
 * Enhanced streaming state for streaming handling
 */
interface OpenAIStreamState {
	textContent: string;
	hasTextContent: boolean;
	hasFunctionCall: boolean;
	textStreamingComplete: boolean;
	// Diagnostics for delta timing
	firstDeltaAtMs: number;
	lastDeltaAtMs: number;
	deltaCount: number;

	// Parallel function call support
	parallelFunctionCalls: Map<string, FunctionCallData>;
	hasParallelFunctionCalls: boolean;
	userStreamingStarted: boolean; // Track if we've started streaming to user
	originalRequest: any | null; // Store original request
	modifiedRequest: any | null; // Store modified request for retry
	cancelled: boolean; // Track if stream was cancelled
	cancelledMessageLogged: boolean; // Track if we've already logged the cancellation message
	writeErrorLogged: boolean; // Track if we've already logged a write error to prevent spam
	functionCallCompletionSent: boolean; // Track if completion has been sent
}

/**
 * Data structure for tracking individual function calls in parallel execution
 */
interface FunctionCallData {
	functionName: string;
	callId: string;
	functionArguments: string;
	argumentsComplete: boolean;
	functionCallCompletionSent: boolean; // Track if completion has been sent for this call
}

export class OpenAiProxyService implements IOpenAiProxyService {
	private streamingHelper = new StreamingProxyHelper();

	// DO NOT CHANGE THIS URL. THIS IS THE CORRECT URL FOR THE OPENAI API. NOT chat/completions.
	private readonly OPENAI_API_URL = 'https://api.openai.com/v1/responses';

	/**
	 * Process streaming requests with direct OutputStream callback
	 * Used by the /ai/query endpoint for unified streaming
	 */
	async processStreamingResponsesWithCallback(
		requestBody: string,
		user: any,
		originalHeaders: any,
		request_id: string,
		outputStream: any,
		originalRequest?: any
	): Promise<void> {
		await this.processStreamingResponsesWithCallbackInternal(requestBody, user, originalHeaders, request_id, outputStream, originalRequest);
	}

	/**
	 * Internal method with original request parameter for retry logic
	 */
	private async processStreamingResponsesWithCallbackInternal(
		requestBody: string, 
		_user: any, 
		originalHeaders: any, 
		request_id: string, 
		outputStream: any, 
		originalRequest?: any
	): Promise<StreamResult> {
		// Parse the request body - it's already in the correct format from SessionAiApiService
		const requestBodyJson = JSON.parse(requestBody);
		
		// Get API key from dedicated BYOK keys field - no fallbacks
		const apiKey = requestBodyJson.byok_keys?.openai;
		if (!apiKey) {
			throw new Error('OpenAI API key not found in request. Please ensure BYOK is properly configured.');
		}
		
		// Get model from request
		const model = requestBodyJson.model;
		// Restore standard inactivity timeout logic (30s)
		const disableInactivityTimeout = false;
		const inactivityTimeoutMs = 30000;
		
		// The request is already properly formatted by SessionAiApiService, just add stream=true
		const responsesRequest = { ...requestBodyJson };
		delete responsesRequest.byok_keys; // Remove BYOK keys from request to OpenAI
		responsesRequest.stream = true; // Force streaming
		
		// Add temperature if present in the request
		if (requestBodyJson.temperature) {
			responsesRequest.temperature = requestBodyJson.temperature;
		}

		// Ensure GPT-5 models use low verbosity
		if (model && model.startsWith('gpt-5')) {
			responsesRequest.text = {
				verbosity: 'low'
			};
		}
		
		// Make the HTTP request
		const headers: Record<string, string> = {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		};
		
		// Copy beta headers if present
		if (originalHeaders && originalHeaders['OpenAI-Beta']) {
			headers['OpenAI-Beta'] = originalHeaders['OpenAI-Beta'];
		}
		
		// Enhanced streaming state
		const streamState: OpenAIStreamState = {
			textContent: '',
			hasTextContent: false,
			hasFunctionCall: false,
			textStreamingComplete: false,
			firstDeltaAtMs: -1,
			lastDeltaAtMs: -1,
			deltaCount: 0,
			parallelFunctionCalls: new Map(),
			hasParallelFunctionCalls: false,
			userStreamingStarted: false,
			originalRequest: originalRequest,
			modifiedRequest: null,
			cancelled: false,
			cancelledMessageLogged: false,
			writeErrorLogged: false,
			functionCallCompletionSent: false
		};
		
		// Track last stream event time for timeout policy
		let lastStreamEventTime = Date.now();
		// Diagnostics: track timings to distinguish network vs model latency
		let firstEventLogged = false;
		let sseBuffer = ''; // Buffer for incomplete SSE chunks (like Spring WebFlux does internally)

		const response = await httpRequest(this.OPENAI_API_URL, {
				method: 'POST',
				headers,
				body: JSON.stringify(responsesRequest)
			});

			if (!response.ok) {
				throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
			}

			// Process the streaming response
			const stream = await response.body();
			if (!stream) {
				throw new Error('No response stream available');
			}
			
			// Use promise to block until streaming completes
			await new Promise<void>((resolve, reject) => {
				const timeoutInterval = setInterval(() => {					
					const timeSinceLastEvent = Date.now() - lastStreamEventTime;
					if (!disableInactivityTimeout && timeSinceLastEvent > inactivityTimeoutMs) {
						const timeoutSeconds = Math.floor(inactivityTimeoutMs / 1000);
						this.streamingHelper.safeWriteToOutputStream(outputStream,
							this.streamingHelper.createTimeoutEvent(request_id, "OpenAI", timeoutSeconds));
						clearInterval(timeoutInterval);
						resolve();
					}
				}, 1000);

				stream.on('data', (chunk: Buffer) => {
					try {
						// Check for cancellation
						if (streamState.cancelled) {
							clearInterval(timeoutInterval);
							resolve();
							return;
						}
						
						// Compute timing metrics
						const nowMs = Date.now();
						lastStreamEventTime = nowMs;
						// Log first event TTFB (helps identify connectivity vs model latency)
						if (!firstEventLogged) {
							firstEventLogged = true;
						}
				
						// Parse the OpenAI chunk JSON to extract delta or response data
						const chunkStr = chunk.toString('utf8');
						sseBuffer += chunkStr;
						
						while (sseBuffer.includes('\n\n')) {
							const eventEnd = sseBuffer.indexOf('\n\n');
							const eventBlock = sseBuffer.substring(0, eventEnd);
							sseBuffer = sseBuffer.substring(eventEnd + 2);
							
							if (eventBlock.trim()) {
								const lines = eventBlock.split('\n');
								let eventData: string | null = null;
								
								for (const line of lines) {
									if (line.startsWith('data: ')) {
										eventData = line.substring(6).trim();
									}
								}
								
								if (eventData) {
									const jsonData = JSON.parse(eventData);
									// Process the clean JSON (exactly like rao-backend does)
									this.processStreamingChunk(jsonData, request_id, outputStream, streamState, originalRequest);
								}
							}
						}
						
					} catch (e) {
						// Check if this is due to cancellation
						if (streamState.cancelled) {
							clearInterval(timeoutInterval);
							resolve();
							return;
						}
					}
				});

				stream.on('error', (error: Error) => {
					clearInterval(timeoutInterval);
					// CRITICAL FIX: Handle cancellation gracefully without errors
					// Connection reset errors are normal during user cancellation
					let isCancellation = false;
					const errorMessage = error.message;
					
					// Detect cancellation scenarios
					if (errorMessage && 
						(errorMessage.includes("Connection reset") || 
						 errorMessage.includes("Connection closed") ||
						 errorMessage.includes("cancelled"))) {
						isCancellation = true;
					}
					
					if (isCancellation) {
						// Cancellation is normal - just complete the stream silently
						streamState.cancelled = true;
						resolve();
						return;
					}
					
					// Only log and handle non-cancellation errors
					try {
						let finalErrorMessage = "Stream error: " + errorMessage;
						
						this.streamingHelper.safeWriteToOutputStream(outputStream,
							this.streamingHelper.createErrorEvent(request_id, finalErrorMessage));
					} catch (e) {
						console.error("Could not send error to client:", (e as Error).message);
					}
					reject(error);
				});

				stream.on('end', () => {
					clearInterval(timeoutInterval);
					// CRITICAL FIX: Don't process completion if stream was cancelled
					if (streamState.cancelled) {
						resolve();
						return;
					}
					
					// Process any remaining content when stream completes
					try {
						this.handleStreamCompletion(request_id, outputStream, streamState);
					} catch (e) {
						console.error("Error in OpenAI stream completion:", (e as Error).message);
					}
					resolve();
				});
			});
		
		return StreamResult.SUCCESS;
	}

	/**
	 * Send a completed function call event for parallel function calling
	 */
	private sendCompletedFunctionCall(request_id: string, outputStream: any, 
									 streamState: OpenAIStreamState, functionCall: FunctionCallData): void {
		// Handle function call completion using helper
		if (!this.handleFunctionCallCompletion(request_id, outputStream, functionCall.functionName, 
			functionCall.callId, functionCall.functionArguments, streamState.originalRequest, streamState, 
			functionCall.functionCallCompletionSent)) {
			return;
		}
		
		if (functionCall.functionName === 'search_replace' || 
			functionCall.functionName === 'run_console_cmd' || functionCall.functionName === 'run_terminal_cmd') {
			functionCall.functionCallCompletionSent = true;
		}
		
		streamState.hasFunctionCall = true;
	}

	/**
	 * Handle stream completion - send any remaining content
	 */
	private handleStreamCompletion(request_id: string, outputStream: any, streamState: OpenAIStreamState): void {
		// Check for cancellation first - if cancelled, don't send any completion events
		if (streamState.cancelled) {
			return;
		}
		
		// If we have text content that hasn't been sent as complete, send it now
		if (streamState.hasTextContent && !streamState.textStreamingComplete && streamState.textContent.length > 0) {
			this.streamingHelper.safeWriteToOutputStream(outputStream, 
				this.streamingHelper.createTextCompleteEvent(request_id, streamState.textContent));
		}
	}

	/**
	 * Process individual streaming chunks and send appropriate SSE events
	 */
	private processStreamingChunk(
		chunkNode: any, 
		request_id: string, 
		outputStream: any, 
		streamState: OpenAIStreamState,
		_originalRequest?: any
	): void {
		
		// Check for cancellation first - if cancelled, don't process any chunks
		if (streamState.cancelled) {
			// Only log once to avoid spam (currently no logging, but keeping pattern consistent with Anthropic service)
			if (!streamState.cancelledMessageLogged) {
				streamState.cancelledMessageLogged = true;
			}
			return;
		}
				
		if (chunkNode.type) {
			const eventType = chunkNode.type;
			
			if (eventType === 'response.output_text.delta') {
				// Record delta timing without logging each delta
				const now = Date.now();
				if (streamState.firstDeltaAtMs < 0) streamState.firstDeltaAtMs = now;
				streamState.lastDeltaAtMs = now;
				streamState.deltaCount++;
				// Handle text streaming
				if (chunkNode.delta) {
					const delta = chunkNode.delta;
					
					// Check if this text delta has annotations (web search citations)
					if (chunkNode.annotations) {
						// Send annotations as separate events for debugging on R side
						if (!this.streamingHelper.safeWriteToOutputStream(outputStream, 
							this.streamingHelper.createAnnotationsEvent(request_id, chunkNode.annotations))) {
							return;
						}
					}
					
					// Add text to accumulated buffer
					streamState.textContent += delta;
					streamState.hasTextContent = true;
					
					streamState.userStreamingStarted = true;
					if (!this.streamingHelper.safeWriteToOutputStream(outputStream, 
						this.streamingHelper.createTextDeltaEvent(request_id, delta))) {
						return;
					}
					// If neither check performed nor streaming started, just buffer without sending to user
				}
			} else if (eventType === 'response.function_call_arguments.delta') {
				const now = Date.now();
				if (streamState.firstDeltaAtMs < 0) streamState.firstDeltaAtMs = now;
				streamState.lastDeltaAtMs = now;
				streamState.deltaCount++;
				if (chunkNode.delta) {
					const delta = chunkNode.delta;
					
					// Determine which function call this delta belongs to
					let targetCallId: string | null = null;
					if (chunkNode.call_id) {
						targetCallId = chunkNode.call_id;
					} else {
						// Use the most recent function call - get from parallel system
						for (const [callId] of streamState.parallelFunctionCalls) {
							targetCallId = callId;
							break; // Use the first (most recent) call
						}
					}
					
					// Use parallel function call system
					if (targetCallId != null && streamState.parallelFunctionCalls.has(targetCallId)) {
						const functionCall = streamState.parallelFunctionCalls.get(targetCallId)!;
						functionCall.functionArguments += delta;
						
						// Stream search_replace arguments as deltas
						if (functionCall.functionName === 'search_replace') {
							if (!this.streamingHelper.sendStreamingFunctionDelta(request_id, outputStream, "search_replace", targetCallId, delta, streamState)) {
								streamState.cancelled = true;
								return;
							}
						}
						// Stream console and terminal command arguments as deltas
						else if ((functionCall.functionName === 'run_console_cmd' || functionCall.functionName === 'run_terminal_cmd')) {
							if (!this.streamingHelper.sendStreamingFunctionDelta(request_id, outputStream, functionCall.functionName, targetCallId, delta, streamState)) {
								streamState.cancelled = true;
								return;
							}
						}
					}
				}
			} else if (eventType === 'response.output_item.added') {
				// Track function call and web search metadata when it starts
				if (chunkNode.item) {
					const item = chunkNode.item;
					if (item.type) {
						const itemType = item.type;
						
						if (itemType === 'web_search_call') {                            
							// Send web_search_call events to the conversation for processing
							if (!this.streamingHelper.safeWriteToOutputStream(outputStream, 
								this.streamingHelper.createWebSearchCallEvent(request_id, item))) {
								return;
							}
							
						} else if (itemType === 'function_call') {
							// Existing function call handling
							streamState.hasFunctionCall = true;
							
							const itemFunctionName = item.name || 'unknown';
							const itemCallId = item.call_id || 'unknown';
							
							// Track this function call in parallel map
							if (!streamState.parallelFunctionCalls.has(itemCallId)) {
								streamState.parallelFunctionCalls.set(itemCallId, {
									functionName: itemFunctionName,
									callId: itemCallId,
									functionArguments: '',
									argumentsComplete: false,
									functionCallCompletionSent: false
								});
								streamState.hasParallelFunctionCalls = true;
							}
						}
					}
				}
			} else if (eventType === 'response.function_call_arguments.done') {
				// Function call arguments complete - this is the PRIMARY event for function calls
				if (chunkNode.arguments !== undefined) {
					const completeArguments = chunkNode.arguments;
					
					// Determine which function call this completion belongs to
					let targetCallId: string | null = null;
					let functionName: string | null = null;
					
					if (chunkNode.call_id) {
						targetCallId = chunkNode.call_id;
					} else {
						// Use the most recent function call from parallel system
						for (const [callId] of streamState.parallelFunctionCalls) {
							targetCallId = callId;
							break; // Use the first (most recent) call
						}
						targetCallId = targetCallId || "unknown";
					}
					
					if (chunkNode.name) {
						functionName = chunkNode.name;
					} else {
						// Use stored function name from parallel system
						if (targetCallId && streamState.parallelFunctionCalls.has(targetCallId)) {
							functionName = streamState.parallelFunctionCalls.get(targetCallId)!.functionName;
						} else {
							functionName = "unknown";
						}
					}
					
					// Step 1: Complete any text streaming first (only if user streaming has started)
					if (!this.completeTextStreamingIfNeeded(request_id, outputStream, 
						streamState.textContent, streamState.hasTextContent, 
						streamState.textStreamingComplete, streamState.userStreamingStarted, streamState)) {
						return;
					}
					streamState.textStreamingComplete = true;
					
					// Step 2: Handle function call completion using helper
					if (!this.handleFunctionCallCompletion(request_id, outputStream, functionName || 'unknown', 
						targetCallId || 'unknown', completeArguments, streamState.originalRequest, streamState, 
						streamState.functionCallCompletionSent)) {
						return;
					}
					
					if (functionName === 'search_replace' || 
						functionName === 'run_console_cmd' || functionName === 'run_terminal_cmd') {
						streamState.functionCallCompletionSent = true;
					}
					
					// Mark that we've handled the function call
					streamState.hasFunctionCall = true;
					
					// Update parallel function call data for tracking purposes
					if (streamState.hasParallelFunctionCalls && targetCallId && streamState.parallelFunctionCalls.has(targetCallId)) {
						const functionCall = streamState.parallelFunctionCalls.get(targetCallId)!;
						functionCall.functionArguments = completeArguments;
						functionCall.argumentsComplete = true;
					}
				}
			} else if (eventType === 'response.completed') {
				// Response completed - only send completion if we haven't handled function call
				if (streamState.hasTextContent && !streamState.hasFunctionCall && !streamState.textStreamingComplete) {
					// Pure text response - complete it now (send even if userStreamingStarted is false as fallback)
					if (this.streamingHelper.safeWriteToOutputStream(outputStream, 
						this.streamingHelper.createTextCompleteEvent(request_id, streamState.textContent))) {
						streamState.textStreamingComplete = true;
					}
				}                
			} else if (eventType === 'response.output_item.done') {                
				if (chunkNode.item) {
					const item = chunkNode.item;
					// Only handle function call completion metadata, NOT sending function calls
					if (item.type === 'function_call') {
						// Complete text first if we have text content (only if user streaming has started)
						if (streamState.hasTextContent && !streamState.textStreamingComplete && streamState.userStreamingStarted) {
							if (!this.streamingHelper.safeWriteToOutputStream(outputStream, 
								this.streamingHelper.createTextCompleteEvent(request_id, streamState.textContent))) {
								return;
							}
							streamState.textStreamingComplete = true;
						}
						
						// Mark that we've handled a function call (metadata only)
						streamState.hasFunctionCall = true;
					}
				}
			} else if (eventType === 'response.function_call_output') {
				// Alternative function call format - handle similar to above
				if (chunkNode.function_call) {
					const functionCallNode = chunkNode.function_call;
					
					// Complete text first if we have text content (only if user streaming has started)
					if (!this.completeTextStreamingIfNeeded(request_id, outputStream, 
						streamState.textContent, streamState.hasTextContent, 
						streamState.textStreamingComplete, streamState.userStreamingStarted, streamState)) {
						return;
					}
					streamState.textStreamingComplete = true;
					
					// Extract function call details
					const callId = functionCallNode.call_id || 'unknown';
					
					// Handle parallel function calls
					if (streamState.hasParallelFunctionCalls && streamState.parallelFunctionCalls.has(callId)) {
						const functionCall = streamState.parallelFunctionCalls.get(callId)!;
						if (functionCall.argumentsComplete) {
							// Use the accumulated arguments from streaming
							this.sendCompletedFunctionCall(request_id, outputStream, streamState, functionCall);
						}
					}
					streamState.hasFunctionCall = true;
				} else {
					console.warn("function_call_output event but no function_call field");
				}
			} else if (eventType === 'response.content_part.done') {
			} else if (eventType === 'response.content_part.added') {
			} else if (eventType === 'response.in_progress') {
			} else if (eventType === 'response.created') {
				// Extract response_id for reasoning model chaining
				if (chunkNode.response?.id) {
					const responseId = chunkNode.response.id;
					// Send response_id to frontend for storage (similar to R frontend implementation)
					this.streamingHelper.safeWriteToOutputStream(outputStream, 
						this.streamingHelper.createResponseIdEvent(request_id, responseId));
				}
			} else if (eventType === 'response.output_text.done') {
				
				// Original completion logic for already-streaming content
				if (streamState.hasTextContent && !streamState.textStreamingComplete && streamState.userStreamingStarted) {
					// Only complete text if no function call is coming
					if (!streamState.hasFunctionCall) {
						if (this.streamingHelper.safeWriteToOutputStream(outputStream, 
							this.streamingHelper.createTextCompleteEvent(request_id, streamState.textContent))) {
							streamState.textStreamingComplete = true;
						}
					}
				}
			} else if (eventType === 'response.web_search_call.in_progress') {
				// Web search call is in progress - no action needed
			} else if (eventType === 'response.web_search_call.searching') {
				// Web search call is actively searching - no action needed
			} else if (eventType === 'response.web_search_call.completed') {
				// Web search call has completed - no action needed
			} else if (eventType === 'response.output_text.annotation.added') {
				// Text annotation (citation) has been added - no action needed
			} else {
				// Handle unknown event types
				console.warn("Unhandled OpenAI event type:", eventType);
			}
		} else {
			// Handle chunks without 'type' field
			console.warn("OpenAI chunk without 'type' field:", JSON.stringify(chunkNode));
		}
	}

	/**
	 * Handle function call completion with all the version-specific logic
	 * This consolidates the repetitive completion logic found in both OpenAI and Anthropic services
	 */
	private handleFunctionCallCompletion(
		request_id: string, 
		outputStream: any, 
		functionName: string, 
		callId: string, 
		functionArguments: string,
		originalRequest: any, 
		streamState: OpenAIStreamState, 
		functionCallCompletionSent: boolean
	): boolean {
		// Use centralized helper for function call completion (matches rao-backend exactly)
		return this.streamingHelper.handleFunctionCallCompletion(request_id, outputStream, 
			functionName, callId, functionArguments, originalRequest, streamState, functionCallCompletionSent);
	}

	/**
	 * Complete text streaming if needed
	 */
	private completeTextStreamingIfNeeded(
		request_id: string, 
		outputStream: any, 
		textContent: string,
		hasTextContent: boolean,
		textStreamingComplete: boolean, 
		userStreamingStarted: boolean,
		_streamState: OpenAIStreamState
	): boolean {
		if (hasTextContent && !textStreamingComplete && userStreamingStarted) {
			if (!this.streamingHelper.safeWriteToOutputStream(outputStream, this.streamingHelper.createTextCompleteEvent(request_id, textContent))) {
				return false;
			}
		}
		return true;
	}


}