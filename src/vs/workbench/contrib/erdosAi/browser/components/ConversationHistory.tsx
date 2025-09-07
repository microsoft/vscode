/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';
import { ConversationInfo } from '../../../../services/erdosAi/common/conversationTypes.js';

interface HistoryDropdownProps {
	erdosAiService: IErdosAiServiceCore;
	isOpen: boolean;
	onClose: () => void;
	onSelectConversation: (conversationId: string) => void;
	buttonRef: React.RefObject<HTMLButtonElement>;
}

export const HistoryDropdown = (props: HistoryDropdownProps) => {
	const [conversations, setConversations] = useState<ConversationInfo[]>([]);
	const [filteredConversations, setFilteredConversations] = useState<ConversationInfo[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState('');
	const [editingId, setEditingId] = useState<number | null>(null);
	const [editingName, setEditingName] = useState('');
	const dropdownRef = useRef<HTMLDivElement>(null);

	const loadConversations = async () => {
		try {
			setIsLoading(true);
			const conversationInfos = await props.erdosAiService.listConversations();
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
		if (props.isOpen) {
			loadConversations();
		}
	}, [props.isOpen, props.erdosAiService]);

	useEffect(() => {
		const filtered = conversations.filter(conv => 
			conv.name.toLowerCase().includes(searchQuery.toLowerCase())
		);
		setFilteredConversations(filtered);
	}, [conversations, searchQuery]);

	useEffect(() => {
		if (props.isOpen && dropdownRef.current && props.buttonRef.current) {
			const buttonRect = props.buttonRef.current.getBoundingClientRect();
			const dropdown = dropdownRef.current;
			const dropdownWidth = Math.max(320, buttonRect.width);
			
			let leftPosition = buttonRect.left;
			const rightEdge = leftPosition + dropdownWidth;
			const windowWidth = window.innerWidth;
			
			if (rightEdge > windowWidth) {
				leftPosition = buttonRect.right - dropdownWidth;
				if (leftPosition < 0) {
					leftPosition = 8;
				}
			}
			
			dropdown.style.top = `${buttonRect.bottom + 4}px`;
			dropdown.style.left = `${leftPosition}px`;
			dropdown.style.minWidth = `${dropdownWidth}px`;
		}
	}, [props.isOpen, props.buttonRef]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
				props.buttonRef.current && !props.buttonRef.current.contains(event.target as Node)) {
				props.onClose();
			}
		};

		if (props.isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
		
		return () => {};
	}, [props.isOpen, props.onClose, props.buttonRef]);

	const handleRename = async (id: number, newName: string) => {
		if (newName.trim() && newName !== conversations.find(c => c.id === id)?.name) {
			try {
				await props.erdosAiService.renameConversation(id, newName.trim());
				await loadConversations();
			} catch (error) {
				console.error('Failed to rename conversation:', error);
			}
		}
		setEditingId(null);
		setEditingName('');
	};

	const handleDelete = async (id: number) => {
		if (confirm('Are you sure you want to delete this conversation?')) {
			try {
				await props.erdosAiService.deleteConversation(id);
				await loadConversations();
			} catch (error) {
				console.error('Failed to delete conversation:', error);
			}
		}
	};

	const handleDeleteAll = async () => {
		if (confirm('Are you sure you want to delete ALL conversations? This action cannot be undone.')) {
			try {
				await props.erdosAiService.deleteAllConversations();
				await loadConversations();
			} catch (error) {
				console.error('Failed to delete all conversations:', error);
			}
		}
	};

	const startEditing = (conv: ConversationInfo) => {
		setEditingId(conv.id);
		setEditingName(conv.name);
	};

	if (!props.isOpen) return null;

	return (
		<div 
			ref={dropdownRef}
			className="erdos-ai-history-dropdown"
		>
			<div className="erdos-ai-history-header">
				<input
					type="text"
					className="erdos-ai-history-search"
					placeholder="Search conversations..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					autoFocus
				/>
			</div>
			
			<div className="erdos-ai-history-list">
				{isLoading ? (
					<div className="erdos-ai-history-item erdos-ai-history-loading">
						Loading conversations...
					</div>
				) : filteredConversations.length === 0 ? (
					<div className="erdos-ai-history-item erdos-ai-history-empty">
						{searchQuery ? 'No conversations match your search.' : 'No conversations found.'}
					</div>
				) : (
					filteredConversations.map(conv => (
						<div key={conv.id} className="erdos-ai-history-item">
							{editingId === conv.id ? (
								<input
									type="text"
									className="erdos-ai-history-edit-input"
									value={editingName}
									onChange={(e) => setEditingName(e.target.value)}
									onBlur={() => handleRename(conv.id, editingName)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											handleRename(conv.id, editingName);
										} else if (e.key === 'Escape') {
											setEditingId(null);
											setEditingName('');
										}
									}}
									autoFocus
								/>
							) : (
								<>
									<div 
										className="erdos-ai-history-name"
										onClick={() => props.onSelectConversation(conv.id.toString())}
									>
										{conv.name}
									</div>
									<div className="erdos-ai-history-date">
										{new Date(conv.created_at).toLocaleString(undefined, {
											month: 'short',
											day: 'numeric',
											hour: 'numeric',
											minute: '2-digit',
											hour12: true
										})}
									</div>
									<div className="erdos-ai-history-actions">
										<button
											className="erdos-ai-history-action-btn"
											onClick={(e) => {
												e.stopPropagation();
												startEditing(conv);
											}}
											title="Rename conversation"
										>
											<span className="codicon codicon-edit"></span>
										</button>
										<button
											className="erdos-ai-history-action-btn erdos-ai-history-delete-btn"
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(conv.id);
											}}
											title="Delete conversation"
										>
											<span className="codicon codicon-trash"></span>
										</button>
									</div>
								</>
							)}
						</div>
					))
				)}
			</div>
			
			{!isLoading && conversations.length > 0 && (
				<div className="erdos-ai-history-footer">
					<button
						className="erdos-ai-history-delete-all-btn"
						onClick={handleDeleteAll}
						title="Delete all conversations"
					>
						Delete All Conversations
					</button>
				</div>
			)}
		</div>
	);
};

