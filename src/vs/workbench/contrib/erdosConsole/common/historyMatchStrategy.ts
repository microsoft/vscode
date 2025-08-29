/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

export interface HistoryMatch {
	input: string;
	highlightStart: number;
	highlightEnd: number;
}

export abstract class HistoryMatchStrategy {
	abstract getMatches(input: string): HistoryMatch[];
}

export class EmptyHistoryMatchStrategy extends HistoryMatchStrategy {
	override getMatches(input: string): HistoryMatch[] {
		return [];
	}
}
