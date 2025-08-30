/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './helpWelcomePage.css';

import React from 'react';
import { localize } from '../../../../../nls.js';
import { HelpSearchWidget } from './helpSearchWidget.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

export interface HelpWelcomePageProps {
	onTopicSelected?: (topic: string, languageId: string) => void;
}

export const HelpWelcomePage: React.FC<HelpWelcomePageProps> = ({
	onTopicSelected
}) => {
	const services = useErdosReactServicesContext();

	const handleTopicSelection = (topic: string, languageId: string) => {
		if (onTopicSelected) {
			onTopicSelected(topic, languageId);
		} else {
			services.commandService.executeCommand('erdos.help.showTopic', languageId, topic);
		}
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
					<HelpSearchWidget
						variant="home"
						placeholder={localize('helpWelcome.searchPlaceholder', "Search help topics ('print', 'data.frame', 'numpy.array')...")}
						onTopicSelected={handleTopicSelection}
						autoFocus={true}
					/>
				</div>

			</div>
		</div>
	);
};
