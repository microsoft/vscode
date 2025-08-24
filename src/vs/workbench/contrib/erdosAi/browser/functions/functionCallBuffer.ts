/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCall } from './types.js';

/**
 * Function call data structure for buffering
 */
export interface FunctionCallData {
	function_call: FunctionCall;
	request_id: string;
	response_id?: string;
	message_id: string | number;
}

/**
 * Function call buffer for sequential processing of parallel function calls
 */
export class FunctionCallBuffer {
	private buffer: FunctionCallData[] = [];
	private isInitialized: boolean = false;

	/**
	 * Initialize the function call buffer
	 */
	initFunctionCallBuffer(): void {
		this.buffer = [];
		this.isInitialized = true;
	}

	/**
	 * Add function call data to buffer
	 * Returns the current buffer count
	 */
	addToFunctionCallBuffer(functionCallData: FunctionCallData): number {
		if (!this.isInitialized) {
			this.initFunctionCallBuffer();
		}

		this.buffer.push(functionCallData);
		return this.buffer.length;
	}

	/**
	 * Get all buffered function calls
	 * Returns copy of buffer to prevent external modification
	 */
	getBufferedFunctionCalls(): FunctionCallData[] {
		return [...this.buffer];
	}

	/**
	 * Get next function call from buffer (FIFO)
	 * Returns null if buffer is empty
	 */
	getNextFunctionCall(): FunctionCallData | null {
		if (this.buffer.length === 0) {
			return null;
		}
		return this.buffer.shift() || null;
	}

	/**
	 * Check if buffer has function calls
	 */
	hasBufferedFunctionCalls(): boolean {
		return this.buffer.length > 0;
	}

	/**
	 * Get current buffer size
	 */
	getBufferSize(): number {
		return this.buffer.length;
	}

	/**
	 * Clear the buffer
	 */
	clearBuffer(): void {
		this.buffer = [];
	}

	/**
	 * Check if buffer is initialized
	 */
	isBufferInitialized(): boolean {
		return this.isInitialized;
	}

	/**
	 * Process all buffered function calls sequentially
	 * This is the main processing loop for buffered function calls
	 */
	async processBufferedFunctionCalls(
		processor: (functionCallData: FunctionCallData) => Promise<any>
	): Promise<void> {
		while (this.hasBufferedFunctionCalls()) {
			const functionCallData = this.getNextFunctionCall();
			if (functionCallData) {
				try {
					await processor(functionCallData);
				} catch (error) {
					// Continue processing other function calls even if one fails
					// Error will be handled by the processor function
				}
			}
		}
	}

	/**
	 * Find function call data by call_id
	 */
	findFunctionCallByCallId(callId: string): FunctionCallData | null {
		return this.buffer.find(data => data.function_call.call_id === callId) || null;
	}

	/**
	 * Remove function call data by call_id
	 */
	removeFunctionCallByCallId(callId: string): boolean {
		const index = this.buffer.findIndex(data => data.function_call.call_id === callId);
		if (index !== -1) {
			this.buffer.splice(index, 1);
			return true;
		}
		return false;
	}
}

