/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Represents a single message in a conversation
 */
export interface Message {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	parentId?: string; // Allows for reply chains or threads later
	metadata?: Record<string, any>;
	timestamp: number;
}

/**
 * Represents a conversation containing multiple messages
 */
export interface Conversation {
	id: string;
	title: string;
	messages: Message[];
	createdAt: number;
	updatedAt: number;
}

/**
 * State shape for the conversation store
 */
export interface ConversationState {
	conversations: Conversation[];
	activeConversationId: string | null;
}

