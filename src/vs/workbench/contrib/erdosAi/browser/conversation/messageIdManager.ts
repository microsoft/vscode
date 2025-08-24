/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConversationVariableManager } from './conversationVariableManager.js';

/**

 * Replicates SessionAiAPI.R lines 3004-3083 message ID pre-allocation logic
 */
export class MessageIdManager {
	
	constructor(
		private conversationVariableManager: ConversationVariableManager,
		private messageIdGenerator: () => number
	) {
	}

	/**

	 * Replicates SessionAiAPI.R lines 3005-3027
	 */
	private getFunctionMessageIdCount(functionName: string): number {
		// Simple non-interactive: function_call + function_call_output = 2 IDs
		const simpleFunctions = ['list_dir', 'grep_search', 'read_file', 'view_image', 'search_for_file'];
		
		// All interactive functions: function_call + function_call_output = 2 IDs
		// They show "Response pending..." until accepted/rejected, then update to show result
		const interactiveFunctions = ['run_console_cmd', 'run_terminal_cmd', 'delete_file', 'run_file', 'search_replace'];
		
		if (simpleFunctions.includes(functionName)) {
			return 2;
		} else if (interactiveFunctions.includes(functionName)) {
			return 2;
		} else {
			// Default for unknown functions
			return 2;
		}
	}

	/**

	 * Replicates SessionAiAPI.R lines 3029-3055
	 */
	preallocateFunctionMessageIds(functionName: string, callId: string): number {
		// Check if this call_id already has pre-allocated IDs
		const preallocatedIds = this.conversationVariableManager.getConversationVar('preallocated_message_ids', {});
		
		if (preallocatedIds[callId]) {
			// Already exists - return the first message ID from the existing set
			const existingIds = preallocatedIds[callId];
			return existingIds[0];
		}
		
		// Get the number of message IDs needed
		const idCount = this.getFunctionMessageIdCount(functionName);
		
		// Pre-allocate all needed message IDs
		const messageIds: number[] = [];
		for (let i = 0; i < idCount; i++) {
			messageIds.push(this.messageIdGenerator());
		}
		
		// Store them in conversation variables keyed by call_id
		preallocatedIds[callId] = messageIds;
		this.conversationVariableManager.setConversationVar('preallocated_message_ids', preallocatedIds);
		
		// Return the first message ID (for the function call itself)
		return messageIds[0];
	}

	/**

	 * Replicates SessionAiAPI.R lines 3057-3067
	 */
	getPreallocatedMessageId(callId: string, index: number = 1): number {
		const preallocatedIds = this.conversationVariableManager.getConversationVar('preallocated_message_ids', {});
		
		if (preallocatedIds[callId] && preallocatedIds[callId].length >= index) {
			return preallocatedIds[callId][index - 1]; // Convert to 0-based index
		}
		
		// Fallback - generate new ID if not found
		return this.messageIdGenerator();
	}

	/**

	 * Replicates SessionAiAPI.R lines 3069-3083
	 */
	isFirstFunctionCallInParallelSet(callId: string): boolean {
		// Track the first function call we encounter during this streaming session
		const firstFunctionCallId = this.conversationVariableManager.getConversationVar('first_function_call_id', null);
		
		if (!firstFunctionCallId) {
			// This is the first function call we've encountered - mark it and return TRUE
			this.conversationVariableManager.setConversationVar('first_function_call_id', callId);
			return true;
		} else {
			// Check if this call_id matches the first one we encountered
			return callId === firstFunctionCallId;
		}
	}

	/**
	 * Clear pre-allocated IDs for new conversation
	 */
	clearPreallocatedIds(): void {
		this.conversationVariableManager.setConversationVar('preallocated_message_ids', {});
		this.conversationVariableManager.setConversationVar('first_function_call_id', null);
	}

	/**
	 * Reset first function call tracking for new request
	 */
	resetFirstFunctionCallTracking(): void {
		this.conversationVariableManager.setConversationVar('first_function_call_id', null);
	}
}
