/*
 * Copyright (C) 2025 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionHandler, FunctionCall, NormalizedFunctionCall, FunctionResult, CallContext, FunctionCallArgs } from '../common/functionTypes.js';
import { GrepSearchHandler, SearchForFileHandler, ListDirectoryHandler } from '../handlers/searchOperationsHandlers.js';
import { ImageHandler } from '../handlers/imageOperationsHandlers.js';
import { ReadFileHandler, DeleteFileHandler, RunFileHandler } from '../handlers/fileOperationsHandlers.js';
import { ISearchReplaceCommandHandler } from '../../erdosAiCommands/common/searchReplaceCommandHandler.js';
import { RetrieveDocumentationHandler } from '../handlers/documentationOperationsHandlers.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFunctionCallService } from '../common/functionCallService.js';
import { ILogService } from '../../../../platform/log/common/log.js';

// Main function call handler that routes function calls to specific handlers
export class FunctionCallHandler extends Disposable implements IFunctionCallService {
	readonly _serviceBrand: undefined;
	private handlers: Map<string, FunctionHandler> = new Map();

	constructor(
		@ILogService private readonly logService: ILogService,
		@ISearchReplaceCommandHandler private readonly searchReplaceCommandHandler: ISearchReplaceCommandHandler
	) {
		super();
		this.registerBuiltinHandlers();
	}

	async processFunctionCall(functionCall: FunctionCall, context: CallContext): Promise<FunctionResult> {
		try {
			const functionName = this.extractStringValue(functionCall.name);
			const trimmedFunctionName = functionName.trim();
			const callId = this.extractStringValue(functionCall.call_id);
			
			const extractedArguments = this.extractArguments(functionCall.arguments);
			
			const normalizedFunctionCall: NormalizedFunctionCall = {
				name: trimmedFunctionName,
				arguments: extractedArguments,
				call_id: callId,
				msg_id: functionCall.msg_id || ''
			};

			const validationResult = this.validateFunctionArguments(normalizedFunctionCall);
			
			if (!validationResult.isValid) {
				const errorResult = {
					type: 'error' as const,
					error_message: `The model made an invalid function call: ${validationResult.errorMessage}`,
				};
				
				return errorResult;
			}

			const handler = this.handlers.get(trimmedFunctionName);
			if (!handler) {
				this.logService.error(`Unknown function call: ${trimmedFunctionName}. Available functions: ${Array.from(this.handlers.keys()).join(', ')}`);
				
				const unknownResult = this.createUnknownFunctionResult(normalizedFunctionCall, context);
				return unknownResult;
			}

			const argsWithMetadata = {
				...normalizedFunctionCall.arguments,
				call_id: normalizedFunctionCall.call_id,
				msg_id: normalizedFunctionCall.msg_id
			};

			const result = await handler.execute(argsWithMetadata, context);
			const formattedResult = this.formatResult(result, normalizedFunctionCall);
			return formattedResult;

		} catch (error) {
			const errorResult = {
				type: 'error' as const,
				error_message: `Function call processing failed: ${error instanceof Error ? error.message : String(error)}`,
			};
			
			return errorResult;
		}
	}

	private createUnknownFunctionResult(functionCall: NormalizedFunctionCall, context: CallContext): FunctionResult {
		return {
			type: 'error',
			error_message: `Function '${functionCall.name}' is not implemented. Available functions: ${Array.from(this.handlers.keys()).join(', ')}`,
		};
	}

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

	private extractStringValue(value: any): string {
		if (Array.isArray(value)) {
			return String(value[0] || '');
		}
		return String(value || '');
	}

	private formatResult(result: FunctionResult, functionCall: NormalizedFunctionCall): FunctionResult {
		return result;
	}

	private registerBuiltinHandlers(): void {
		this.registerHandler('read_file', new ReadFileHandler());
		this.registerHandler('search_replace', {
			execute: async (args: any, context: any): Promise<any> => {
				return this.searchReplaceCommandHandler.executeSearchReplace(args, context);
			}
		} as FunctionHandler);
		this.registerHandler('delete_file', new DeleteFileHandler());
		this.registerHandler('run_file', new RunFileHandler());

		this.registerHandler('grep_search', new GrepSearchHandler());
		this.registerHandler('search_for_file', new SearchForFileHandler());
		this.registerHandler('list_dir', new ListDirectoryHandler());

		this.registerHandler('view_image', new ImageHandler());
		this.registerHandler('retrieve_documentation', new RetrieveDocumentationHandler());
	}

	private validateFunctionArguments(functionCall: NormalizedFunctionCall): {isValid: boolean; errorMessage?: string} {
		try {
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
				
				case 'view_image':
					if (!functionCall.arguments.image_path && !functionCall.arguments.image_index) {
						return { isValid: false, errorMessage: 'view_image requires either image_path or image_index parameter' };
					}
					break;
				
				default:
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

	registerHandler(name: string, handler: FunctionHandler): void {
		this.handlers.set(name, handler);
	}
}
