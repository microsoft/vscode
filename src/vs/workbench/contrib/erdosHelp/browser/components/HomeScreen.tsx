/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './HomeScreen.css';

import React, { useState, useEffect } from 'react';
import { localize } from '../../../../../nls.js';
import { services } from '../../../../../base/browser/erdosReactServices.js';
import { TopicSearchInput } from './TopicSearchInput.js';
import { IHelpEntry } from '../topicViewContract.js';

export interface HomeScreenProps {
	onTopicSelected?: (topic: string, languageId: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
	onTopicSelected
}) => {	const [recentEntries, setRecentEntries] = useState<IHelpEntry[]>([]);

	useEffect(() => {
		const updateRecentEntries = () => {
			const allEntries = services.erdosHelpService.helpEntries;
			setRecentEntries(allEntries.slice(0, 5));
		};

		updateRecentEntries();

		const disposable = services.erdosHelpService.onDidChangeCurrentHelpEntry(() => {
			updateRecentEntries();
		});

		return () => disposable.dispose();
	}, [services.erdosHelpService]);

	const handleTopicSelection = (topic: string, languageId: string) => {
		if (onTopicSelected) {
			onTopicSelected(topic, languageId);
		} else {
			services.commandService.executeCommand('erdos.help.showTopic', languageId, topic);
		}
	};

	const handleHistoryItemClick = (index: number) => {
		services.erdosHelpService.openHelpEntryIndex(index);
	};

	const getTopicName = (entry: IHelpEntry): string => {
		if (entry.title && entry.title !== 'Erdos Help') {
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

	return (
		<div className="help-welcome-page">
			<div className="help-welcome-content">
				<div className="help-welcome-header">
					<h1 className="help-welcome-title">
						&nbsp;
					</h1>
					<p className="help-welcome-subtitle">
						{localize('helpWelcome.subtitle', "Search and browse documentation for R and Python")}
					</p>
				</div>

			<div className="help-welcome-search">
				<TopicSearchInput
					variant="home"
					placeholder={localize('helpWelcome.searchPlaceholder', "Search help topics ('print', 'data.frame', 'numpy.array')...")}
					onTopicSelected={handleTopicSelection}
					autoFocus={true}
				/>
			</div>

			{recentEntries.length > 0 && (
				<div className="recent-history-section">
					<div className="recent-history-list">
						{recentEntries.map((entry, index) => (
							<button
								key={`${entry.sessionId}-${entry.sourceUrl}-${index}`}
								className="recent-history-item"
								onClick={() => handleHistoryItemClick(index)}
								title={entry.sourceUrl}
							>
								<span className="history-item-title">{entry.languageName}: {getTopicName(entry)}</span>
							</button>
						))}
					</div>
				</div>
			)}

			</div>
		</div>
	);
};

