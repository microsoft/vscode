/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';
import { IContextItem } from '../../../../services/erdosAiContext/common/contextService.js';
import { IContextService } from '../../../../services/erdosAiContext/common/contextService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { URI } from '../../../../../base/common/uri.js';
import { ConversationSelectionDialog } from './conversationSelectionDialog.js';
import { HelpTopicSelectionDialog } from './helpTopicSelectionDialog.js';
import { IHelpService } from '../../../../services/erdosAiContext/common/helpService.js';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';
import './conversationSelectionDialog.css';
import './helpTopicSelectionDialog.css';

interface ContextBarProps {
	contextService: IContextService;
	fileService: IFileService;
	fileDialogService: IFileDialogService;
	helpService: IHelpService;
	erdosAiService: IErdosAiServiceCore;
}

interface ContextItemDisplayProps {
	item: IContextItem;
	onRemove: (id: string) => void;
}

/**
 * Individual context item display component
 * Replicates RAO's context item styling and behavior
 */
const ContextItemDisplay: React.FC<ContextItemDisplayProps> = ({ item, onRemove }) => {
	const getIcon = () => {
		switch (item.type) {
			case 'file':
				return (
					<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
						<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/>
						<polyline points='14 2 14 8 20 8'/>
					</svg>
				);
			case 'directory':
				return (
					<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
						<path d='M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/>
					</svg>
				);
			case 'chat':
				return (
					<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
						<path d='M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z'/>
					</svg>
				);
			case 'docs':
				return (
					<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
						<path d='M12 7 A9 9 0 0 0 3 7'/>
						<path d='M12 7 A9 9 0 0 1 21 7'/>
						<path d='M3 7 L3 19'/>
						<path d='M21 7 L21 19'/>
						<path d='M3 19 Q7 16 12 19'/>
						<path d='M21 19 Q17 16 12 19'/>
						<path d='M12 8 L12 19'/>
					</svg>
				);
			default:
				return (
					<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
						<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/>
						<polyline points='14 2 14 8 20 8'/>
					</svg>
				);
		}
	};

	const handleRemove = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onRemove(item.id);
	};

	return (
		<div className="erdos-ai-context-element context-item">
			<span className="context-item-icon">{getIcon()}</span>
			<span 
				className="context-item-remove-hover"
				onClick={handleRemove}
				title="Remove from context"
				aria-label="Remove from context"
			>
				×
			</span>
			<span className="context-item-name" title={item.path || item.name}>
				{item.name}
			</span>
		</div>
	);
};

/**
 * Context attachment menu
 */
interface AttachMenuProps {
	isOpen: boolean;
	onClose: () => void;
	onAttachFile: () => void;
	onAttachFolder: () => void;
	onAttachChat: () => void;
	onAttachDocs: () => void;
	buttonRef: React.RefObject<HTMLButtonElement>;
	menuRef?: React.RefObject<HTMLDivElement>;
	chatButtonRef?: React.RefObject<HTMLButtonElement>;
	docsButtonRef?: React.RefObject<HTMLButtonElement>;
}

interface SearchDropdownProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (item: any) => void;
	menuRef: React.RefObject<HTMLDivElement>;
	triggerRef?: React.RefObject<HTMLButtonElement>; // Reference to the specific menu item that triggered this
	placeholder: string;
	searchFunction: (query: string) => Promise<any[]>;
}

/**
 * Search dropdown that appears to the right of the attach menu
 * Replicates RAO's search pattern with real-time filtering
 */
