/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useState } from 'react';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';
import { ConversationMessage, Conversation } from '../../../../services/erdosAi/common/conversationTypes.js';
import { filterMessagesForDisplay, smartMergeMessages } from '../messages/messageUtils.js';

interface UseMessageEditingProps {
	erdosAiService: IErdosAiServiceCore;
	currentConversation: Conversation | null;
	setCurrentConversation: (conversation: Conversation) => void;
	setMessages: React.Dispatch<React.SetStateAction<ConversationMessage[]>>;
	setInputValue: (value: string) => void;
}

export function useMessageEditing({
	erdosAiService,
	currentConversation,
	setCurrentConversation,
	setMessages,
	setInputValue
}: UseMessageEditingProps) {
	const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
	const [editingContent, setEditingContent] = useState<string>('');

	const handleEditingContentChange = useCallback((content: string) => {
		setEditingContent(content);
	}, []);
	
	const handleCancelEdit = useCallback(() => {
		setEditingMessageId(null);
		setEditingContent('');
	}, []);

	const handleSaveEdit = useCallback(async () => {
		if (editingMessageId === null) return;
		
		try {
			// Update the message content through the service
			await erdosAiService.updateMessageContent(editingMessageId, editingContent);
			
			// Refresh conversation to show updated content
			const updatedConversation = erdosAiService.getCurrentConversation();
			if (updatedConversation) {
				setCurrentConversation({...updatedConversation});
				const displayableMessages = filterMessagesForDisplay(updatedConversation.messages);
				setMessages(prev => smartMergeMessages(prev, displayableMessages));
			}
			
			// Exit edit mode
			setEditingMessageId(null);
			setEditingContent('');
		} catch (error) {
			console.error('Failed to update message:', error);
		}
	}, [editingMessageId, editingContent, erdosAiService, setCurrentConversation, setMessages]);
	
	const handleEditAndContinue = useCallback(async () => {
		if (editingMessageId === null || !editingContent.trim()) {
			return;
		}

		const confirmed = confirm(
			'Would you like to revert and continue from this point?\n\nThis will delete all messages after this one and send your edited message as a new query.'
		);
		
		if (!confirmed) {
			return;
		}

		try {
			// Store the new message content
			const newMessageContent = editingContent.trim();
			
			// Exit edit mode first
			setEditingMessageId(null);
			setEditingContent('');
			
			// Revert to the message being edited
			const result = await erdosAiService.revertToMessage(editingMessageId);
			if (result.status === 'error') {
				console.error('Failed to revert conversation:', result.message);
				alert('Failed to revert conversation: ' + (result.message || 'Unknown error'));
				return;
			}
			
			// Ensure we have a conversation
			const conversationBeforeSend = erdosAiService.getCurrentConversation();
			if (!conversationBeforeSend) {
				await erdosAiService.newConversation();
			}

			// Set the input value and send the edited message as a new query
			// State machine will handle processing state
			setInputValue(newMessageContent);
			// Use setTimeout to ensure state is updated before sending
			setTimeout(async () => {				
				await erdosAiService.sendMessage(newMessageContent);
				setInputValue(''); // Clear after sending
			}, 0);

		} catch (error) {
			console.error('Failed to edit and continue:', error);
			alert('Failed to edit and continue: ' + (error instanceof Error ? error.message : 'Unknown error'));
		}
	}, [editingMessageId, editingContent, currentConversation, erdosAiService, setInputValue]);
	
	const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			handleCancelEdit();
		} else if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleEditAndContinue();
		}
	}, [handleCancelEdit, handleEditAndContinue]);
	
	const handleEditBlur = useCallback(async () => {
		// Auto-save when user clicks out or loses focus
		if (editingMessageId !== null) {
			await handleSaveEdit();
		}
	}, [editingMessageId, handleSaveEdit]);

	const handleEditMessage = useCallback((messageId: number, currentContent: string) => {
		setEditingMessageId(messageId);
		setEditingContent(currentContent);
	}, []);

	const handleRevertToMessage = useCallback(async (messageId: number) => {
		const confirmed = confirm(
			'This will delete this message and all messages after it in the conversation. This cannot be undone.\n\nDo you want to continue?'
		);
		
		if (!confirmed) {
			return;
		}

		try {
			const result = await erdosAiService.revertToMessage(messageId);
			if (result.status === 'error') {
				console.error('Failed to revert conversation:', result.message);
				alert('Failed to revert conversation: ' + (result.message || 'Unknown error'));
			}
		} catch (error) {
			console.error('Failed to revert conversation:', error);
			alert('Failed to revert conversation: ' + (error instanceof Error ? error.message : 'Unknown error'));
		}
	}, [erdosAiService]);

	return {
		editingMessageId,
		editingContent,
		handleEditingContentChange,
		handleCancelEdit,
		handleSaveEdit,
		handleEditAndContinue,
		handleEditKeyDown,
		handleEditBlur,
		handleEditMessage,
		handleRevertToMessage
	};
}

