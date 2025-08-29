/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './historyCompletionItem.css';

import React from 'react';

import { HistoryMatch } from '../../common/historyMatchStrategy.js';

export interface HistoryCompletionItemProps {
	readonly match: HistoryMatch;
	readonly selected: boolean;
	readonly onSelected: () => void;
}

export const HistoryCompletionItem = (props: HistoryCompletionItemProps) => {
	const match = props.match;
	const preMatch = match.input.substring(0, match.highlightStart);
	const inMatch = match.input.substring(match.highlightStart, match.highlightEnd);
	const postMatch = match.input.substring(match.highlightEnd);
	return <li className={'history-completion-item' + (props.selected ? ' selected' : '')}>
		<a href='#' onClick={props.onSelected}>
			<span className='unmatched'>{preMatch}</span>
			<span className='matched'>{inMatch}</span>
			<span className='unmatched'>{postMatch}</span>
		</a>
	</li>;
};
