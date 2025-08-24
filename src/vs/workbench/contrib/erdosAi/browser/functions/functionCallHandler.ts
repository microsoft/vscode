/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionHandler, FunctionCall, FunctionResult, CallContext, NormalizedFunctionCall, FunctionCallArgs } from './types.js';
import { GrepSearchHandler, SearchForFileHandler, ListDirectoryHandler } from './searchOperations.js';
import { ImageHandler } from './miscOperations.js';
import { ReadFileHandler, SearchReplaceHandler, DeleteFileHandler } from './fileOperations.js';

/**
 * Main function call handler that routes function calls to specific handlers
 */
export class FunctionCallHandler {
	private handlers: Map<string, FunctionHandler> = new Map();
	private logService?: any;

	constructor(logService?: any) {
		this.logService = logService;
		this.registerBuiltinHandlers();
	}

	/**
	 * Register all built-in function handlers
	 */
	private registerBuiltinHandlers(): void {
		// File operations
		this.registerHandler('read_file', new ReadFileHandler());
		this.registerHandler('search_replace', new SearchReplaceHandler());
		this.registerHandler('delete_file', new DeleteFileHandler());

		// Search operations
		this.registerHandler('grep_search', new GrepSearchHandler());
		this.registerHandler('search_for_file', new SearchForFileHandler());
		this.registerHandler('list_dir', new ListDirectoryHandler());

		// Miscellaneous operations
		this.registerHandler('view_image', new ImageHandler());
		// NOTE: web_search is NOT a client-side function - it's a native backend tool
	}

	/**
	 * Register a custom function handler
	 */
	registerHandler(name: string, handler: FunctionHandler): void {
		this.handlers.set(name, handler);
	}

	/**
	 * Process a function call
	 */
	async processFunctionCall(functionCall: FunctionCall, context: CallContext): Promise<FunctionResult> {
		try {
			const functionName = this.extractStringValue(functionCall.name);
			const trimmedFunctionName = functionName.trim(); // Remove any leading/trailing whitespace
			const callId = this.extractStringValue(functionCall.call_id);
			
			// Create normalized function call (lines 2619-2624)
			const normalizedFunctionCall: NormalizedFunctionCall = {
				name: trimmedFunctionName,
				arguments: this.extractArguments(functionCall.arguments),
				call_id: callId,
				msg_id: functionCall.msg_id || ''
			};

			// Validate JSON arguments BEFORE processing (lines 2626-2649)
			const validationResult = this.validateFunctionArguments(normalizedFunctionCall);
			if (!validationResult.isValid) {
				return {
					type: 'error',
					error_message: `The model made an invalid function call: ${validationResult.errorMessage}`,
					breakout_of_function_calls: true
				};
			}

			// Route to specific handler (lines 2774-2797)
			const handler = this.handlers.get(trimmedFunctionName);
			if (!handler) {
							// Fallback for unknown function calls (lines 2798-2814)
			this.logService?.error(`Unknown function call: ${trimmedFunctionName}. Available functions: ${Array.from(this.handlers.keys()).join(', ')}`);
			return this.createUnknownFunctionResult(normalizedFunctionCall, context);
			}

			// CRITICAL: Inject call_id and msg_id into arguments so handlers can access them
			const argsWithMetadata = {
				...normalizedFunctionCall.arguments,
				call_id: normalizedFunctionCall.call_id,
				msg_id: normalizedFunctionCall.msg_id
			};

			console.log(`[FUNCTION_CALL_HANDLER] Executing ${trimmedFunctionName} with call_id: ${callId}`);

			// Execute the function handler
			const result = await handler.execute(argsWithMetadata, context);
			
			if (trimmedFunctionName === 'delete_file') {
				console.log(`[FUNCTION_CALL_HANDLER] delete_file result:`, result);
			}
			
			return this.formatResult(result, normalizedFunctionCall);

		} catch (error) {
			return {
				type: 'error',
				error_message: `Function call processing failed: ${error instanceof Error ? error.message : String(error)}`,
				breakout_of_function_calls: true
			};
		}
	}

	/**
	 * Lines 2566-2568: function_name <- if (is.list(function_call$name)) function_call$name[[1]] else function_call$name
	 */
	private extractStringValue(value: any): string {
		if (Array.isArray(value)) {
			return String(value[0] || '');
		}
		return String(value || '');
	}

	/**
	 * Extract and parse function arguments
	 * Lines 2620-2621: arguments = if (is.list(function_call$arguments)) function_call$arguments[[1]] else function_call$arguments
	 */
	private extractArguments(args: string | FunctionCallArgs): FunctionCallArgs {
		if (typeof args === 'string') {
			try {
				return JSON.parse(args);
			} catch (error) {
				throw new Error(`Invalid JSON in function arguments: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		
		if (Array.isArray(args)) {
			return args[0] || {};
		}
		
		return args || {};
	}

	/**
	 */
	private validateFunctionArguments(functionCall: NormalizedFunctionCall): { isValid: boolean; errorMessage?: string } {
		try {
			// Check if arguments is valid object
			if (!functionCall.arguments || typeof functionCall.arguments !== 'object') {
				return { isValid: false, errorMessage: 'Function arguments must be a valid object' };
			}

			switch (functionCall.name) {
				case 'grep_search':
					if (!functionCall.arguments.query) {
						return { isValid: false, errorMessage: 'grep_search requires query parameter' };
					}
					if (functionCall.arguments.case_sensitive === undefined || functionCall.arguments.case_sensitive === null) {
						return { isValid: false, errorMessage: 'grep_search requires case_sensitive parameter' };
					}
					break;
				
				case 'list_dir':
					if (!functionCall.arguments.relative_workspace_path) {
						return { isValid: false, errorMessage: 'list_dir requires relative_workspace_path parameter' };
					}
					break;
				
				case 'search_for_file':
					if (!functionCall.arguments.query) {
						return { isValid: false, errorMessage: `${functionCall.name} requires query parameter` };
					}
					break;
				
				// NOTE: web_search validation removed - it's a native backend tool, not client-side
				
				case 'view_image':
					if (!functionCall.arguments.image_path) {
						return { isValid: false, errorMessage: 'view_image requires image_path parameter' };
					}
					break;
			}

			return { isValid: true };
		} catch (error) {
			return { 
				isValid: false, 
				errorMessage: `Validation error: ${error instanceof Error ? error.message : String(error)}` 
			};
		}
	}

	/**
	 * Create result for unknown function calls
	 */
	private createUnknownFunctionResult(functionCall: NormalizedFunctionCall, context: CallContext): FunctionResult {
		// CRITICAL: Follow same pattern as other handlers - only return output text
		// Main service manages all ID allocation and replacement
		return {
			type: 'error',
			error_message: `Function '${functionCall.name}' is not implemented. Available functions: ${Array.from(this.handlers.keys()).join(', ')}`,
			breakout_of_function_calls: true
		};
	}

	/**
	 * Format function result (add any necessary post-processing)
	 * NOTE: ID management is now handled by main service, not handlers
	 */
	private formatResult(result: FunctionResult, functionCall: NormalizedFunctionCall): FunctionResult {
		// Handlers only return output text - main service manages all IDs
		return result;
	}

	/**
	 * Get list of registered function names
	 */
	getRegisteredFunctions(): string[] {
		return Array.from(this.handlers.keys());
	}

	/**
	 * Check if a function is registered
	 */
	isRegistered(functionName: string): boolean {
		return this.handlers.has(functionName);
	}
}