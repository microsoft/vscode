/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useConversationStore } from '../conversationStore';
import { Message } from '../types';
import './ChatPanel.css';

// VS Code API type declaration
declare const acquireVsCodeApi: () => {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
};

// Get VS Code API instance (only call once)
const vscode = acquireVsCodeApi();

/**
 * Main chat panel component that renders the conversation and input area
 */
export const ChatPanel: React.FC = () => {
	const [inputValue, setInputValue] = React.useState('');
	const [isProcessing, setIsProcessing] = React.useState(false);
	const pendingMessageIdRef = React.useRef<string | null>(null);

	const {
		getActiveConversation,
		addUserMessage,
		addAssistantReply,
		replaceAssistantPlaceholder,
		clearConversation
	} = useConversationStore();

	const activeConversation = getActiveConversation();
	const messages = activeConversation?.messages || [];

	// Auto-scroll to bottom when new messages arrive
	const messagesEndRef = React.useRef<HTMLDivElement>(null);
	React.useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages.length]);

	// Listen for messages from VS Code extension
	React.useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;

			switch (message.type) {
				case 'makeAPICall':
					// Extension is asking us to make the API call (webview has less CSP restrictions)
					callLMStudioAPI(message.content);
					break;

				case 'assistantReply':
					// Direct reply from extension (fallback)
					if (pendingMessageIdRef.current) {
						replaceAssistantPlaceholder(pendingMessageIdRef.current, message.content);
						pendingMessageIdRef.current = null;
					}
					setIsProcessing(false);
					break;

				case 'error':
					// Handle error from extension
					if (pendingMessageIdRef.current) {
						replaceAssistantPlaceholder(
							pendingMessageIdRef.current,
							`❌ Error: ${message.content}`
						);
						pendingMessageIdRef.current = null;
					}
					setIsProcessing(false);
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [replaceAssistantPlaceholder]);

	// Make the API call to LM Studio (via proxy to handle CORS)
	const callLMStudioAPI = async (userMessage: string) => {
		try {
			const response = await fetch('http://127.0.0.1:3001/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'openai/gpt-oss-20b', // The first loaded model from LM Studio
					messages: [
						{
							role: 'system',
							content: 'You are Stellar, a helpful AI assistant integrated into VS Code. Provide clear, concise, and helpful responses.'
						},
						{
							role: 'user',
							content: userMessage
						}
					],
					temperature: 0.7,
					max_tokens: 2000,
					stream: false
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result && result.choices && result.choices.length > 0) {
				const aiResponse = result.choices[0].message?.content || 'No response from AI';

				// Update the UI with the real response
				if (pendingMessageIdRef.current) {
					replaceAssistantPlaceholder(pendingMessageIdRef.current, aiResponse);
					pendingMessageIdRef.current = null;
				}
				setIsProcessing(false);
			} else {
				throw new Error('Invalid response format from LM Studio');
			}
		} catch (error) {
			console.error('[Stellar Webview] API call failed:', error);

			// Show error in UI
			if (pendingMessageIdRef.current) {
				replaceAssistantPlaceholder(
					pendingMessageIdRef.current,
					`❌ Failed to get AI response: ${error instanceof Error ? error.message : String(error)}`
				);
				pendingMessageIdRef.current = null;
			}
			setIsProcessing(false);
		}
	};

	/**
	 * Handle sending a message
	 */
	const handleSend = () => {
		const trimmedInput = inputValue.trim();
		if (!trimmedInput || isProcessing) {
			return;
		}

		// Clear input immediately
		setInputValue('');
		setIsProcessing(true);

		// Step 1: Add user message to UI
		addUserMessage(trimmedInput);

		// Step 2: Add placeholder assistant message
		const placeholderId = addAssistantReply('Stellar is thinking…', { isPlaceholder: true });
		pendingMessageIdRef.current = placeholderId;

		// Step 3: Send message to VS Code extension
		vscode.postMessage({
			type: 'userMessage',
			content: trimmedInput
		});

		// Extension will respond via window.postMessage
		// which we handle in the useEffect above
	};

	/**
	 * Handle Enter key press in input
	 */
	const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	/**
	 * Handle clear conversation
	 */
	const handleClear = () => {
		if (messages.length > 0 && confirm('Clear all messages in this conversation?')) {
			clearConversation();
		}
	};

	return (
		<div className="chat-panel">
			{/* Messages Area */}
			<div className="messages-container">
				{messages.length === 0 ? (
					<div className="empty-state">
						<div className="empty-state-icon">⭐</div>
						<h3>Welcome to Stellar</h3>
						<p>Start a conversation by typing a message below.</p>
					</div>
				) : (
					<div className="messages-list">
						{messages.map((message) => (
							<MessageBubble key={message.id} message={message} />
						))}
						<div ref={messagesEndRef} />
					</div>
				)}
			</div>

			{/* Input Area (Fixed at Bottom) */}
			<div className="input-area">
				<div className="input-container">
					<input
						type="text"
						className="message-input"
						placeholder="Ask Stellar..."
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyPress={handleKeyPress}
						disabled={isProcessing}
					/>
					<div className="button-group">
						<button
							className="btn btn-primary"
							onClick={handleSend}
							disabled={!inputValue.trim() || isProcessing}
						>
							{isProcessing ? 'Sending...' : 'Send'}
						</button>
						<button
							className="btn btn-secondary"
							onClick={handleClear}
							disabled={messages.length === 0 || isProcessing}
						>
							Clear
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

/**
 * Individual message bubble component
 */
const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
	const isUser = message.role === 'user';
	const isPlaceholder = message.metadata?.isPlaceholder === true;

	return (
		<div className={`message-bubble ${message.role}`}>
			<div className="message-header">
				<span className="message-role">
					{isUser ? '👤 You' : '⭐ Stellar'}
				</span>
				<span className="message-timestamp">
					{new Date(message.timestamp).toLocaleTimeString()}
				</span>
			</div>
			<div className={`message-content ${isPlaceholder ? 'placeholder' : ''}`}>
				{message.content}
			</div>
		</div>
	);
};

