/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FuzzyScore } from '../../../../base/common/filters.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { basename } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
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
	 * Whether the completion is a file. Files with the same score will be sorted against each other
	 * first by extension length and then certain extensions will get a boost based on the OS.
	 */
	isFile?: boolean;
	/**
	 * Whether the completion is a directory.
	 */
	isDirectory?: boolean;
	/**
	 * Whether the completion is a keyword.
	 */
	isKeyword?: boolean;

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
	readonly labelLow: string;

	/**
	 * {@link labelLow} without the file extension.
	 */
	readonly labelLowExcludeFileExt: string;

	/**
	 * The lowercase label, when the completion is a file or directory this has  normalized path
	 * separators (/) on Windows and no trailing separator for directories.
	 */
	readonly labelLowNormalizedPath: string;

	/**
	 * A penalty that applies to files or folders starting with the underscore character.
	 */
	readonly underscorePenalty: 0 | 1 = 0;

	/**
	 * The file extension part from {@link labelLow}.
	 */
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
		this.labelLowNormalizedPath = this.labelLow;

		if (completion.isFile) {
			if (isWindows) {
				this.labelLow = this.labelLow.replaceAll('/', '\\');
			}
			// Don't include dotfiles as extensions when sorting
			const extIndex = this.labelLow.lastIndexOf('.');
			if (extIndex > 0) {
				this.labelLowExcludeFileExt = this.labelLow.substring(0, extIndex);
				this.fileExtLow = this.labelLow.substring(extIndex + 1);
			}
		}

		if (completion.isFile || completion.isDirectory) {
			if (isWindows) {
				this.labelLowNormalizedPath = this.labelLow.replaceAll('\\', '/');
			}
			if (completion.isDirectory) {
				this.labelLowNormalizedPath = this.labelLowNormalizedPath.replace(/\/$/, '');
			}
			this.underscorePenalty = basename(this.labelLowNormalizedPath).startsWith('_') ? 1 : 0;
		}
	}
}
