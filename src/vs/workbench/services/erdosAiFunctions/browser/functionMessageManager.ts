/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
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

	// Interactive functions require user input/approval
	isInteractiveFunction(functionName: string): boolean {
		const interactiveFunctions = ['run_console_cmd', 'run_terminal_cmd', 'search_replace', 'delete_file', 'run_file'];
		return interactiveFunctions.includes(functionName);
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
			
		} catch (error) {
			this.logService.error('Failed to create function call message with complete arguments:', error);
		}
	}
}

