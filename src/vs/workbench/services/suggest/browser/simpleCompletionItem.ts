/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuzzyScore } from 'vs/base/common/filters';
import { isWindows } from 'vs/base/common/platform';
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
	 * Whether the completion is a file. Files with the same score will be sorted against each other
	 * first by extension length and then certain extensions will get a boost based on the OS.
	 */
	isFile?: boolean;
	/**
	 * Whether the completion is a directory.
	 */
	isDirectory?: boolean;
}

export class SimpleCompletionItem {
	// perf
	readonly labelLow: string;
	readonly labelLowExcludeFileExt: string;
	readonly fileExtLow: string = '';

	// sorting, filtering
	score: FuzzyScore = FuzzyScore.Default;
	idx?: number;
	word?: string;

	constructor(
		readonly completion: ISimpleCompletion
	) {
		// ensure lower-variants (perf)
		this.labelLow = this.completion.label.toLowerCase();
		this.labelLowExcludeFileExt = this.labelLow;
		if (completion.isFile) {
			if (isWindows) {
				this.labelLow = this.labelLow.replaceAll('/', '\\');
			}
			const extIndex = this.labelLow.lastIndexOf('.');
			if (extIndex !== -1) {
				this.labelLowExcludeFileExt = this.labelLow.substring(0, extIndex);
				this.fileExtLow = this.labelLow.substring(extIndex + 1);
			}
		}
	}
}