const SearchDropdown: React.FC<SearchDropdownProps> = ({ 
	isOpen, 
	onClose, 
	onSelect, 
	menuRef, 
	triggerRef,
	placeholder,
	searchFunction 
}) => {
	const [searchQuery, setSearchQuery] = useState('');
	const [results, setResults] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Handle click outside to close
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && 
				!dropdownRef.current.contains(event.target as Node) &&
				menuRef.current &&
				!menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
		
		return undefined;
	}, [isOpen, onClose, menuRef]);

	// Focus input when opened
	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isOpen]);

	// Position dropdown to align with trigger button
	useEffect(() => {
		if (isOpen && dropdownRef.current && triggerRef?.current && menuRef.current) {
			const triggerRect = triggerRef.current.getBoundingClientRect();
			const menuRect = menuRef.current.getBoundingClientRect();
			const dropdown = dropdownRef.current;
			
			// Position to the right of the menu, aligned with the trigger button's top
			dropdown.style.position = 'fixed';
			dropdown.style.left = `${menuRect.right}px`;
			dropdown.style.top = `${triggerRect.top}px`;
			dropdown.style.zIndex = '1001';
			dropdown.style.visibility = 'visible';
			dropdown.style.display = 'flex';
		}
	}, [isOpen, triggerRef, menuRef]);

	// Search as user types
	useEffect(() => {
		if (!isOpen) return;

		const performSearch = async () => {
			setIsLoading(true);
			try {
				const searchResults = await searchFunction(searchQuery);
				setResults(searchResults);
			} catch (error) {
				console.error('Search failed:', error);
				setResults([]);
			} finally {
				setIsLoading(false);
			}
		};

		const debounceTimer = setTimeout(performSearch, 200);
		return () => clearTimeout(debounceTimer);
	}, [searchQuery, isOpen, searchFunction]);

	// Reset state when closed
	useEffect(() => {
		if (!isOpen) {
			setSearchQuery('');
			setResults([]);
		}
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<div 
			ref={dropdownRef} 
			className="erdos-ai-search-dropdown"
			onMouseLeave={onClose}
		>
			<input
				ref={inputRef}
				type="text"
				value={searchQuery}
				onChange={(e) => setSearchQuery(e.target.value)}
				placeholder={placeholder}
				className="search-dropdown-input"
			/>
			<div className="search-dropdown-results">
				{isLoading ? (
					<div className="search-dropdown-item loading">Searching...</div>
				) : results.length === 0 ? (
					<div className="search-dropdown-item no-results">
						{searchQuery ? 'No results found' : 'Start typing to search'}
					</div>
				) : (
					results.map((item, index) => (
						<div 
							key={index}
							className="search-dropdown-item"
							onClick={() => onSelect(item)}
						>
							{item.name}
						</div>
					))
				)}
			</div>
		</div>
	);
};

const AttachMenu: React.FC<AttachMenuProps> = ({ 
	isOpen, 
	onClose, 
	onAttachFile, 
	onAttachFolder, 
	onAttachChat, 
	onAttachDocs,
	buttonRef,
	menuRef,
	chatButtonRef,
	docsButtonRef
}) => {
	// Use the external menuRef passed in so SearchDropdown can reference it

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef?.current && 
				!menuRef.current.contains(event.target as Node) &&
				buttonRef.current &&
				!buttonRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
		
		return undefined;
	}, [isOpen, onClose, buttonRef, menuRef]);

	
	if (!isOpen) {
		return null;
	}

	return (
		<div ref={menuRef} className="erdos-ai-attach-menu">
			<button className="attach-menu-item" onClick={onAttachFile}>
				<span className="attach-menu-icon">
					<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
						<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/>
						<polyline points='14 2 14 8 20 8'/>
					</svg>
				</span>
				<span>File</span>
			</button>
			<button className="attach-menu-item" onClick={onAttachFolder}>
				<span className="attach-menu-icon">
					<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
						<path d='M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/>
					</svg>
				</span>
				<span>Directory</span>
			</button>
			<button ref={chatButtonRef} className="attach-menu-item" onClick={onAttachChat}>
				<span className="attach-menu-icon">
					<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
						<path d='M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z'/>
					</svg>
				</span>
				<span>Chat</span>
				<span className="attach-menu-chevron">
					<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='#666' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
						<polyline points='9 18 15 12 9 6'/>
					</svg>
				</span>
			</button>
			<button ref={docsButtonRef} className="attach-menu-item" onClick={onAttachDocs}>
				<span className="attach-menu-icon">
					<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
						<path d='M12 7 A9 9 0 0 0 3 7'/>
						<path d='M12 7 A9 9 0 0 1 21 7'/>
						<path d='M3 7 L3 19'/>
						<path d='M21 7 L21 19'/>
						<path d='M3 19 Q7 16 12 19'/>
						<path d='M21 19 Q17 16 12 19'/>
						<path d='M12 8 L12 19'/>
					</svg>
				</span>
				<span>Docs</span>
				<span className="attach-menu-chevron">
					<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='#666' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
						<polyline points='9 18 15 12 9 6'/>
					</svg>
				</span>
			</button>
		</div>
	);
};

