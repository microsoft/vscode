/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';
import { ConversationInfo } from '../../../../services/erdosAi/common/conversationTypes.js';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';

interface ConversationSelectionDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSelectConversation: (conversationId: number, name: string) => void;
	erdosAiService: IErdosAiServiceCore;
}

/**
 * Dialog for selecting conversations to attach as context
 * Based on Erdos's HistoryDropdown pattern from ErdosAi component
 */
export const ConversationSelectionDialog: React.FC<ConversationSelectionDialogProps> = ({
	isOpen,
	onClose,
	onSelectConversation,
	erdosAiService
}) => {
	const [conversations, setConversations] = useState<ConversationInfo[]>([]);
	const [filteredConversations, setFilteredConversations] = useState<ConversationInfo[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState('');
	const dialogRef = useRef<HTMLDivElement>(null);

	const loadConversations = async () => {
		try {
			setIsLoading(true);
			const conversationInfos = await erdosAiService.listConversations();
			// Sort newest to oldest (by ID descending, since IDs are sequential)
			const sorted = conversationInfos.sort((a, b) => b.id - a.id);
			setConversations(sorted);
			setFilteredConversations(sorted);
		} catch (error) {
			console.error('Failed to load conversations:', error);
			setConversations([]);
			setFilteredConversations([]);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (isOpen) {
			loadConversations();
		}
	}, [isOpen, erdosAiService]);

	useEffect(() => {
		// Filter conversations based on search query
		const filtered = conversations.filter(conv => 
			conv.name.toLowerCase().includes(searchQuery.toLowerCase())
		);
		setFilteredConversations(filtered);
	}, [conversations, searchQuery]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleEscape);
			return () => {
				document.removeEventListener('mousedown', handleClickOutside);
				document.removeEventListener('keydown', handleEscape);
			};
		}
		
		return undefined;
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	const handleSelectConversation = (conv: ConversationInfo) => {
		onSelectConversation(conv.id, conv.name);
		onClose();
	};

	return (
		<div className="conversation-selection-overlay">
			<div ref={dialogRef} className="conversation-selection-dialog">
				<div className="conversation-selection-header">
					<h3>Select Conversation to Attach</h3>
					<button 
						className="close-button" 
						onClick={onClose}
						title="Close"
					>
						×
					</button>
				</div>
				
				<div className="conversation-selection-search">
					<input
						type="text"
						className="conversation-search-input"
						placeholder="Search conversations..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						autoFocus
					/>
				</div>
				
				<div className="conversation-selection-list">
					{isLoading ? (
						<div className="conversation-selection-loading">
							Loading conversations...
						</div>
					) : filteredConversations.length === 0 ? (
						<div className="conversation-selection-empty">
							{searchQuery ? 'No conversations match your search.' : 'No conversations found.'}
						</div>
					) : (
						filteredConversations.map(conv => (
							<div 
								key={conv.id}
								className="conversation-selection-item"
								onClick={() => handleSelectConversation(conv)}
							>
								<div className="conversation-item-name">{conv.name}</div>
								<div className="conversation-item-id">ID: {conv.id}</div>
							</div>
						))
					)}
				</div>
				
				<div className="conversation-selection-footer">
					<button 
						className="cancel-button" 
						onClick={onClose}
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};
