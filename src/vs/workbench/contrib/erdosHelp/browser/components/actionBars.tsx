/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './actionBars.css';

import React, { PropsWithChildren, useEffect, useState, useRef } from 'react';

import { localize } from '../../../../../nls.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IReactComponentContainer } from '../../../../../base/browser/erdosReactRenderer.js';
import { ErdosActionBar } from '../../../../../platform/erdosActionBar/browser/erdosActionBar.js';
import { ActionBarButton } from '../../../../../platform/erdosActionBar/browser/components/actionBarButton.js';
import { ActionBarRegion } from '../../../../../platform/erdosActionBar/browser/components/actionBarRegion.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ErdosActionBarContextProvider } from '../../../../../platform/erdosActionBar/browser/erdosActionBarContext.js';
import { HelpSearchWidget } from './helpSearchWidget.js';

const kPaddingLeft = 8;
const kPaddingRight = 8;

const tooltipPreviousTopic = localize('erdosPreviousTopic', "Previous topic");
const tooltipNextTopic = localize('erdosNextTopic', "Next topic");
const tooltipShowErdosHelp = localize('erdosShowErdosHelp', "Show Erdos help");
const tooltipHelpHistory = localize('erdosHelpHistory', "Help history");


const truncateText = (text: string, maxLength: number = 50): string => {
	if (text.length <= maxLength) {
		return text;
	}
	return text.substring(0, maxLength - 3) + '...';
};

interface HelpHistoryDropdownProps {
	isOpen: boolean;
	onClose: () => void;
	onSelectEntry: (entryIndex: number) => void;
	buttonRef: React.RefObject<HTMLButtonElement>;
	currentTitle: string;
}

const HelpHistoryDropdown = (props: HelpHistoryDropdownProps) => {
	const services = useErdosReactServicesContext();
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [searchQuery, setSearchQuery] = useState('');

	const helpEntries = services.erdosHelpService.helpEntries || [];
	const currentHelpEntry = services.erdosHelpService.currentHelpEntry;

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
				props.buttonRef.current && !props.buttonRef.current.contains(event.target as Node)) {
				props.onClose();
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				props.onClose();
			}
		};

		if (props.isOpen) {
			// Longer delay to ensure dropdown is fully rendered
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
	}, [props.isOpen, props.onClose, props.buttonRef]);

	useEffect(() => {
		if (props.isOpen && dropdownRef.current && props.buttonRef.current) {
			const buttonRect = props.buttonRef.current.getBoundingClientRect();
			const dropdown = dropdownRef.current;
			
			dropdown.style.position = 'fixed';
			dropdown.style.top = `${buttonRect.bottom + 4}px`;
			dropdown.style.left = `${buttonRect.left}px`;
			dropdown.style.minWidth = `${Math.max(buttonRect.width, 280)}px`;
		}
	}, [props.isOpen, props.buttonRef]);

	if (!props.isOpen) return null;

	const filteredEntries = helpEntries.filter(entry => {
		const title = entry.title || entry.sourceUrl || '';
		return title.toLowerCase().includes(searchQuery.toLowerCase());
	});

	const clearHistory = () => {
		services.erdosHelpService.clearHistory();
		props.onClose();
	};

	return (
		<div ref={dropdownRef} className="help-history-dropdown">
			<div className="help-history-header">
				<input
					type="text"
					className="help-history-search"
					placeholder="Search help history..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					autoFocus
				/>
			</div>
			
			<div className="help-history-list">
				{filteredEntries.length === 0 ? (
					<div className="help-history-item help-history-empty">
						{searchQuery ? 'No entries match your search.' : 'No help history found.'}
					</div>
				) : (
					filteredEntries.map((entry, index) => {
						const actualIndex = helpEntries.indexOf(entry);
						const title = entry.title || entry.sourceUrl || 'Untitled';
						const isCurrentEntry = entry === currentHelpEntry;
						
						return (
							<div
								key={actualIndex}
								className={`help-history-item ${isCurrentEntry ? 'current' : ''}`}
								onClick={() => props.onSelectEntry(actualIndex)}
							>
								<div className="help-history-name">
									{truncateText(title)}
								</div>
							</div>
						);
					})
				)}
			</div>

			{helpEntries.length > 0 && (
				<div className="help-history-footer">
					<button
						className="help-history-delete-all-btn"
						onClick={clearHistory}
					>
						Clear all
					</button>
				</div>
			)}
		</div>
	);
};

