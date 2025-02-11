/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuzzyScore } from '../../../../base/common/filters.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

export interface ISimpleCompletion {
	/**
	 * The completion's label which appears on the left beside the icon.
	 */
	label: string;

	/**
	 * The ID of the provider the completion item came from
	 */
	provider: string;

	/**
	 * The completion's icon to show on the left of the suggest widget.
	 */
	icon?: ThemeIcon;

	/**
	 * The completion's detail which appears on the right of the list.
	 */
	detail?: string;

	/**
	 * A human-readable string that represents a doc-comment.
	 */
	documentation?: string | MarkdownString;

	/**
	 * The start of the replacement.
	 */
	replacementIndex: number;

	/**
	 * The length of the replacement.
	 */
	replacementLength: number;
}

export class SimpleCompletionItem {
	/**
	 * The lowercase label, normalized to `\` path separators on Windows.
	 */
	labelLow: string;

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
