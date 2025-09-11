/*
 * Copyright (C) 2025 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCallArgs, FunctionResult, CallContext } from '../common/functionTypes.js';
import { BaseFunctionHandler } from './baseFunctionHandler.js';

// Arguments for retrieve_documentation function call
export interface RetrieveDocumentationArgs extends FunctionCallArgs {
	query: string;
	language?: string;
	explanation?: string;
}

// Handler for retrieve_documentation function calls
export class RetrieveDocumentationHandler extends BaseFunctionHandler {
	async execute(args: RetrieveDocumentationArgs, context: CallContext): Promise<FunctionResult> {
		try {
			const query = args.query;
			const language = args.language;
			

			if (!query || query.trim().length === 0) {
				
				const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
				if (functionOutputId === null) {
					throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
				}

				const functionCallOutput = {
					id: functionOutputId,
					type: 'function_call_output' as const,
					call_id: args.call_id || '',
					output: 'Error: Query parameter is required and cannot be empty.',
					related_to: context.functionCallMessageId!,
					success: false,
					procedural: false
				};

				return {
					type: 'success',
					function_call_output: functionCallOutput,
					function_output_id: functionOutputId,
					status: 'continue_silent'
				};
			}

			// Get the help content using the same system as context service
			let helpContent: string;
			let isSuccess = false;
			
			try {
				if (context.helpContentService) {
					const normalizedLanguage = language ? (language.toLowerCase() === 'python' ? 'Python' : 'R') : undefined;
					
					helpContent = await context.helpContentService.getHelpAsMarkdown(query, undefined, normalizedLanguage);
					
					if (!helpContent || helpContent.trim().length === 0 || 
						helpContent.includes('No help topics found') || 
						(helpContent.includes('No') && helpContent.includes('runtime available'))) {
						
						helpContent = await this.getSearchFallback(query, normalizedLanguage, context);
						isSuccess = false;
					} else {
						isSuccess = true;
					}
				} else {
					helpContent = `${query} was not found and no similar results were found either.`;
					isSuccess = false;
				}
			} catch (error: any) {
				helpContent = `${query} was not found and no similar results were found either.`;
				isSuccess = false;
			}

			
			const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (functionOutputId === null) {
				throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
			}

			const functionCallOutput = {
				id: functionOutputId,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: helpContent,
				related_to: context.functionCallMessageId!,
				success: isSuccess,
				procedural: false
			};

			return {
				type: 'success',
				function_call_output: functionCallOutput,
				function_output_id: functionOutputId,
				status: 'continue_silent'
			};

		} catch (error: any) {
			
			const functionOutputId = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
			if (functionOutputId === null) {
				throw new Error(`Pre-allocated function call output ID not found for call_id: ${args.call_id}`);
			}

			const functionCallOutput = {
				id: functionOutputId,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: `Error: ${error.message || 'Unknown error'}`,
				related_to: context.functionCallMessageId!,
				success: false,
				procedural: false
			};

			return {
				type: 'success',
				function_call_output: functionCallOutput,
				function_output_id: functionOutputId,
				status: 'continue_silent'
			};
		}
	}

	/**
	 * Get search fallback message when exact query is not found
	 */
	private async getSearchFallback(query: string, language: string | undefined, context: CallContext): Promise<string> {
		
		try {
			if (!context.helpSearchService) {
				return `${query} was not found and no similar results were found either.`;
			}

			let searchResults: Array<{topic: string, languageId: string, languageName: string}> = [];

			if (language) {
				const langId = language.toLowerCase() === 'python' ? 'python' : 'r';
				
				const topics = await context.helpSearchService.searchRuntime(langId, query);
				
				searchResults = topics.map(topic => ({
					topic,
					languageId: langId,
					languageName: language
				}));
			} else {
				searchResults = await context.helpSearchService.searchAllRuntimes(query);
			}

			if (searchResults.length === 0) {
				return `${query} was not found and no similar results were found either.`;
			}

			const topResults = searchResults.slice(0, 10).map(result => result.topic);
			
			return `${query} was not found, but the following similar items were found in the documentation: ${topResults.join(', ')}`;

		} catch (error: any) {
			return `${query} was not found and no similar results were found either.`;
		}
	}
}
