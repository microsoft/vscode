/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './TopicSearchInput.css';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { localize } from '../../../../../nls.js';
import { IDocumentationMatch } from '../topicQueryService.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';

export interface TopicSearchInputProps {
	placeholder?: string;
	className?: string;
	variant?: 'home' | 'actionbar';
	onTopicSelected?: (topic: string, languageId: string) => void;
	autoFocus?: boolean;
}

export const TopicSearchInput: React.FC<TopicSearchInputProps> = ({
	placeholder = localize('helpSearch.placeholder', "Search help topics..."),
	className = '',
	variant = 'home',
	onTopicSelected,
	autoFocus = false
}) => {
	const services = useErdosReactServicesContext();
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<IDocumentationMatch[]>([]);
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

	React.useEffect(() => {
		const disposable = services.languageRuntimeService.onDidRegisterRuntime(() => {
			setRuntimesVersion(prev => prev + 1);
		});
		return () => disposable.dispose();
	}, [services.languageRuntimeService]);

	const availableLanguages = React.useMemo(() => {
		return services.topicQueryService.getAvailableLanguageRuntimes();
	}, [services.topicQueryService, runtimesVersion]);

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

	const sortedResults = React.useMemo(() => {
		let filteredResults = results;

		if (selectedLanguages.size > 0) {
			filteredResults = results.filter(result => selectedLanguages.has(result.languageId));
		}

		return filteredResults;
	}, [results, selectedLanguages]);

	useEffect(() => {
		if (autoFocus && inputRef.current) {
			inputRef.current.focus();
		}
	}, [autoFocus]);

	const performSearch = useCallback(async (searchQuery: string) => {
		if (!searchQuery.trim()) {
			setResults([]);
			setShowDropdown(false);
			return;
		}

		if (currentSearchRef.current) {
			currentSearchRef.current.abort();
		}

		const abortController = new AbortController();
		currentSearchRef.current = abortController;

		setIsLoading(true);
		
		try {
			const searchResults = await services.topicQueryService.queryAllLanguages(searchQuery);
			
			if (abortController.signal.aborted) {
				return;
			}

			const limitedResults = searchResults.slice(0, 50);
			setResults(limitedResults);
			setShowDropdown(limitedResults.length > 0);
			setSelectedIndex(-1);
		} catch (error) {
			if (!abortController.signal.aborted) {
				console.error('HelpSearchWidget.performSearch: Search failed:', error);
				setResults([]);
				setShowDropdown(false);
			}
		} finally {
			if (!abortController.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [services.topicQueryService]);

	const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const newQuery = e.target.value;

		setQuery(newQuery);

		if (searchTimeoutRef.current) {
			window.clearTimeout(searchTimeoutRef.current);
		}

		searchTimeoutRef.current = window.setTimeout(() => {
			performSearch(newQuery);
		}, 100);
	}, [performSearch]);

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

	const handleTopicSelection = useCallback((topic: string, languageId: string) => {
		setQuery(topic);
		setShowDropdown(false);
		setSelectedIndex(-1);

		if (onTopicSelected) {
			onTopicSelected(topic, languageId);
		} else {
			services.commandService.executeCommand('erdos.help.showTopic', languageId, topic);
		}
	}, [onTopicSelected, services.commandService]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setShowDropdown(false);
			}
		};

		if (showDropdown) {
			// Position the dropdown
			if (dropdownRef.current && inputRef.current) {
				const inputRect = inputRef.current.getBoundingClientRect();
				const dropdown = dropdownRef.current.querySelector('.help-search-dropdown') as HTMLElement;
				if (dropdown) {
					dropdown.style.top = `${inputRect.bottom + 4}px`;
					dropdown.style.left = `${inputRect.left}px`;
					dropdown.style.width = `${Math.max(inputRect.width, 280)}px`;
				}
			}

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
		<div 
			className={`help-search-widget ${variant} ${className}`} 
			ref={dropdownRef}
			onClick={(e) => {
				e.stopPropagation(); // Prevent ViewPane's preventDefault from blocking input focus
			}}
		>
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
					onMouseDown={(e) => {
						e.stopPropagation(); // Prevent ViewPane's preventDefault from blocking focus
					}}
					onClick={(e) => {
						e.stopPropagation(); // Prevent ViewPane's preventDefault from blocking focus
					}}
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
								className={`help-search-language-filter ${isSelected ? 'selected' : ''}`}
								onClick={() => toggleLanguageFilter(language.languageId)}
								title={`Filter to ${language.languageName} only`}
								aria-label={`Filter to ${language.languageName} only`}
								aria-pressed={isSelected}
							>
								{language.base64EncodedIconSvg && (
									<img 
										className="help-search-language-icon"
										src={`data:image/svg+xml;base64,${language.base64EncodedIconSvg}`}
										alt={`${language.languageName} icon`}
									/>
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
