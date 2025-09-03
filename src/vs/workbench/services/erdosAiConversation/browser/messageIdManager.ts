/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IConversationVariableManager } from '../common/conversationVariableManager.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMessageIdManager } from '../common/messageIdManager.js';

export class MessageIdManager extends Disposable implements IMessageIdManager {
	readonly _serviceBrand: undefined;
	private messageIdGenerator?: () => number;
	private resetCounterCallback?: (maxId: number) => void;
	
	constructor(
		@IConversationVariableManager private conversationVariableManager: IConversationVariableManager
	) {
		super();
	}

	setMessageIdGenerator(generator: () => number): void {
		this.messageIdGenerator = generator;
	}
	
	setResetCounterCallback(callback: (maxId: number) => void): void {
		this.resetCounterCallback = callback;
	}

	private getFunctionMessageIdCount(functionName: string): number {
		const simpleFunctions = ['list_dir', 'grep_search', 'read_file', 'view_image', 'search_for_file'];
		
		const interactiveFunctions = ['run_console_cmd', 'run_terminal_cmd', 'delete_file', 'run_file', 'search_replace'];
		
		if (simpleFunctions.includes(functionName)) {
			return 2;
		} else if (interactiveFunctions.includes(functionName)) {
			return 2;
		} else {
			return 2;
		}
	}

	preallocateFunctionMessageIds(functionName: string, callId: string): number {
		if (!this.messageIdGenerator) {
			throw new Error('MessageIdGenerator not set');
		}
		
		const preallocatedIds = this.conversationVariableManager.getConversationVar('preallocated_message_ids', {});
		
		if (preallocatedIds[callId]) {
			const existingIds = preallocatedIds[callId];
			return existingIds[0];
		}
		
		const idCount = this.getFunctionMessageIdCount(functionName);
		
		const messageIds: number[] = [];
		for (let i = 0; i < idCount; i++) {
			messageIds.push(this.messageIdGenerator());
		}
		
		preallocatedIds[callId] = messageIds;
		this.conversationVariableManager.setConversationVar('preallocated_message_ids', preallocatedIds);
		
		return messageIds[0];
	}

	getPreallocatedMessageId(callId: string, index: number = 1): number {
		const preallocatedIds = this.conversationVariableManager.getConversationVar('preallocated_message_ids', {});
		
		if (preallocatedIds[callId] && preallocatedIds[callId].length >= index) {
			return preallocatedIds[callId][index - 1];
		}
		
		// If preallocation failed, something is wrong - generate fallback but log error
		return this.messageIdGenerator!();
	}

	isFirstFunctionCallInParallelSet(callId: string): boolean {
		const firstFunctionCallId = this.conversationVariableManager.getConversationVar('first_function_call_id', null);
		
		if (!firstFunctionCallId) {
			this.conversationVariableManager.setConversationVar('first_function_call_id', callId);
			return true;
		} else {
			return callId === firstFunctionCallId;
		}
	}

	getNextPreallocatedMessageId(callId: string, index: number): number {
		if (!this.messageIdGenerator) {
			throw new Error('MessageIdGenerator not set');
		}
		
		const preallocatedIds = this.conversationVariableManager.getConversationVar('preallocated_message_ids', {});
		
		if (preallocatedIds[callId] && preallocatedIds[callId].length >= index) {
			return preallocatedIds[callId][index - 1];
		}
		
		return this.messageIdGenerator!();
	}

	clearPreallocatedMessageIds(): void {
		this.conversationVariableManager.setConversationVar('preallocated_message_ids', {});
		this.conversationVariableManager.setConversationVar('first_function_call_id', null);
	}

	clearPreallocatedIds(): void {
		this.clearPreallocatedMessageIds();
	}

	resetFirstFunctionCallTracking(): void {
		this.conversationVariableManager.setConversationVar('first_function_call_id', null);
	}

	resetMessageIdCounterForConversation(conversation: any): void {
		try {
			let maxId = 0;
			
			// Check conversation messages for highest IDs
			if (conversation.messages && conversation.messages.length > 0) {
				const messageIds = conversation.messages
					.map((msg: any) => msg.id)
					.filter((id: any) => typeof id === 'number' && !isNaN(id) && isFinite(id))
					.map((id: any) => Number(id));
				
				if (messageIds.length > 0) {
					maxId = Math.max(maxId, ...messageIds);
				}
			}
			
			// Reset the counter through the callback
			if (this.resetCounterCallback) {
				this.resetCounterCallback(maxId);
			}
			
		} catch (error) {
			console.error('Failed to reset message ID counter:', error);
		}
	}

	clearPreallocationStateForConversationSwitch(): void {
		try {
			this.clearPreallocatedMessageIds();
			this.resetFirstFunctionCallTracking();
			console.info('Cleared preallocation state for conversation switch');
		} catch (error) {
			console.error('Failed to clear preallocation state:', error);
		}
	}
}
