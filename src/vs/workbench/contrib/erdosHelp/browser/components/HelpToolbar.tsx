/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './HelpToolbar.css';

import React, { useEffect, useState } from 'react';
import { localize } from '../../../../../nls.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IReactComponentContainer } from '../../../../../base/browser/erdosReactRenderer.js';
import { ErdosActionBar } from '../../../../../platform/erdosActionBar/browser/erdosActionBar.js';
import { ActionBarRegion } from '../../../../../platform/erdosActionBar/browser/components/actionBarRegion.js';
import { ActionBarButton } from '../../../../../platform/erdosActionBar/browser/components/actionBarButton.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ErdosActionBarContextProvider } from '../../../../../platform/erdosActionBar/browser/erdosActionBarContext.js';
import { NavigationControls } from './NavigationControls.js';
import { TopicHistoryPanel } from './TopicHistoryPanel.js';
import { TopicSearchInput } from './TopicSearchInput.js';

export interface HelpToolbarProps {
	reactComponentContainer: IReactComponentContainer;
}

export const HelpToolbar: React.FC<HelpToolbarProps> = (props) => {
	const services = useErdosReactServicesContext();
	const helpService = services.erdosHelpService;

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

	const getCurrentPageDisplay = (): string => {
		const entry = helpService.currentHelpEntry;
		if (!entry) {
			return localize('actionBar.home', "Home");
		}
		return `${entry.languageName}: ${getTopicName(entry)}`;
	};

	const [navigationState, setNavigationState] = useState({
		backEnabled: helpService.canNavigateBackward,
		forwardEnabled: helpService.canNavigateForward,
		currentTitle: getCurrentPageDisplay()
	});

	useEffect(() => {
		const subscriptions = new DisposableStore();

		subscriptions.add(
			helpService.onDidChangeCurrentHelpEntry(() => {
				setNavigationState({
					backEnabled: helpService.canNavigateBackward,
					forwardEnabled: helpService.canNavigateForward,
					currentTitle: getCurrentPageDisplay()
				});
			})
		);

		return () => subscriptions.dispose();
	}, [helpService]);

	const Divider = () => (
		<div className="toolbar-separator-wrapper">
			<div className="toolbar-separator"></div>
		</div>
	);

	return (
		<div className="help-toolbar">
			<ErdosActionBarContextProvider {...props}>
				<ErdosActionBar paddingLeft={8} paddingRight={8}>
					<ActionBarRegion location="left">
						<NavigationControls
							canBack={navigationState.backEnabled}
							canForward={navigationState.forwardEnabled}
							onBack={() => helpService.navigateBackward()}
							onForward={() => helpService.navigateForward()}
						/>
						<Divider />
						<ActionBarButton
							ariaLabel={localize('erdosShowErdosHelp', "Show Erdos help")}
							icon={ThemeIcon.fromId('home')}
							tooltip={localize('erdosShowErdosHelp', "Show Erdos help")}
							onPressed={() => helpService.showWelcomePage()}
						/>
						<Divider />
						<TopicHistoryPanel currentTitle={navigationState.currentTitle} />
					</ActionBarRegion>
					<ActionBarRegion location="right">
						<TopicSearchInput variant="actionbar" />
					</ActionBarRegion>
				</ErdosActionBar>
			</ErdosActionBarContextProvider>
		</div>
	);
};

