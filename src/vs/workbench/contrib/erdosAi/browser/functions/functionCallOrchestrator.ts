/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCallHandler } from './functionCallHandler.js';
import { FunctionCallBuffer } from './functionCallBuffer.js';
import { FunctionCall, FunctionResult, CallContext } from './types.js';

/**
 * Main orchestrator for function call processing
 */
export class FunctionCallOrchestrator {
	private functionCallHandler: FunctionCallHandler;
	private functionCallBuffer: FunctionCallBuffer;

	constructor(logService?: any) {
		this.logService = logService;
		this.functionCallHandler = new FunctionCallHandler(logService);
		this.functionCallBuffer = new FunctionCallBuffer();
	}

	private logService?: any; // Used for error logging in function processing


	/**
	 * Routes backend functions to OperationOrchestrator, local functions to FunctionCallHandler
	 */
	async processSingleFunctionCall(
		functionCall: FunctionCall,
		relatedToId: string | number,
		requestId: string,
		responseId?: string,
		messageId?: string | number,
		context?: CallContext
	): Promise<FunctionResult> {
		try {
			const functionName = this.extractFunctionName(functionCall);
			

			if (this.shouldRouteToBackend(functionName)) {
				// Backend operations removed - widget functionality disabled
				return {
					type: 'error',
					error_message: `Function ${functionName} not supported - widget functionality removed`,
					breakout_of_function_calls: true
				};
			}

			// Process local functions directly with handler
			// CRITICAL: Use provided context if available, otherwise this is broken
			if (!context) {
				throw new Error('CallContext is required for function call processing - cannot use stub methods');
			}
			const callContext: CallContext = context;

			const result = await this.functionCallHandler.processFunctionCall(functionCall, callContext);
			return result;

		} catch (error) {
			const errorMessage = `Function call orchestration failed: ${error instanceof Error ? error.message : String(error)}`;
			this.logService?.error('Function call orchestration error:', error);
			return {
				type: 'error',
				error_message: errorMessage,
				breakout_of_function_calls: true
			};
		}
	}

	/**
	 * Extract function name from function call
	 */
	private extractFunctionName(functionCall: FunctionCall): string {
		if (Array.isArray(functionCall.name)) {
			return functionCall.name[0] || '';
		}
		return functionCall.name || '';
	}

	/**
	 * Check if function should route to backend - all widget functionality removed
	 */
	private shouldRouteToBackend(functionName: string): boolean {
		// All widget functionality has been removed from Erdos AI
		return false;
	}
	/**
	 * Pre-allocated message ID removed - widget functionality disabled
	 */
	getPreallocatedMessageId(callId: string, index: number = 1): string | number | null {
		return null;
	}

	/**
	 * Get the function call buffer
	 * Provides access to the buffer for status checking and processing
	 */
	getFunctionCallBuffer(): FunctionCallBuffer {
		return this.functionCallBuffer;
	}

	/**
	 * First function call tracking removed - widget functionality disabled
	 */
	isFirstFunctionCallInParallelSet(callId: string): boolean {
		return false;
	}

	/**
	 * Check if there are buffered function calls
	 * Delegates to function call buffer
	 */
	hasBufferedFunctionCalls(): boolean {
		return this.functionCallBuffer.hasBufferedFunctionCalls();
	}

	/**
	 * Get buffer size
	 * Delegates to function call buffer
	 */
	getBufferSize(): number {
		return this.functionCallBuffer.getBufferSize();
	}

	/**
	 * Get function call handler (for advanced usage)
	 */
	getFunctionCallHandler(): FunctionCallHandler {
		return this.functionCallHandler;
	}

	/**
	 * Reset for new conversation
	 * Clears all state for a fresh conversation
	 */
	resetForNewConversation(): void {
		this.functionCallBuffer.clearBuffer();
		// Message ID manager removed - widget functionality disabled
	}

	/**
	 * Reset for new AI request
	 * Resets function call tracking for a new request while preserving conversation state
	 */
	resetForNewRequest(): void {
		// Message ID manager removed - widget functionality disabled
		// Don't clear buffer - it persists across requests in a conversation
	}
}




