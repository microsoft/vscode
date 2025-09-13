/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { useCallback } from 'react';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';
import { Conversation, ConversationMessage } from '../../../../services/erdosAi/common/conversationTypes.js';
import { filterMessagesForDisplay } from '../messages/messageUtils.js';
import { URI } from '../../../../../base/common/uri.js';

interface UseMessageInputProps {
	erdosAiService: IErdosAiServiceCore;
	currentConversation: Conversation | null;
	inputValue: string;
	isAiProcessing: boolean;
	setInputValue: (value: string) => void;
	setCurrentConversation: (conversation: Conversation) => void;
	setMessages: React.Dispatch<React.SetStateAction<ConversationMessage[]>>;
	setScrollLock: (lock: boolean) => void;
	services: any;
}

export function useMessageInput({
	erdosAiService,
	currentConversation,
	inputValue,
	isAiProcessing,
	setInputValue,
	setCurrentConversation,
	setMessages,
	setScrollLock,
	services
}: UseMessageInputProps) {

	const handleSendMessage = useCallback(async () => {
		if (!inputValue.trim()) {
			return;
		}

		const messageContent = inputValue.trim();
		
		// Re-enable scroll lock when user sends a new message (like GitHub Copilot)
		setScrollLock(true);
		
		if (isAiProcessing) {
			try {
				await erdosAiService.cancelStreaming();
				
				const updatedConversation = erdosAiService.getCurrentConversation();
				if (updatedConversation) {
					setCurrentConversation({...updatedConversation});
					const displayableMessages = filterMessagesForDisplay(updatedConversation.messages);
					// After canceling, refresh with current conversation state (replace)
					setMessages(displayableMessages);
				}
				
				await new Promise(resolve => setTimeout(resolve, 50));
				
			} catch (error) {
				console.error('Failed to cancel before sending new message:', error);
			}
		}
		
		setInputValue('');

		try {
			if (!currentConversation) {
				await erdosAiService.newConversation();
			}

			// State machine will handle processing state
			await erdosAiService.sendMessage(messageContent);

		} catch (error) {
			console.error('Failed to send message:', error);
		}
	}, [inputValue, isAiProcessing, erdosAiService, currentConversation, setScrollLock, setInputValue, setCurrentConversation, setMessages]);

	const handleKeyPress = useCallback((event: React.KeyboardEvent) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendMessage();
		}
	}, [handleSendMessage]);

	const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInputValue(event.target.value);
		
		const textarea = event.target;
		textarea.style.height = 'auto';
		const scrollHeight = Math.min(textarea.scrollHeight, 120);
		textarea.style.height = `${Math.max(scrollHeight, 24)}px`;
	}, [setInputValue]);

	const handlePaste = useCallback(async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {

		if (!event.clipboardData) {
			return;
		}

		const pastedText = event.clipboardData.getData('text/plain');
		
		if (!pastedText || pastedText.trim().length === 0) {
			return;
		}

		try {
			const matchResult = await services.documentManager.checkPastedTextInOpenDocuments(pastedText);
			
			if (matchResult) {
				
				const contextService = services.contextService;
				
				let uri: URI;
				if (matchResult.filePath.startsWith('__UNSAVED_')) {
					uri = URI.parse(`untitled:${matchResult.filePath}`);
				} else {
					uri = URI.file(matchResult.filePath);
				}
				
				const success = await contextService.addFileContext(uri, matchResult.content, matchResult.startLine, matchResult.endLine);
				
				if (success) {	
					
					event.preventDefault();
					
					const currentValue = inputValue;
					let newValue = currentValue;
					
					if (!currentValue || currentValue.trim().length === 0) {
						newValue = '';
					} else {
						newValue = currentValue.replace(pastedText, '');
					}
					
					setInputValue(newValue);
				} else {
				}
			}
		} catch (error) {
			console.error('DEBUG: Error processing pasted text:', error);
		}
	}, [inputValue, setInputValue, services]);

	const handleCancelStreaming = useCallback(async () => {
		try {
			// State machine will handle processing state when cancellation completes
			await erdosAiService.cancelStreaming();
		} catch (error) {
			console.error('%c[REACT CANCEL] Failed to cancel streaming:', 'color: red; font-weight: bold', error);
		}
	}, [erdosAiService]);

	return {
		handleSendMessage,
		handleKeyPress,
		handleInputChange,
		handlePaste,
		handleCancelStreaming
	};
}

