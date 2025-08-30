/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './helpSearchWidget.css';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { localize } from '../../../../../nls.js';
import { IHelpSearchResult } from '../erdosHelpSearchService.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';

export interface HelpSearchWidgetProps {
	placeholder?: string;
	className?: string;
	variant?: 'home' | 'actionbar';
	onTopicSelected?: (topic: string, languageId: string) => void;
	autoFocus?: boolean;
}

export const HelpSearchWidget: React.FC<HelpSearchWidgetProps> = ({
	placeholder = localize('helpSearch.placeholder', "Search help topics..."),
	className = '',
	variant = 'home',
	onTopicSelected,
	autoFocus = false
}) => {
	const services = useErdosReactServicesContext();
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<IHelpSearchResult[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const [isLoading, setIsLoading] = useState(false);
	const [showDropdown, setShowDropdown] = useState(false);
	const [focused, setFocused] = useState(false);
	const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
	const [runtimesVersion, setRuntimesVersion] = useState(0);
	
	const inputRef = useRef<HTMLInputElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const searchTimeoutRef = useRef<number>();
	const currentSearchRef = useRef<AbortController | null>(null);

	// Listen for runtime registration changes
	React.useEffect(() => {
		const disposable = services.languageRuntimeService.onDidRegisterRuntime(() => {
			setRuntimesVersion(prev => prev + 1);
		});
		return () => disposable.dispose();
	}, [services.languageRuntimeService]);

	// Get available language runtimes
	const availableLanguages = React.useMemo(() => {
		return services.erdosHelpSearchService.getActiveHelpRuntimes();
	}, [services.erdosHelpSearchService, runtimesVersion]);

	// Toggle language filter
	const toggleLanguageFilter = (languageId: string) => {
		setSelectedLanguages(prev => {
			const newSet = new Set(prev);
			if (newSet.has(languageId)) {
				newSet.delete(languageId);
			} else {
				newSet.add(languageId);
			}
			return newSet;
		});
	};

	// Filter and sort results by topic name, maintaining language information
	const sortedResults = React.useMemo(() => {
		let filteredResults = results;
		
		// Filter by selected languages if any are selected
		if (selectedLanguages.size > 0) {
			filteredResults = results.filter(result => selectedLanguages.has(result.languageId));
		}
		
		// Return filtered results in their original order (preserving backend ranking)
		return filteredResults;
	}, [results, selectedLanguages]);

	// Focus input on mount if autoFocus is true
	useEffect(() => {
		if (autoFocus && inputRef.current) {
			inputRef.current.focus();
		}
	}, [autoFocus]);

	// Debounced search function with proper request cancellation
	const performSearch = useCallback(async (searchQuery: string) => {
		if (!searchQuery.trim()) {
			setResults([]);
			setShowDropdown(false);
			return;
		}

		// Cancel any previous search request
		if (currentSearchRef.current) {
			currentSearchRef.current.abort();
		}

		// Create new AbortController for this search
		const abortController = new AbortController();
		currentSearchRef.current = abortController;

		setIsLoading(true);
		
		try {
			const searchResults = await services.erdosHelpSearchService.searchAllRuntimes(searchQuery);
			
			// Check if this request was cancelled
			if (abortController.signal.aborted) {
				return;
			}

			const limitedResults = searchResults.slice(0, 50); // Limit to 50 results like Rao
			setResults(limitedResults);
			setShowDropdown(limitedResults.length > 0);
			setSelectedIndex(-1);
		} catch (error) {
			// Don't log errors for cancelled requests
			if (!abortController.signal.aborted) {
				console.error('HelpSearchWidget.performSearch: Search failed:', error);
				setResults([]);
				setShowDropdown(false);
			}
		} finally {
			// Only clear loading if this request wasn't cancelled
			if (!abortController.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [services.erdosHelpSearchService]);

	// Handle input change with debouncing
	const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const newQuery = e.target.value;

		setQuery(newQuery);

		// Clear previous timeout
		if (searchTimeoutRef.current) {
			window.clearTimeout(searchTimeoutRef.current);
		}

		// Debounce search by 100ms for responsive feel
		searchTimeoutRef.current = window.setTimeout(() => {
			performSearch(newQuery);
		}, 100);

	}, [performSearch]);

	// Handle keyboard navigation
	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
		if (!showDropdown || sortedResults.length === 0) {
			return;
		}

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				setSelectedIndex(prev => (prev + 1) % sortedResults.length);
				break;
			case 'ArrowUp':
				e.preventDefault();
				setSelectedIndex(prev => prev <= 0 ? sortedResults.length - 1 : prev - 1);
				break;
			case 'Enter':
				e.preventDefault();
				if (selectedIndex >= 0 && selectedIndex < sortedResults.length) {
					const selectedResult = sortedResults[selectedIndex];
					handleTopicSelection(selectedResult.topic, selectedResult.languageId);
				}
				break;
			case 'Escape':
				e.preventDefault();
				setShowDropdown(false);
				setSelectedIndex(-1);
				break;
		}
	}, [showDropdown, sortedResults, selectedIndex]);

	// Handle topic selection
	const handleTopicSelection = useCallback((topic: string, languageId: string) => {

		setQuery(topic);
		setShowDropdown(false);
		setSelectedIndex(-1);
		
		if (onTopicSelected) {

			onTopicSelected(topic, languageId);
		} else {

			// Default behavior: show help topic
			services.commandService.executeCommand('erdos.help.showTopic', languageId, topic);
		}
	}, [onTopicSelected, services.commandService]);

	// Handle click outside to close dropdown
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setShowDropdown(false);
			}
		};

		if (showDropdown) {
			// Longer delay to ensure dropdown is fully rendered
			const timeoutId = setTimeout(() => {
				document.addEventListener('mousedown', handleClickOutside);
			}, 300);
			
			return () => {
				clearTimeout(timeoutId);
				document.removeEventListener('mousedown', handleClickOutside);
			};
		}
		
		return undefined;
	}, [showDropdown]);

	// Handle Escape key to close
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && showDropdown) {
				setShowDropdown(false);
				inputRef.current?.focus();
			}
		};

		if (showDropdown) {
			document.addEventListener('keydown', handleKeyDown);
			
			return () => {
				document.removeEventListener('keydown', handleKeyDown);
			};
		}
		
		return undefined;
	}, [showDropdown]);

	// Clean up timeout and abort controller on unmount
	useEffect(() => {
		return () => {
			if (searchTimeoutRef.current) {
				window.clearTimeout(searchTimeoutRef.current);
			}
			if (currentSearchRef.current) {
				currentSearchRef.current.abort();
			}
		};
	}, []);



	return (
		<div className={`help-search-widget ${variant} ${className}`} ref={dropdownRef}>
			<div className={`help-search-input-container ${focused ? 'focused' : ''}`}>
				<div className="help-search-icon">
					<span className={ThemeIcon.asClassName(Codicon.search)} />
				</div>
				<input
					ref={inputRef}
					type="text"
					className="help-search-input"
					placeholder={placeholder}
					value={query}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					onFocus={() => {
						setFocused(true);
						if (query.trim() && results.length > 0) {
							setShowDropdown(true);
						}
					}}
					onBlur={() => setFocused(false)}
					autoComplete="off"
					spellCheck={false}
					aria-label={localize('helpSearch.ariaLabel', "Search help topics")}
					aria-expanded={showDropdown}
					aria-haspopup="listbox"
					role="combobox"
				/>
				{isLoading && (
					<div className="help-search-loading">
						<span className={ThemeIcon.asClassName(Codicon.loading)} />
					</div>
				)}
				<div className="help-search-language-filters">
					{availableLanguages.map(language => {
						const isSelected = selectedLanguages.has(language.languageId);
						
						return (
							<button
								key={language.languageId}
								className={`help-search-language-filter ${isSelected ? 'selected' : ''} ${!language.isActive ? 'inactive' : ''}`}
								onClick={() => language.isActive && toggleLanguageFilter(language.languageId)}
								title={language.isActive ? `Filter to ${language.languageName} only` : `${language.languageName} is not active`}
								aria-label={language.isActive ? `Filter to ${language.languageName} only` : `${language.languageName} is not active`}
								aria-pressed={isSelected}
								disabled={!language.isActive}
							>
								{language.base64EncodedIconSvg ? (
									<img 
										className="help-search-language-icon"
										src={`data:image/svg+xml;base64,${language.base64EncodedIconSvg}`}
										alt={`${language.languageName} icon`}
									/>
								) : (
									<span className={ThemeIcon.asClassName(
										language.languageId === 'r' ? Codicon.circleFilled : 
										language.languageId === 'python' ? Codicon.triangleUp : Codicon.circle
									)} />
								)}
							</button>
						);
					})}
				</div>
			</div>

			{showDropdown && (
				<div className="help-search-dropdown" role="listbox">
					{sortedResults.length === 0 ? (
						<div className="help-search-no-results">
							{localize('helpSearch.noResults', "No help topics found")}
						</div>
					) : (
						sortedResults.map((result, index) => {
							const isSelected = index === selectedIndex;
							return (
								<div
									key={`${result.languageId}-${result.topic}`}
									className={`help-search-item ${isSelected ? 'selected' : ''}`}
									onClick={() => handleTopicSelection(result.topic, result.languageId)}
									onMouseEnter={() => setSelectedIndex(index)}
									role="option"
									aria-selected={isSelected}
								>
									<span className="help-search-topic">
										{result.languageName}: {result.topic}
									</span>
								</div>
							);
						})
					)}
				</div>
			)}
		</div>
	);
};
