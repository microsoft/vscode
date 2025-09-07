/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useRef, useLayoutEffect, memo } from 'react';
import { ConversationMessage } from '../../../../services/erdosAi/common/conversationTypes.js';
import { ErdosAiMarkdownComponent } from '../components/erdosAiMarkdownRenderer.js';
import { ErdosAiMarkdownRenderer } from '../markdown/erdosAiMarkdownRenderer.js';

interface UserMessageProps {
	message: ConversationMessage;
	isEditing: boolean;
	editingContent: string;
	editTextareaRef: React.RefObject<HTMLTextAreaElement>;
	onEditMessage: (messageId: number, content: string) => void;
	onRevertToMessage: (messageId: number) => void;
	onEditingContentChange: (content: string) => void;
	onEditKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onEditBlur: () => void;
	calculateAndSetTextareaHeight: (textarea: HTMLTextAreaElement, content: string) => void;
}

export const UserMessage = memo<UserMessageProps>(({ 
	message, 
	isEditing, 
	editingContent, 
	editTextareaRef, 
	onEditMessage, 
	onRevertToMessage, 
	onEditingContentChange,
	onEditKeyDown,
	onEditBlur,
	calculateAndSetTextareaHeight
}) => {
	// Track if this is the initial edit to avoid reselecting text on every change
	const isInitialEditRef = useRef(false);
	
	// Handle height calculation and focus after DOM updates
	useLayoutEffect(() => {
		if (isEditing && editTextareaRef.current && editingContent !== undefined) {
			const textarea = editTextareaRef.current;
			
			// Only focus and select on the initial edit, not on every content change
			if (!isInitialEditRef.current) {
				textarea.focus();
				textarea.select();
				isInitialEditRef.current = true;
			}
			
			// Always calculate and set proper height
			calculateAndSetTextareaHeight(textarea, editingContent);
		}
		
		// Reset the initial edit flag when exiting edit mode
		if (!isEditing) {
			isInitialEditRef.current = false;
		}
	}, [isEditing, editingContent, editTextareaRef, calculateAndSetTextareaHeight]);
	
	return (
		<div className={`erdos-ai-message user ${isEditing ? 'editing' : ''}`}>
			{isEditing ? (
				<textarea
					ref={editTextareaRef}
					className="erdos-ai-message-edit-textarea"
					value={editingContent}
					onChange={(e) => {
						const newValue = e.target.value;
						onEditingContentChange(newValue);
						
						// Use the same height calculation function
						const textarea = e.currentTarget as HTMLTextAreaElement;
						calculateAndSetTextareaHeight(textarea, newValue);
					}}
					onKeyDown={onEditKeyDown}
					onBlur={onEditBlur}
				/>
			) : (
				<>
					<div 
						className="erdos-ai-message-content"
						onClick={() => onEditMessage(message.id, message.content || '')}
						title="Click to edit this message"
						ref={(el) => {
							// Check if content would need clamping (exceeds 4 lines)
							if (el) {
								// Temporarily measure natural height
								const originalDisplay = el.style.display;
								const originalMaxHeight = el.style.maxHeight;
								const originalLineClamp = el.style.webkitLineClamp;
								
								// Reset to natural layout to measure
								el.style.display = 'block';
								el.style.maxHeight = 'none';
								el.style.webkitLineClamp = 'none';
								
								// Calculate if content exceeds 4 lines
								const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
								const maxHeight = lineHeight * 4;
								const needsClamping = el.scrollHeight > maxHeight;
								
								// Restore original styles
								el.style.display = originalDisplay;
								el.style.maxHeight = originalMaxHeight;
								el.style.webkitLineClamp = originalLineClamp;
								
								el.setAttribute('data-clamped', needsClamping.toString());
							}
						}}
					>
						{message.content || ''}
					</div>
					<div 
						className="erdos-ai-revert-icon"
						onClick={() => onRevertToMessage(message.id)}
						title="Delete this message and all messages after it"
					>
						<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
							<path d="M 5 11 L 11 11 A 3 3 0 0 0 11 5 L 5 5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
							<path d="M 4.5 5 L 8.5 2.0 M 4.5 5 L 8.5 8.0" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
						</svg>
					</div>
				</>
			)}
		</div>
	);
}, (prevProps, nextProps) => {
	// Custom comparison for memo - only re-render if relevant props change
	return (
		prevProps.message.id === nextProps.message.id &&
		prevProps.message.content === nextProps.message.content &&
		prevProps.isEditing === nextProps.isEditing &&
		prevProps.editingContent === nextProps.editingContent &&
		prevProps.editTextareaRef === nextProps.editTextareaRef
	);
});

interface AssistantMessageProps {
	message: ConversationMessage;
	markdownRenderer: ErdosAiMarkdownRenderer | null;
}

export const AssistantMessage = memo<AssistantMessageProps>(({ message, markdownRenderer }) => {
	const content = message.content || '';
	return (
		<div className="erdos-ai-message assistant">
			{markdownRenderer ? (
				<ErdosAiMarkdownComponent
					content={content}
					isStreaming={false}
					renderer={markdownRenderer}
					className="erdos-ai-message-content"
				/>
			) : (
				content
			)}
		</div>
	);
});

// Helper function to calculate and set textarea height
export const calculateAndSetTextareaHeight = (textarea: HTMLTextAreaElement, content: string) => {
	// Reset height to auto to get accurate scrollHeight measurement
	textarea.style.height = 'auto';
	
	// Use the actual scrollHeight from the DOM, which accounts for text wrapping
	// This is more accurate than just counting newline characters
	const actualScrollHeight = textarea.scrollHeight;
	const maxHeight = 120; // Match CSS max-height
	const minHeight = 18.2; // At least 1 line (13px * 1.4)
	
	// Use the browser-calculated scroll height, clamped to our min/max bounds
	const newHeight = Math.max(minHeight, Math.min(actualScrollHeight, maxHeight));
	
	textarea.style.height = `${newHeight}px`;
	textarea.style.setProperty('height', `${newHeight}px`, 'important');
};