export interface ActionBarsProps {
	reactComponentContainer: IReactComponentContainer;
	onHome: () => void;
}

export const ActionBars = (props: PropsWithChildren<ActionBarsProps>) => {
	const services = useErdosReactServicesContext();

	const [canNavigateBackward, setCanNavigateBackward] = useState(services.erdosHelpService.canNavigateBackward);
	const [canNavigateForward, setCanNavigateForward] = useState(services.erdosHelpService.canNavigateForward);
	const [currentHelpEntry, setCurrentHelpEntry] = useState(services.erdosHelpService.currentHelpEntry);
	const [currentHelpTitle, setCurrentHelpTitle] = useState(services.erdosHelpService.currentHelpEntry?.title);
	const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
	
	const historyButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(props.reactComponentContainer.onSizeChanged(size => {
		}));

		disposableStore.add(
			services.erdosHelpService.onDidChangeCurrentHelpEntry((currentHelpEntry: any) => {
				setCurrentHelpEntry(currentHelpEntry);
				setCurrentHelpTitle(currentHelpEntry?.title);

				setCanNavigateBackward(services.erdosHelpService.canNavigateBackward);
				setCanNavigateForward(services.erdosHelpService.canNavigateForward);
			})
		);

		return () => disposableStore.dispose();
	}, [services.erdosHelpService, props.reactComponentContainer]);

	useEffect(() => {
		if (!currentHelpEntry) {
			return;
		}

		const disposableStore = new DisposableStore();

		disposableStore.add(currentHelpEntry.onDidChangeTitle(() => {
			setCurrentHelpTitle(currentHelpEntry.title);
		}));

		return () => disposableStore.dispose();
	}, [currentHelpEntry]);

	return (
		<div className='action-bars'>
			<ErdosActionBarContextProvider {...props}>
				<ErdosActionBar
					paddingLeft={kPaddingLeft}
					paddingRight={kPaddingRight}
				>
					<ActionBarRegion location='left'>
						<ActionBarButton
							ariaLabel={tooltipPreviousTopic}
							disabled={!canNavigateBackward}
							icon={ThemeIcon.fromId('arrow-left')}
							tooltip={tooltipPreviousTopic}
							onPressed={() => services.erdosHelpService.navigateBackward()}
						/>
						<ActionBarButton
							ariaLabel={tooltipNextTopic}
							disabled={!canNavigateForward}
							icon={ThemeIcon.fromId('arrow-right')}
							tooltip={tooltipNextTopic}
							onPressed={() => services.erdosHelpService.navigateForward()}
						/>

						<div className="vertical-divider-container">
							<div className="vertical-divider"></div>
						</div>

						<ActionBarButton
							ariaLabel={tooltipShowErdosHelp}
							disabled={props.onHome === undefined}
							icon={ThemeIcon.fromId('home')}
							tooltip={tooltipShowErdosHelp}
							onPressed={() => props.onHome()}
						/>

						<div className="vertical-divider-container">
							<div className="vertical-divider"></div>
						</div>

						<ActionBarButton
							ref={historyButtonRef}
							ariaLabel={tooltipHelpHistory}
							label={currentHelpTitle ? truncateText(currentHelpTitle) : localize('actionBar.home', "Home")}
							tooltip={tooltipHelpHistory}
							dropdownIndicator='enabled'
							onPressed={() => setShowHistoryDropdown(!showHistoryDropdown)}
						/>
					</ActionBarRegion>
					<ActionBarRegion location='right'>
						<HelpSearchWidget
							variant="actionbar"
							placeholder={localize('actionBar.searchPlaceholder', "Search help...")}
						/>
					</ActionBarRegion>
				</ErdosActionBar>
			</ErdosActionBarContextProvider>
			
			<HelpHistoryDropdown
				isOpen={showHistoryDropdown}
				onClose={() => setShowHistoryDropdown(false)}
				onSelectEntry={(entryIndex) => {
					services.erdosHelpService.openHelpEntryIndex(entryIndex);
					setShowHistoryDropdown(false);
				}}
				buttonRef={historyButtonRef}
				currentTitle={currentHelpTitle || ''}
			/>
		</div>
	);
};
