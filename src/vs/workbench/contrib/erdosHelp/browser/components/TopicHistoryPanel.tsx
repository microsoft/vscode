/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './TopicHistoryPanel.css';

import React, { useRef, useState, useEffect } from 'react';
import { localize } from '../../../../../nls.js';
import { services } from '../../../../../base/browser/erdosReactServices.js';

const truncateText = (text: string, maxLength: number = 50): string => {
	if (text.length <= maxLength) {
		return text;
	}
	return text.substring(0, maxLength - 3) + '...';
};

const getTopicName = (entry: any): string => {
	if (entry?.title && entry.title !== 'Erdos Help') {
		return entry.title;
	}
	
	try {
		const url = new URL(entry.sourceUrl);
		
		// For Python URLs, check if there's a 'key' query parameter
		const keyParam = url.searchParams.get('key');
		if (keyParam) {
			return keyParam;
		}
		
		// For R URLs, extract from pathname
		const pathname = url.pathname;
		const lastSegment = pathname.split('/').filter(Boolean).pop();
		if (lastSegment) {
			return lastSegment.replace(/\.html?$/i, '');
		}
	} catch {
		const parts = entry.sourceUrl.split('/');
		const lastPart = parts[parts.length - 1];
		if (lastPart) {
			return lastPart.replace(/\.html?$/i, '');
		}
	}
	
	return 'Unknown';
};

export interface TopicHistoryPanelProps {
	currentTitle?: string;
}

export const TopicHistoryPanel: React.FC<TopicHistoryPanelProps> = (props) => {	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [currentHelpEntry, setCurrentHelpEntry] = useState(services.erdosHelpService.currentHelpEntry);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const helpEntries = services.erdosHelpService.helpEntries || [];

	// Subscribe to help entry changes
	useEffect(() => {
		const disposable = services.erdosHelpService.onDidChangeCurrentHelpEntry((entry) => {
			setCurrentHelpEntry(entry);
		});

		return () => {
			disposable.dispose();
		};
	}, [services.erdosHelpService]);

	// Get the display label - use the topic name if there's a current entry, otherwise show "Home"
	const currentLabel = currentHelpEntry 
		? `${currentHelpEntry.languageName}: ${getTopicName(currentHelpEntry)}`
		: localize('actionBar.home', "Home");

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
				buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			const timeoutId = setTimeout(() => {
				document.addEventListener('mousedown', handleClickOutside);
				document.addEventListener('keydown', handleEscape);
			}, 300);

			return () => {
				clearTimeout(timeoutId);
				document.removeEventListener('mousedown', handleClickOutside);
				document.removeEventListener('keydown', handleEscape);
			};
		}

		return undefined;
	}, [isOpen]);

	useEffect(() => {
		if (isOpen && dropdownRef.current && buttonRef.current) {
			const buttonRect = buttonRef.current.getBoundingClientRect();
			const dropdown = dropdownRef.current;

			dropdown.style.position = 'fixed';
			dropdown.style.top = `${buttonRect.bottom + 4}px`;
			dropdown.style.left = `${buttonRect.left}px`;
			dropdown.style.minWidth = `${Math.max(buttonRect.width, 280)}px`;
		}
	}, [isOpen]);

	const filteredEntries = helpEntries.filter(entry => {
		const displayText = `${entry.languageName}: ${getTopicName(entry)}`;
		return displayText.toLowerCase().includes(searchQuery.toLowerCase());
	});

	const clearHistory = () => {
		services.erdosHelpService.clearHistory();
		setIsOpen(false);
	};

	return (
		<>
			<button
				ref={buttonRef}
				className="erdos-dropdown-button"
				aria-label={localize('erdosCurrentPage', "Current page")}
				title={localize('erdosHelpHistory', "Help history")}
				onClick={() => setIsOpen(!isOpen)}
			>
				<div className="erdos-dropdown-button-label">{currentLabel}</div>
				<div className="codicon codicon-chevron-down" style={{ marginLeft: '4px' }} />
			</button>
		{isOpen && (
			<div ref={dropdownRef} className="history-panel">
				<div className="history-panel-header">
					<input
						type="text"
						className="history-filter-input"
						placeholder={localize('helpHistory.searchPlaceholder', "Search help history...")}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						autoFocus
					/>
				</div>

				<div className="history-entries-list">
					{filteredEntries.length === 0 ? (
						<div className="history-entry history-empty-state">
							{searchQuery ? localize('helpHistory.noMatch', "No entries match your search.") : localize('helpHistory.noHistory', "No help history found.")}
						</div>
					) : (
						filteredEntries.map((entry, index) => {
							const actualIndex = helpEntries.indexOf(entry);
							const displayText = `${entry.languageName}: ${getTopicName(entry)}`;
							const isCurrentEntry = entry === currentHelpEntry;

							return (
								<div
									key={actualIndex}
									className={`history-entry ${isCurrentEntry ? 'active' : ''}`}
									onClick={() => {
										services.erdosHelpService.openHelpEntryIndex(actualIndex);
										setIsOpen(false);
									}}
								>
									<div className="history-entry-label">
										{truncateText(displayText)}
									</div>
								</div>
							);
						})
					)}
				</div>

				{helpEntries.length > 0 && (
					<div className="history-panel-footer">
						<button
							className="history-clear-button"
							onClick={clearHistory}
						>
							{localize('helpHistory.clearAll', "Clear all")}
						</button>
					</div>
				)}
			</div>
		)}
		</>
	);
};
