/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuzzyScore } from 'vs/base/common/filters';
import { ThemeIcon } from 'vs/base/common/themables';

export interface ISimpleCompletion {
	/**
	 * The completion's label which appears on the left beside the icon.
	 */
	label: string;
	/**
	 * The completion's icon to show on the left of the suggest widget.
	 */
	icon?: ThemeIcon;
	/**
	 * The completion's detail which appears on the right of the list.
	 */
	detail?: string;
	/**
	 * The completion's completion text which is used to actually insert the completion.
	 */
	completionText?: string;
}

export class SimpleCompletionItem {
	// perf
	readonly labelLow: string;

	// sorting, filtering
	score: FuzzyScore = FuzzyScore.Default;
	idx?: number;
	word?: string;

	constructor(
		readonly completion: ISimpleCompletion
	) {
		// ensure lower-variants (perf)
		this.labelLow = this.completion.label.toLowerCase();
	}
}
