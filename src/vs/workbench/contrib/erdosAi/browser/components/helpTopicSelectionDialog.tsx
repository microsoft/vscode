/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';

interface HelpTopicSelectionDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSelectTopic: (topic: string, name?: string) => void;
}

// Common R help topics organized by category
const HELP_TOPIC_CATEGORIES = {
	'Data Manipulation': ['data.frame', 'dplyr', 'tidyr', 'reshape2', 'merge', 'subset'],
	'Visualization': ['ggplot2', 'plot', 'hist', 'boxplot', 'scatter.smooth', 'lattice'],
	'Statistics': ['lm', 'glm', 'aov', 't.test', 'cor', 'summary'],
	'Data Import/Export': ['read.csv', 'write.csv', 'readr', 'haven', 'xlsx'],
	'String Processing': ['stringr', 'gsub', 'grep', 'paste', 'sprintf'],
	'Date/Time': ['lubridate', 'as.Date', 'strptime', 'Sys.Date'],
	'Functional Programming': ['apply', 'lapply', 'purrr', 'map', 'filter'],
	'Package Management': ['install.packages', 'library', 'require', 'devtools']
} as const;

/**
 * Dialog for selecting help topics to attach as context
 * Based on Erdos's help topic patterns (legacy help system removed)
 */
export const HelpTopicSelectionDialog: React.FC<HelpTopicSelectionDialogProps> = ({
	isOpen,
	onClose,
	onSelectTopic
}) => {
	const [topic, setTopic] = useState('');
	const [selectedCategory, setSelectedCategory] = useState<string>('Data Manipulation');
	const [searchQuery, setSearchQuery] = useState('');
	const dialogRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Get all topics from all categories for search
	const allTopics = Object.values(HELP_TOPIC_CATEGORIES).flat();
	
	// Filter topics based on search query
	const filteredTopics = searchQuery.trim() 
		? allTopics.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
		: HELP_TOPIC_CATEGORIES[selectedCategory as keyof typeof HELP_TOPIC_CATEGORIES] || [];

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
			// Focus the input when dialog opens
			setTimeout(() => {
				inputRef.current?.focus();
			}, 100);
			return () => {
				document.removeEventListener('mousedown', handleClickOutside);
				document.removeEventListener('keydown', handleEscape);
			};
		}
		
		return undefined;
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (topic.trim()) {
			onSelectTopic(topic.trim());
			onClose();
		}
	};

	const handleTopicClick = (topicName: string) => {
		onSelectTopic(topicName);
		onClose();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleSubmit(e);
		}
	};

	return (
		<div className="help-topic-selection-overlay">
			<div ref={dialogRef} className="help-topic-selection-dialog">
				<div className="help-topic-selection-header">
					<h3>Select Help Topic to Attach</h3>
					<button 
						className="close-button" 
						onClick={onClose}
						title="Close"
					>
						×
					</button>
				</div>
				
				<form onSubmit={handleSubmit}>
					<div className="help-topic-selection-input">
						<label htmlFor="topic-input">Help Topic:</label>
						<input
							ref={inputRef}
							id="topic-input"
							type="text"
							className="help-topic-input"
							placeholder="Enter function name or topic (e.g., data.frame, ggplot)"
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
							onKeyDown={handleKeyDown}
						/>
						<div className="help-text">
							Enter the name of an R function, package, or help topic you want to include as context.
						</div>
					</div>

					<div className="help-topic-browser">
						<div className="topic-search-section">
							<label htmlFor="search-input">Search Topics:</label>
							<input
								id="search-input"
								type="text"
								className="topic-search-input"
								placeholder="Search help topics..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>

						{!searchQuery.trim() && (
							<div className="category-selector">
								<label htmlFor="category-select">Category:</label>
								<select
									id="category-select"
									className="category-select"
									value={selectedCategory}
									onChange={(e) => setSelectedCategory(e.target.value)}
								>
									{Object.keys(HELP_TOPIC_CATEGORIES).map(category => (
										<option key={category} value={category}>
											{category}
										</option>
									))}
								</select>
							</div>
						)}
						
						<div className="topics-section">
							<h4>{searchQuery.trim() ? 'Search Results:' : `${selectedCategory} Topics:`}</h4>
							<div className="topics-grid">
								{filteredTopics.map(topicName => (
									<button
										key={topicName}
										type="button"
										className="topic-button"
										onClick={() => handleTopicClick(topicName)}
									>
										{topicName}
									</button>
								))}
								{filteredTopics.length === 0 && (
									<div className="no-topics">
										{searchQuery.trim() ? 'No topics found.' : 'No topics in this category.'}
									</div>
								)}
							</div>
						</div>
					</div>
					
					<div className="help-topic-selection-footer">
						<button 
							type="button"
							className="cancel-button" 
							onClick={onClose}
						>
							Cancel
						</button>
						<button 
							type="submit"
							className="attach-button"
							disabled={!topic.trim()}
						>
							Attach Help Topic
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