/**
 * Context bar component that displays above the search input
 * Replicates RAO's context bar design and functionality
 */
export const ContextBar: React.FC<ContextBarProps> = ({ 
	contextService, 
	fileService, 
	fileDialogService,
	helpService,
	erdosAiService
}) => {
	const [contextItems, setContextItems] = useState<IContextItem[]>([]);
	const [showAttachMenu, setShowAttachMenu] = useState(false);
	const [showConversationDialog, setShowConversationDialog] = useState(false);
	const [showHelpTopicDialog, setShowHelpTopicDialog] = useState(false);
	const [showChatSearch, setShowChatSearch] = useState(false);
	const [showDocsSearch, setShowDocsSearch] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const attachButtonRef = useRef<HTMLButtonElement>(null);
	const attachMenuRef = useRef<HTMLDivElement>(null);
	const chatButtonRef = useRef<HTMLButtonElement>(null);
	const docsButtonRef = useRef<HTMLButtonElement>(null);

	// Subscribe to context changes
	useEffect(() => {
		const updateItems = (items: IContextItem[]) => {
			setContextItems(items);
		};

		updateItems(contextService.getContextItems());
		
		const subscription = contextService.onDidChangeContext(updateItems);
		return () => subscription.dispose();
	}, [contextService]);

	const handleAttachClick = () => {
		const newState = !showAttachMenu;
		setShowAttachMenu(newState);
	};

	const handleCloseMenu = () => {
		setShowAttachMenu(false);
	};

	const handleAttachFile = async () => {
		setShowAttachMenu(false);
		try {
			const result = await fileDialogService.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				title: 'Select File to Attach'
			});

			if (result && result.length > 0) {
				await contextService.addFileContext(result[0]);
			}
		} catch (error) {
			console.error('Failed to attach file:', error);
		}
	};

	const handleAttachFolder = async () => {
		setShowAttachMenu(false);
		try {
			const result = await fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: 'Select Folder to Attach'
			});

			if (result && result.length > 0) {
				await contextService.addFileContext(result[0]);
			}
		} catch (error) {
			console.error('Failed to attach folder:', error);
		}
	};

	const handleAttachChat = () => {
		// Keep the attach menu open and show search dropdown
		setShowChatSearch(true);
		setShowDocsSearch(false); // Close other search if open
	};

	const handleAttachDocs = () => {
		// Keep the attach menu open and show search dropdown
		setShowDocsSearch(true);
		setShowChatSearch(false); // Close other search if open
	};

	const handleSelectConversation = (conversationId: number, name: string) => {
		contextService.addChatContext(conversationId, name);
	};

	const handleSelectHelpTopic = (topic: string, name?: string) => {
		contextService.addDocsContext(topic, name);
	};

	// Real search functions based on RAO pattern
	const searchChats = async (query: string) => {
		try {
			const conversationInfos = await erdosAiService.listConversations();
			// Sort newest to oldest (by ID descending, since IDs are sequential)
			const sorted = conversationInfos.sort((a, b) => b.id - a.id);
			
			if (!query.trim()) {
				return sorted.map(conv => ({ name: conv.name, id: conv.id }));
			}
			
			// Filter conversations based on search query (case-insensitive)
			return sorted
				.filter(conv => conv.name.toLowerCase().includes(query.toLowerCase()))
				.map(conv => ({ name: conv.name, id: conv.id }));
		} catch (error) {
			console.error('Failed to search conversations:', error);
			return [];
		}
	};

	const searchDocs = async (query: string) => {
		try {
			// Use both R and Python runtimes to suggest help topics
			const topics = await helpService.suggestTopics(query);
			
			if (!Array.isArray(topics) || topics.length === 0) {
				return [];
			}
			
			// Topics now have format: {name: "function_name (R/Python)", topic: "function_name", language: "R" | "Python"}
			return topics.map(topicObj => ({ 
				name: topicObj.name, 
				topic: topicObj.topic,
				language: topicObj.language
			}));
		} catch (error) {
			// Fallback to empty array if runtimes are not available
			return [];
		}
	};

	const handleRemoveItem = (id: string) => {
		contextService.removeContextItem(id);
	};

	// Handlers for search dropdown selections
	const handleChatSelected = (item: any) => {
		contextService.addChatContext(item.id, item.name);
		setShowChatSearch(false);
		setShowAttachMenu(false); // Close the attach menu too
	};

	const handleDocsSelected = (item: any) => {
		contextService.addDocsContext(item.topic, item.name, item.language);
		setShowDocsSearch(false);
		setShowAttachMenu(false); // Close the attach menu too
	};

	// Drag and drop handlers
	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDragOver(false);
	};

	const handleDrop = async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDragOver(false);

		try {
			const files = Array.from(e.dataTransfer.files);
			for (const file of files) {
				const uri = URI.file(file.name);
				await contextService.addFileContext(uri);
			}
		} catch (error) {
			console.error('Failed to handle dropped files:', error);
		}
	};

	return (
		<div 
			className={`erdos-ai-context-bar ${dragOver ? 'drag-over' : ''}`}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<div className="context-bar-content">
				<span 
					ref={attachButtonRef}
					className="erdos-ai-context-element"
					onClick={handleAttachClick}
					title="Attach files, folders, chats, or documentation for context"
				>
					{contextItems.length === 0 ? '@ Add context' : '@'}
				</span>
				
				<div className="context-items-container">
					{contextItems.map(item => (
						<ContextItemDisplay
							key={item.id}
							item={item}
							onRemove={handleRemoveItem}
						/>
					))}
				</div>
			</div>
			
			<AttachMenu
				isOpen={showAttachMenu}
				onClose={handleCloseMenu}
				onAttachFile={handleAttachFile}
				onAttachFolder={handleAttachFolder}
				onAttachChat={handleAttachChat}
				onAttachDocs={handleAttachDocs}
				buttonRef={attachButtonRef}
				menuRef={attachMenuRef}
				chatButtonRef={chatButtonRef}
				docsButtonRef={docsButtonRef}
			/>
			<SearchDropdown
				isOpen={showChatSearch}
				onClose={() => setShowChatSearch(false)}
				onSelect={handleChatSelected}
				menuRef={attachMenuRef}
				triggerRef={chatButtonRef}
				placeholder="Search conversations..."
				searchFunction={searchChats}
			/>
			<SearchDropdown
				isOpen={showDocsSearch}
				onClose={() => setShowDocsSearch(false)}
				onSelect={handleDocsSelected}
				menuRef={attachMenuRef}
				triggerRef={docsButtonRef}
				placeholder="Search documentation..."
				searchFunction={searchDocs}
			/>

			{/* Dialog for selecting conversations */}
			<ConversationSelectionDialog
				isOpen={showConversationDialog}
				onClose={() => setShowConversationDialog(false)}
				onSelectConversation={handleSelectConversation}
				erdosAiService={erdosAiService}
			/>

			{/* Dialog for selecting help topics */}
			<HelpTopicSelectionDialog
				isOpen={showHelpTopicDialog}
				onClose={() => setShowHelpTopicDialog(false)}
				onSelectTopic={handleSelectHelpTopic}
			/>
		</div>
	);
};
