/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from 'zustand';
import { Conversation, ConversationState, Message } from './types';

/**
 * Generate a unique ID for messages and conversations
 */
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new conversation with default values
 */
function createNewConversation(): Conversation {
	const now = Date.now();
	return {
		id: generateId(),
		title: 'New Conversation',
		messages: [],
		createdAt: now,
		updatedAt: now
	};
}

interface ConversationActions {
	/**
	 * Add a user message to the active conversation
	 */
	addUserMessage: (content: string) => void;

	/**
	 * Add an assistant reply (can be placeholder or final)
	 */
	addAssistantReply: (content: string, metadata?: Record<string, any>) => string;

	/**
	 * Replace an existing assistant message with new content
	 */
	replaceAssistantPlaceholder: (messageId: string, newContent: string) => void;

	/**
	 * Clear all messages in the active conversation
	 */
	clearConversation: () => void;

	/**
	 * Get the active conversation
	 */
	getActiveConversation: () => Conversation | null;
}

export const useConversationStore = create<ConversationState & ConversationActions>((set, get) => {
	// Initialize with one default conversation
	const initialConversation = createNewConversation();

	return {
		// Initial state
		conversations: [initialConversation],
		activeConversationId: initialConversation.id,

		// Actions
		addUserMessage: (content: string) => {
			const state = get();
			const activeId = state.activeConversationId;

			if (!activeId) {
				return;
			}

			const newMessage: Message = {
				id: generateId(),
				role: 'user',
				content,
				timestamp: Date.now()
			};

			set({
				conversations: state.conversations.map(conv =>
					conv.id === activeId
						? {
							...conv,
							messages: [...conv.messages, newMessage],
							updatedAt: Date.now()
						}
						: conv
				)
			});
		},

		addAssistantReply: (content: string, metadata?: Record<string, any>) => {
			const state = get();
			const activeId = state.activeConversationId;

			if (!activeId) {
				return '';
			}

			const newMessage: Message = {
				id: generateId(),
				role: 'assistant',
				content,
				timestamp: Date.now(),
				metadata
			};

			set({
				conversations: state.conversations.map(conv =>
					conv.id === activeId
						? {
							...conv,
							messages: [...conv.messages, newMessage],
							updatedAt: Date.now()
						}
						: conv
				)
			});

			return newMessage.id;
		},

		replaceAssistantPlaceholder: (messageId: string, newContent: string) => {
			const state = get();
			const activeId = state.activeConversationId;

			if (!activeId) {
				return;
			}

			set({
				conversations: state.conversations.map(conv =>
					conv.id === activeId
						? {
							...conv,
							messages: conv.messages.map(msg =>
								msg.id === messageId
									? { ...msg, content: newContent, timestamp: Date.now() }
									: msg
							),
							updatedAt: Date.now()
						}
						: conv
				)
			});
		},

		clearConversation: () => {
			const state = get();
			const activeId = state.activeConversationId;

			if (!activeId) {
				return;
			}

			set({
				conversations: state.conversations.map(conv =>
					conv.id === activeId
						? {
							...conv,
							messages: [],
							updatedAt: Date.now()
						}
						: conv
				)
			});
		},

		getActiveConversation: () => {
			const state = get();
			if (!state.activeConversationId) {
				return null;
			}
			return state.conversations.find(c => c.id === state.activeConversationId) || null;
		}
	};
});

