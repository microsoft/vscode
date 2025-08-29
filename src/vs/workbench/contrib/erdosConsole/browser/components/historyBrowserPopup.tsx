/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './historyBrowserPopup.css';

import React, { useEffect } from 'react';

import * as nls from '../../../../../nls.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { HistoryCompletionItem } from './historyCompletionItem.js';
import { HistoryMatch } from '../../common/historyMatchStrategy.js';

export interface HistoryBrowserPopupProps {
	items: HistoryMatch[];
	selectedIndex: number;
	bottomPx: number;
	leftPx: number;
	onSelected: (index: number) => void;
	onDismissed: () => void;
}

export const HistoryBrowserPopup = (props: HistoryBrowserPopupProps) => {
	const popupRef = React.useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (popupRef.current) {
			const selectedChild = popupRef.current.querySelector('.selected');
			if (selectedChild) {
				selectedChild.scrollIntoView();
			}
		}

		const clickHandler = (ev: MouseEvent) => {
			const target = ev.target as HTMLElement;
			const popup = popupRef.current;
			if (popup && popup.contains(target)) {
				return;
			}
			props.onDismissed();
		};

		DOM.getActiveWindow().addEventListener('click', clickHandler);
		return () => {
			DOM.getActiveWindow().removeEventListener('click', clickHandler);
		};
	}, [props, props.selectedIndex]);

	const noMatch = nls.localize('positronConsoleHistoryMatchesEmpty', "No matching history items");

	return <div ref={popupRef} className='suggest-widget history-browser-popup'
		style={{ bottom: props.bottomPx, left: props.leftPx }}>
		{props.items.length === 0 && <div className='no-results'>{noMatch}</div>}
		{props.items.length > 0 &&
			<ul>
				{props.items.map((item, index) => {
					const onSelected = () => {
						props.onSelected(index);
					};
					return <HistoryCompletionItem
						key={index}
						match={item}
						selected={props.selectedIndex === index}
						onSelected={onSelected} />;
				})}
			</ul>
		}
	</div>;
};
