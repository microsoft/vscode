/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { FuzzyScore } from 'vs/base/common/filters';

export interface ISimpleCompletion {
	/**
	 * The completion's label which appears on the left beside the icon.
	 */
	label: string;
	/**
	 * The completion's icon to show on the left of the suggest widget.
	 */
	icon?: Codicon;
	/**
	 * The completion's detail which appears on the right of the list.
	 */
	detail?: string;
}

export class SimpleCompletionItem {
	// perf
	readonly labelLow: string;

	// sorting, filtering
	score: FuzzyScore = FuzzyScore.Default;
	distance: number = 0;
	idx?: number;
	word?: string;

	constructor(
		readonly completion: ISimpleCompletion
	) {
		// ensure lower-variants (perf)
		this.labelLow = this.completion.label.toLowerCase();
	}
}
