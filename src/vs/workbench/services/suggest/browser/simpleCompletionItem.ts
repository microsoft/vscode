/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuzzyScore } from '../../../../base/common/filters.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

export interface CompletionItemLabel {
	label: string;
	detail?: string;
	description?: string;
}

export interface ISimpleCompletion {
	/**
	 * The completion's label which appears on the left beside the icon.
	 */
	label: string | CompletionItemLabel;

	/**
	 * The ID of the provider the completion item came from
	 */
	provider: string;

	/**
	 * The completion's icon to show on the left of the suggest widget.
	 */
	icon?: ThemeIcon;

	/**
	 * The completion item's kind that will be included in the aria label.
	 */
	kindLabel?: string;

	/**
	 * The completion's detail which appears on the right of the list.
	 */
	detail?: string;

	/**
	 * A human-readable string that represents a doc-comment.
	 */
	documentation?: string | IMarkdownString;

	/**
	 * Replacement range (inclusive start, exclusive end) of text in the line to be replaced when
	 * this completion is applied.
	 */
	replacementRange: readonly [number, number] | undefined;
}

export class SimpleCompletionItem {
	/**
	 * The lowercase label, normalized to `\` path separators on Windows.
	 */
	labelLow: string;
	textLabel: string;

	// sorting, filtering
	score: FuzzyScore = FuzzyScore.Default;
	idx?: number;
	word?: string;

	// validation
	isInvalid: boolean = false;

	constructor(
		readonly completion: ISimpleCompletion
	) {
		// ensure lower-variants (perf)
		this.textLabel = typeof completion.label === 'string'
			? completion.label
			: completion.label?.label;
		this.labelLow = this.textLabel.toLowerCase();
	}
}
