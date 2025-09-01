/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFunctionMessageManager } from '../common/functionMessageManager.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { ISearchReplaceCommandHandler } from '../../erdosAiCommands/common/searchReplaceCommandHandler.js';
import { IMessageIdManager } from '../../erdosAiConversation/common/messageIdManager.js';
import { Event, Emitter } from '../../../../base/common/event.js';


export class FunctionMessageManager extends Disposable implements IFunctionMessageManager {
	readonly _serviceBrand: undefined;

	private readonly _onMessageAdded = this._register(new Emitter<any>());
	readonly onMessageAdded: Event<any> = this._onMessageAdded.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@ISearchReplaceCommandHandler private readonly searchReplaceCommandHandler: ISearchReplaceCommandHandler,
		@IMessageIdManager private readonly messageIdManager: IMessageIdManager
	) {
		super();
	}

	isStreamingFunction(functionName: string): boolean {
		return ['run_console_cmd', 'run_terminal_cmd', 'search_replace'].includes(functionName);
	}

	isSimpleFunction(functionName: string): boolean {
		const simpleFunctions = ['list_dir', 'grep_search', 'read_file', 'view_image', 'search_for_file'];
		return simpleFunctions.includes(functionName);
	}

	isFunctionOutputFailure(functionName: string, output: string): boolean {
		if (functionName === 'search_replace') {
			return output.includes('old_string was not found') || 
				   output.includes('old_string does not exist') ||
				   output.includes('similar content matches') ||
				   output.includes('Error:') ||
				   output.includes('Missing required arguments');
		} else if (functionName === 'delete_file') {
			return output.includes('could not be found');
		}
		return false;
	}

	generateFunctionCallDisplayMessage(functionCall: any): string {
		const functionName = functionCall.name;
		let args: any = {};
		
		try {
			args = typeof functionCall.arguments === 'string' 
				? JSON.parse(functionCall.arguments) 
				: functionCall.arguments;
		} catch (e) {
			// If parsing fails, use empty args
		}

		switch (functionName) {
			case 'read_file':
				const filename = args.filename ? this.getBasename(args.filename) : 'unknown';
				let lineInfo = '';
				if (args.should_read_entire_file) {
					lineInfo = ' (1-end)';
				} else if (args.start_line_one_indexed && args.end_line_one_indexed_inclusive) {
					lineInfo = ` (${args.start_line_one_indexed}-${args.end_line_one_indexed_inclusive})`;
				}
				return `Read ${filename}${lineInfo}`;

			case 'list_dir':
				const path = args.relative_workspace_path || '.';
				const displayPath = path === '.' ? 'current directory' : path;
				return `Listed content of ${displayPath}`;

			case 'grep_search':
				const pattern = args.query || 'unknown';
				const displayPattern = pattern.length > 50 ? pattern.substring(0, 50) + '...' : pattern;
				return `Searched pattern "${displayPattern}"`;

			case 'view_image':
				const imagePath = args.image_path ? this.getBasename(args.image_path) : 'unknown';
				return `Viewed image ${imagePath}`;

			case 'search_for_file':
				const searchQuery = args.query || 'unknown';
				return `Searched for files matching "${searchQuery}"`;

			default:
				return functionName.replace(/_/g, ' ');
		}
	}

	private getBasename(filePath: string): string {
		if (!filePath) return '';
		return filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
	}

	async saveFunctionCallToConversationLog(functionCall: any, messageId: number, relatedToId: number): Promise<void> {
		try {
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				return;
			}

			// Create the function call object
			const functionCallObj = {
				name: functionCall.name,
				arguments: typeof functionCall.arguments === 'string' ? functionCall.arguments : JSON.stringify(functionCall.arguments),
				call_id: functionCall.call_id
			};

			// Save to conversation log using the conversation manager
			await this.conversationManager.addFunctionCallMessage(
				conversation.info.id,
				messageId,
				functionCallObj,
				relatedToId,
				false // Don't create pending output for simple functions
			);

		} catch (error) {
			this.logService.error('Failed to save function call to conversation log:', error);
		}
	}

	async createFunctionCallMessageWithCompleteArguments(
		functionName: string, 
		callId: string, 
		messageId: number, 
		completeArguments: string,
		requestId: string
	): Promise<{status?: string, data?: any} | void> {
		const conversation = this.conversationManager.getCurrentConversation();
		if (!conversation) {
			return;
		}

		const userMessages = conversation.messages.filter((m: any) => m.role === 'user');
		const relatedToId: number = userMessages.length > 0 ? userMessages[userMessages.length - 1].id : 0;

		try {
			// Create function call with complete arguments (like RAO does on completion)
			const functionCall = {
				name: functionName,
				arguments: completeArguments, // Complete accumulated JSON
				call_id: callId
			};

			// Get preallocated ID for the pending function_call_output (like Rao does)
			const pendingOutputId = this.messageIdManager.getPreallocatedMessageId(callId, 2);

			await this.conversationManager.addFunctionCallMessage(
				conversation.info.id,
				messageId,
				functionCall,
				relatedToId,
				true,
				pendingOutputId,
				requestId  // Pass request_id for widget operations (like Rao)
			);
			
			
			// For search_replace operations, run validation and diff computation (like Rao's handle_search_replace)
			if (functionName === 'search_replace') {
				const validationResult = await this.searchReplaceCommandHandler.validateAndProcessSearchReplace(functionCall, messageId, relatedToId, requestId);
				
				// If validation failed, return continue_silent status (like console/terminal accept methods)
				if (!validationResult.success) {
					
					// RETURN status to orchestrator (like console/terminal accept methods do)
					return {
						status: 'continue_silent',
						data: {
							message: validationResult.errorMessage,
							related_to_id: relatedToId,
							request_id: requestId
						}
					};
				}
				
				// If validation succeeded, return pending status - widget update will be fired by the main service
				
				// Return pending status to indicate waiting for user interaction (like console/terminal)
				return {
					status: 'pending',
					data: {
						message: 'Search replace operation ready for user approval',
						related_to_id: relatedToId,
						request_id: requestId
					}
				};
			}
			
			// Notify UI so conversation log gets updated
			// TODO: Add event firing capability to this service
			// this._onMessageAdded.fire(added);
		} catch (error) {
			this.logService.error('Failed to create function call message with complete arguments:', error);
		}
	}
}

