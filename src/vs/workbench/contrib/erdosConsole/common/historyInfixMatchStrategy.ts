/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInputHistoryEntry } from '../../../services/executionHistory/common/executionHistoryService.js';
import { HistoryMatch, HistoryMatchStrategy } from './historyMatchStrategy.js';

export class HistoryInfixMatchStrategy extends HistoryMatchStrategy {
	constructor(protected readonly _entries: Array<IInputHistoryEntry>) {
		super();
	}

	override getMatches(input: string): HistoryMatch[] {
		const matches: HistoryMatch[] = [];
		let previousInput = '';
		for (const entry of this._entries) {
			if (entry.input === previousInput ||
				entry.input === matches[matches.length - 1]?.input) {
				continue;
			}
			if (input.length > 0) {
				const matchIdx = entry.input.indexOf(input);
				if (matchIdx >= 0) {
					const match: HistoryMatch = {
						input: entry.input,
						highlightStart: matchIdx,
						highlightEnd: matchIdx + input.length
					};
					matches.push(match);
				}
			} else {
				const match: HistoryMatch = {
					input: entry.input,
					highlightStart: 0,
					highlightEnd: 0
				};
				matches.push(match);
			}
			previousInput = entry.input;
		}
		return matches;
	}
}